"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InvitationCompositionSchema,
  MOTION_PRESETS,
  SECTION_TYPES,
  type CompositionSection,
  type InvitationComposition,
  type SectionType,
} from "@/lib/composition/schema";
import { CULTURAL_PACKS } from "@/lib/composition/cultural-packs";
import { PALETTE_IDS } from "@/lib/composition/theme";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { EVENT_TYPES } from "@/lib/composition/event-types";
import { LOCALES } from "@/lib/i18n/translations";
import { assessPublicationReadiness, type PrivateFieldsForLeakCheck } from "@/lib/composition/readiness";
import { SectionEditor } from "./SectionEditor";
import { ReadinessPanel } from "./ReadinessPanel";
import { PreviewLinkPanel } from "./PreviewLinkPanel";

const inputClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-offset-1";

function defaultDataFor(type: SectionType): CompositionSection["data"] {
  switch (type) {
    case "opening":
      return { headline: "New headline" };
    case "greeting":
      return {};
    case "intro":
      return { title: "New section" };
    case "welcome":
      return { message: "We would be honored to have you join us." };
    case "story":
      return { body: "Our story, to be added." };
    case "schedule":
      return { entries: [{ id: `schedule-${Date.now().toString(36)}`, eventTypeId: null, label: "Event", value: "To be confirmed" }] };
    case "dateTime":
      return { eventDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 19) };
    case "venue":
      return { name: "Venue name" };
    case "mapLink":
      return { label: "Get directions", url: "https://maps.google.com" };
    case "dressCode":
      return { description: "Details to follow." };
    case "gallery":
      return { items: [{ id: `gallery-${Date.now().toString(36)}`, imageUrl: null, alt: "Describe this image", colorFallback: "#e2c07a" }] };
    case "rsvp":
      return {};
    case "music":
      return { src: null, title: null, credit: null, loop: false, startVolume: 0.6 };
    case "closing":
      return { message: "We can't wait to celebrate with you." };
    case "customText":
      return { body: "New text." };
  }
}

function newSectionId(type: string, existing: Set<string>): string {
  const base = type.replace(/([A-Z])/g, "-$1").toLowerCase();
  let id = base;
  let n = 2;
  while (existing.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

export function InvitationEditor({
  invitationId,
  slug,
  initialComposition,
  initialRevision,
  publishedAt,
  hasPreviewLink,
  privateFieldsForReadiness,
}: {
  invitationId: string;
  slug: string;
  initialComposition: unknown | null;
  initialRevision: number;
  publishedAt: string | null;
  hasPreviewLink: boolean;
  privateFieldsForReadiness: PrivateFieldsForLeakCheck | null;
}) {
  const parsedInitial = InvitationCompositionSchema.safeParse(initialComposition);
  const [draft, setDraft] = useState<InvitationComposition | null>(parsedInitial.success ? parsedInitial.data : null);
  const [revision, setRevision] = useState(initialRevision);
  // The JSON of the last successfully-saved draft — plain state, not a
  // ref: `dirty` below is derived from it during render, and reading a
  // ref's `.current` during render is unsound (React may not re-render
  // when only the ref changes). Updated only on a successful save/
  // initialize, never on every keystroke.
  const [lastSavedJson, setLastSavedJson] = useState<string | null>(parsedInitial.success ? JSON.stringify(parsedInitial.data) : null);
  const [saveState, setSaveState] = useState<"idle" | "working" | "saved" | "error" | "stale">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewReducedMotion, setPreviewReducedMotion] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [initPack, setInitPack] = useState<string>(Object.keys(CULTURAL_PACKS)[0]);
  const [addSectionType, setAddSectionType] = useState<SectionType>("customText");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const validation = useMemo(() => (draft ? InvitationCompositionSchema.safeParse(draft) : null), [draft]);
  const isValid = Boolean(validation?.success);
  const dirty = draft !== null && JSON.stringify(draft) !== lastSavedJson;

  const sectionErrors = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!validation || validation.success || !draft) return map;
    for (const issue of validation.error.issues) {
      const idx = issue.path[0] === "sections" && typeof issue.path[1] === "number" ? issue.path[1] : null;
      if (idx === null) continue;
      const list = map.get(idx) ?? [];
      list.push(issue.message);
      map.set(idx, list);
    }
    return map;
  }, [validation, draft]);

  const readiness = useMemo(() => assessPublicationReadiness(draft, privateFieldsForReadiness), [draft, privateFieldsForReadiness]);

  // "Protect against accidental navigation where reasonable."
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Live preview — debounced, sent to the iframe only once it has
  // announced itself ready, and only ever a schema-valid draft (or
  // `null`, which the preview frame renders as its own explicit
  // "doesn't validate" message rather than crashing).
  useEffect(() => {
    function handleReady(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === "envelope-admin-preview-ready") setPreviewReady(true);
    }
    window.addEventListener("message", handleReady);
    return () => window.removeEventListener("message", handleReady);
  }, []);

  useEffect(() => {
    if (!previewReady) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "envelope-admin-preview",
          composition: validation?.success ? validation.data : null,
          forceReducedMotion: previewReducedMotion,
        },
        window.location.origin
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [validation, previewReady, previewReducedMotion]);

  // Plain function, not useCallback — setDraft's own identity is already
  // stable (React guarantees this for every state setter), so wrapping
  // this in useCallback added a memoization dependency (React Compiler
  // flagged it) without any real benefit.
  function updateDraft(updater: (prev: InvitationComposition) => InvitationComposition) {
    setDraft((prev) => (prev ? updater(prev) : prev));
  }

  async function handleSave() {
    if (!draft || !isValid) return;
    setSaveState("working");
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/composition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          composition: draft,
          expectedRevision: revision,
          occasionId: draft.weddingContext?.occasionId ?? null,
          occasionCustomLabel: draft.weddingContext?.occasionCustomLabel ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveState(body.reason === "stale-revision" ? "stale" : "error");
        setSaveMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }

      setLastSavedJson(JSON.stringify(draft));
      setRevision(body.revision);
      setSaveState("saved");
      setSaveMessage("Saved.");
    } catch {
      setSaveState("error");
      setSaveMessage("Network error. Please try again.");
    }
  }

  async function handleInitializePack() {
    setSaveState("working");
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/initialize-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: initPack, expectedRevision: revision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveState("error");
        setSaveMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }
      setDraft(body.composition);
      setLastSavedJson(JSON.stringify(body.composition));
      setRevision(body.revision);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setSaveMessage("Network error. Please try again.");
    }
  }

  if (!draft) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center">
        <h2 className="font-display text-xl">This invitation has no composition yet</h2>
        <p className="mt-2 text-sm text-ink-soft">Initialize it from a trusted design pack to start editing.</p>
        <div className="mx-auto mt-4 max-w-xs">
          <select value={initPack} onChange={(e) => setInitPack(e.target.value)} className={inputClass}>
            {Object.values(CULTURAL_PACKS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button onClick={handleInitializePack} className="mt-3 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft">
            Initialize composition
          </button>
        </div>
        {saveMessage && <p className="mt-3 text-xs text-red-500">{saveMessage}</p>}
      </div>
    );
  }

  const usedSectionIds = new Set(draft.sections.map((s) => s.id));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        {saveState === "stale" && (
          <div role="alert" className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Someone else saved a newer version of this invitation.</p>
            <p className="mt-1 text-xs">Your changes here were NOT saved, to avoid overwriting theirs. Reload to see the latest version before continuing.</p>
            <button onClick={() => window.location.reload()} className="mt-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white">
              Reload latest version
            </button>
          </div>
        )}

        <section className="rounded-2xl border border-line bg-paper-raised p-6">
          <h2 className="font-display text-xl">Invitation settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Design pack</span>
              <div className="mt-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-soft">
                {CULTURAL_PACKS[draft.designPackId as keyof typeof CULTURAL_PACKS]?.label ?? draft.designPackId}
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Event category</span>
              <select
                className={inputClass}
                value={draft.eventCategory}
                onChange={(e) => updateDraft((prev) => ({ ...prev, eventCategory: e.target.value as InvitationComposition["eventCategory"] }))}
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Palette</span>
              <select
                className={inputClass}
                value={draft.themeTokens.paletteId}
                onChange={(e) => updateDraft((prev) => ({ ...prev, themeTokens: { ...prev.themeTokens, paletteId: e.target.value as InvitationComposition["themeTokens"]["paletteId"] } }))}
              >
                {PALETTE_IDS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Locale</span>
              <select className={inputClass} value={draft.locale} onChange={(e) => updateDraft((prev) => ({ ...prev, locale: e.target.value as InvitationComposition["locale"] }))}>
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Text direction</span>
              <select className={inputClass} value={draft.dir} onChange={(e) => updateDraft((prev) => ({ ...prev, dir: e.target.value as InvitationComposition["dir"] }))}>
                <option value="ltr">Left-to-right</option>
                <option value="rtl">Right-to-left</option>
                <option value="auto">Auto</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.featureConfig.motion}
                onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, motion: e.target.checked } }))}
              />
              Motion enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.featureConfig.openingBurst}
                onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, openingBurst: e.target.checked } }))}
              />
              Opening burst
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.featureConfig.envelopeOpening}
                onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, envelopeOpening: e.target.checked } }))}
              />
              Envelope opening
            </label>
            <label className="flex items-center gap-2">
              Ambient motif
              <select
                className="rounded-lg border border-line bg-paper px-2 py-1 text-sm"
                value={draft.featureConfig.ambientMotif}
                onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, ambientMotif: e.target.value as InvitationComposition["featureConfig"]["ambientMotif"] } }))}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="full">Full</option>
              </select>
            </label>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.weddingContext !== null}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    weddingContext: e.target.checked ? { occasionId: null, occasionCustomLabel: null, culturalPackId: prev.designPackId } : null,
                  }))
                }
              />
              This is part of a multi-event wedding with a specific occasion
            </label>
            {draft.weddingContext && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Occasion</span>
                  <select
                    className={inputClass}
                    value={draft.weddingContext.occasionId ?? ""}
                    onChange={(e) =>
                      updateDraft((prev) =>
                        prev.weddingContext
                          ? { ...prev, weddingContext: { ...prev.weddingContext, occasionId: (e.target.value || null) as (typeof EVENT_TYPES)[number]["id"] | null } }
                          : prev
                      )
                    }
                  >
                    <option value="">—</option>
                    {EVENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.weddingContext.occasionId === "custom" && (
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Custom occasion label</span>
                    <input
                      className={inputClass}
                      value={draft.weddingContext.occasionCustomLabel ?? ""}
                      onChange={(e) =>
                        updateDraft((prev) => (prev.weddingContext ? { ...prev, weddingContext: { ...prev.weddingContext, occasionCustomLabel: e.target.value || null } } : prev))
                      }
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Sections</h2>
            <div className="flex items-center gap-2">
              <select value={addSectionType} onChange={(e) => setAddSectionType(e.target.value as SectionType)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs">
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    sections: [
                      ...prev.sections,
                      {
                        id: newSectionId(addSectionType, usedSectionIds),
                        type: addSectionType,
                        enabled: true,
                        motionPreset: MOTION_PRESETS[1],
                        data: defaultDataFor(addSectionType),
                      } as CompositionSection,
                    ],
                  }))
                }
                disabled={draft.sections.length >= 24}
                className="rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-ink disabled:opacity-30"
              >
                + Add section
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {draft.sections.map((section, index) => (
              <SectionEditor
                key={section.id}
                section={section}
                index={index}
                total={draft.sections.length}
                errors={sectionErrors.get(index) ?? []}
                onChangeData={(data) =>
                  updateDraft((prev) => {
                    const sections = prev.sections.slice();
                    sections[index] = { ...sections[index], data } as CompositionSection;
                    return { ...prev, sections };
                  })
                }
                onChangeMotionPreset={(preset) =>
                  updateDraft((prev) => {
                    const sections = prev.sections.slice();
                    sections[index] = { ...sections[index], motionPreset: preset as CompositionSection["motionPreset"] };
                    return { ...prev, sections };
                  })
                }
                onToggleEnabled={(enabled) =>
                  updateDraft((prev) => {
                    const sections = prev.sections.slice();
                    sections[index] = { ...sections[index], enabled };
                    return { ...prev, sections };
                  })
                }
                onMove={(direction) =>
                  updateDraft((prev) => {
                    const sections = prev.sections.slice();
                    const target = index + direction;
                    if (target < 0 || target >= sections.length) return prev;
                    [sections[index], sections[target]] = [sections[target], sections[index]];
                    return { ...prev, sections };
                  })
                }
                onRemove={() =>
                  updateDraft((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))
                }
              />
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <div className="sticky top-4 space-y-6">
          <section className="rounded-2xl border border-line bg-paper-raised p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Save</h2>
              {dirty && <span className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Unsaved changes</span>}
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">Slug: {slug} · Revision {revision}</p>
            <button
              onClick={handleSave}
              disabled={!isValid || saveState === "working" || !dirty}
              className="mt-3 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
            >
              {saveState === "working" ? "Saving…" : "Save composition"}
            </button>
            {!isValid && validation && !validation.success && (
              <p className="mt-2 text-xs text-red-600">This draft doesn&apos;t currently pass validation — fix the highlighted sections.</p>
            )}
            {saveMessage && saveState !== "stale" && (
              <p role="status" className={`mt-2 text-xs ${saveState === "error" ? "text-red-500" : "text-emerald-700"}`}>
                {saveMessage}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-paper-raised p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Live preview</h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setPreviewWidth("desktop")}
                  className={`rounded-full px-3 py-1 text-xs ${previewWidth === "desktop" ? "bg-ink text-paper" : "border border-line text-ink-soft"}`}
                >
                  Desktop
                </button>
                <button
                  onClick={() => setPreviewWidth("mobile")}
                  className={`rounded-full px-3 py-1 text-xs ${previewWidth === "mobile" ? "bg-ink text-paper" : "border border-line text-ink-soft"}`}
                >
                  Mobile
                </button>
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={previewReducedMotion} onChange={(e) => setPreviewReducedMotion(e.target.checked)} />
              Preview as reduced-motion
            </label>
            <div className={`mt-3 overflow-hidden rounded-xl border border-line ${previewWidth === "mobile" ? "mx-auto w-[390px]" : "w-full"}`}>
              <iframe
                ref={iframeRef}
                src={`/admin/invitations/${invitationId}/preview-frame`}
                title="Invitation preview"
                className="h-[700px] w-full bg-paper"
              />
            </div>
          </section>

          <ReadinessPanel report={readiness} />

          <PreviewLinkPanel invitationId={invitationId} hasLinkInitially={hasPreviewLink} />

          <PublishControl invitationId={invitationId} publishedAt={publishedAt} blocking={readiness.blocking.length} />
        </div>
      </div>
    </div>
  );
}

function PublishControl({ invitationId, publishedAt, blocking }: { invitationId: string; publishedAt: string | null; blocking: number }) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [published, setPublished] = useState(Boolean(publishedAt));

  async function toggle() {
    const action = published ? "unpublish" : "publish";
    if (!window.confirm(published ? "Unpublish this invitation? Guests will no longer be able to view it." : "Publish this invitation? It becomes visible to anyone with its link.")) return;

    setStatus("working");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }
      setPublished(!published);
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-4">
      <h2 className="font-display text-lg">Publication</h2>
      <p className="mt-1 text-xs text-ink-soft">{published ? "Currently published." : "Not published yet."}</p>
      {!published && blocking > 0 && (
        <p className="mt-2 text-xs text-amber-700">{blocking} blocking readiness issue{blocking === 1 ? "" : "s"} above — publishing is still possible, but not recommended yet.</p>
      )}
      <button
        onClick={toggle}
        disabled={status === "working"}
        className="mt-3 w-full rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-40"
      >
        {published ? "Unpublish" : "Publish"}
      </button>
      {message && <p className="mt-2 text-xs text-red-500">{message}</p>}
    </section>
  );
}
