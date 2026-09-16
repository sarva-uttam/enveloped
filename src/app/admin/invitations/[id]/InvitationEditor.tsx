"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  InvitationCompositionSchema,
  MOTION_PRESETS,
  SECTION_TYPES,
  type CompositionSection,
  type InvitationComposition,
  type SectionType,
} from "@/lib/composition/schema";
import { CULTURAL_PACKS } from "@/lib/composition/cultural-packs";
import { PALETTE_IDS, DENSITY_IDS } from "@/lib/composition/theme";
import { TYPOGRAPHY_IDS } from "@/lib/composition/typography";
import { SECTION_STYLE_IDS } from "@/lib/composition/section-styles";
import { DECORATIVE_MOTIF_IDS, DECORATIVE_MOTIF_REGISTRY } from "@/lib/composition/motifs";
import { ENVELOPE_TREATMENT_IDS, ENVELOPE_TREATMENT_REGISTRY } from "@/lib/composition/envelope-treatments";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { EVENT_TYPES } from "@/lib/composition/event-types";
import { LOCALES } from "@/lib/i18n/translations";
import { assessPublicationReadiness, type PrivateFieldsForLeakCheck } from "@/lib/composition/readiness";
import type { AdminReviewRound } from "@/lib/review";
import type { AdminGuestDashboardSummary } from "@/lib/guests";
import { SectionEditor } from "./SectionEditor";
import { ReadinessPanel } from "./ReadinessPanel";
import { PreviewLinkPanel } from "./PreviewLinkPanel";
import { ReviewPanel } from "./ReviewPanel";
import { PreviewPane } from "./PreviewPane";
import { TemplateLibrary } from "./TemplateLibrary";

const inputClass = "focus-ring w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink";

/**
 * Stage 12 — which workspace area each section type belongs to. UI-only
 * grouping (never a schema/content concept): Content = narrative
 * sections, Events = schedule/date/venue/logistics, Media =
 * gallery/music. Every SECTION_TYPES entry appears exactly once,
 * asserted by InvitationEditor.test.tsx.
 */
const SECTION_TAB: Record<SectionType, "content" | "events" | "media"> = {
  opening: "content",
  greeting: "content",
  intro: "content",
  welcome: "content",
  story: "content",
  rsvp: "content",
  closing: "content",
  customText: "content",
  schedule: "events",
  dateTime: "events",
  venue: "events",
  mapLink: "events",
  dressCode: "events",
  gallery: "media",
  music: "media",
};

type WorkspaceTab = "design" | "content" | "events" | "media" | "preview" | "review" | "guests" | "publish";

const TAB_LABEL: Record<WorkspaceTab, string> = {
  design: "Design",
  content: "Content",
  events: "Events",
  media: "Media",
  preview: "Preview",
  review: "Client Review",
  guests: "Guests & RSVP",
  publish: "Readiness & Publish",
};

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
  generatorKind,
  initialReviewHistory,
  privateFieldsForReadiness,
  guestSummary,
}: {
  invitationId: string;
  slug: string;
  initialComposition: unknown | null;
  initialRevision: number;
  publishedAt: string | null;
  hasPreviewLink: boolean;
  generatorKind: string | null;
  initialReviewHistory: AdminReviewRound[];
  privateFieldsForReadiness: PrivateFieldsForLeakCheck | null;
  guestSummary: AdminGuestDashboardSummary | null;
}) {
  const parsedInitial = InvitationCompositionSchema.safeParse(initialComposition);
  const [draft, setDraft] = useState<InvitationComposition | null>(parsedInitial.success ? parsedInitial.data : null);
  const [revision, setRevision] = useState(initialRevision);
  const [lastSavedJson, setLastSavedJson] = useState<string | null>(parsedInitial.success ? JSON.stringify(parsedInitial.data) : null);
  const [saveState, setSaveState] = useState<"idle" | "working" | "saved" | "error" | "stale">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [initPack, setInitPack] = useState<string>(Object.keys(CULTURAL_PACKS)[0]);
  const [addSectionType, setAddSectionType] = useState<SectionType>("customText");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("design");

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

  const latestReviewRound = initialReviewHistory[0] ?? null;
  const isApprovedForCurrentRevision = Boolean(latestReviewRound && latestReviewRound.status === "client_approved" && latestReviewRound.compositionRevision === revision);
  const hasUnresolvedChangeRequest = Boolean(latestReviewRound && latestReviewRound.status === "changes_requested");

  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
          <button onClick={handleInitializePack} className="focus-ring mt-3 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft">
            Initialize composition
          </button>
        </div>
        {saveMessage && <p className="mt-3 text-xs text-red-500">{saveMessage}</p>}
      </div>
    );
  }

  const usedSectionIds = new Set(draft.sections.map((s) => s.id));

  const invitationStatus = publishedAt
    ? "published"
    : isApprovedForCurrentRevision
      ? "approved"
      : latestReviewRound && ["awaiting_client", "ready_to_send"].includes(latestReviewRound.status)
        ? "in review"
        : "draft";

  const tabStatus: Record<WorkspaceTab, "complete" | "incomplete" | "blocked" | "neutral"> = {
    design: draft.templateId ? "complete" : "incomplete",
    content: sectionsHaveErrors(draft, sectionErrors, "content") ? "blocked" : "complete",
    events: sectionsHaveErrors(draft, sectionErrors, "events") ? "blocked" : draft.sections.some((s) => SECTION_TAB[s.type] === "events") ? "complete" : "incomplete",
    media: sectionsHaveErrors(draft, sectionErrors, "media") ? "blocked" : "neutral",
    preview: "neutral",
    review: hasUnresolvedChangeRequest ? "blocked" : isApprovedForCurrentRevision ? "complete" : "neutral",
    guests: guestSummary && guestSummary.totalInvited > 0 ? "complete" : "incomplete",
    publish: publishedAt ? "complete" : readiness.blocking.length > 0 ? "blocked" : "neutral",
  };

  return (
    <div className="space-y-4">
      <TopBar
        slug={slug}
        revision={revision}
        status={invitationStatus}
        dirty={dirty}
        isValid={isValid}
        saveState={saveState}
        saveMessage={saveMessage}
        onSave={handleSave}
      />

      {saveState === "stale" && (
        <div role="alert" className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Someone else saved a newer version of this invitation.</p>
          <p className="mt-1 text-xs">Your changes here were NOT saved, to avoid overwriting theirs. Reload to see the latest version before continuing.</p>
          <button onClick={() => window.location.reload()} className="focus-ring mt-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white">
            Reload latest version
          </button>
        </div>
      )}

      {isApprovedForCurrentRevision && (
        <div role="alert" className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">The client has approved this exact version.</p>
          <p className="mt-1 text-xs">Saving any further change will invalidate that approval — the invitation will need a new review round before it can be published again.</p>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <WorkspaceNav activeTab={activeTab} onChange={setActiveTab} tabStatus={tabStatus} />

        <div className={activeTab === "preview" ? "hidden" : "min-w-0 flex-1"}>
          {activeTab === "design" && (
            <div className="space-y-8">
              <InvitationSettings draft={draft} updateDraft={updateDraft} />
              <TemplateLibrary draft={draft} onApply={(next) => setDraft(next)} />
              <DesignControls draft={draft} updateDraft={updateDraft} />
            </div>
          )}

          {(activeTab === "content" || activeTab === "events" || activeTab === "media") && (
            <SectionsTab
              draft={draft}
              tab={activeTab}
              sectionErrors={sectionErrors}
              usedSectionIds={usedSectionIds}
              addSectionType={addSectionType}
              setAddSectionType={setAddSectionType}
              updateDraft={updateDraft}
            />
          )}

          {activeTab === "review" && generatorKind === "concierge" && (
            <ReviewPanel invitationId={invitationId} currentRevision={revision} history={initialReviewHistory} />
          )}
          {activeTab === "review" && generatorKind !== "concierge" && (
            <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
              Client review rounds only apply to concierge-generated invitations.
            </p>
          )}

          {activeTab === "guests" && <GuestsTab invitationId={invitationId} summary={guestSummary} />}

          {activeTab === "publish" && (
            <div className="space-y-6">
              <ReadinessPanel report={readiness} />
              <PreviewLinkPanel invitationId={invitationId} hasLinkInitially={hasPreviewLink} />
              <PublishControl
                invitationId={invitationId}
                publishedAt={publishedAt}
                blocking={readiness.blocking.length}
                isConcierge={generatorKind === "concierge"}
                isApprovedForCurrentRevision={isApprovedForCurrentRevision}
                hasUnresolvedChangeRequest={hasUnresolvedChangeRequest}
              />
            </div>
          )}
        </div>

        <div className={activeTab === "preview" ? "min-w-0 flex-1" : "hidden shrink-0 xl:block xl:w-[380px]"}>
          <PreviewPane invitationId={invitationId} composition={validation?.success ? validation.data : null} isDraftValid={isValid} />
        </div>
      </div>

      {activeTab !== "preview" && (
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className="focus-ring fixed bottom-6 right-6 z-30 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper shadow-lg xl:hidden"
        >
          Show preview
        </button>
      )}
    </div>
  );
}

function sectionsHaveErrors(draft: InvitationComposition, sectionErrors: Map<number, string[]>, tab: "content" | "events" | "media"): boolean {
  return draft.sections.some((s, i) => SECTION_TAB[s.type] === tab && (sectionErrors.get(i)?.length ?? 0) > 0);
}

function TopBar({
  slug,
  revision,
  status,
  dirty,
  isValid,
  saveState,
  saveMessage,
  onSave,
}: {
  slug: string;
  revision: number;
  status: "draft" | "in review" | "approved" | "published";
  dirty: boolean;
  isValid: boolean;
  saveState: "idle" | "working" | "saved" | "error" | "stale";
  saveMessage: string | null;
  onSave: () => void;
}) {
  const statusColor =
    status === "published" ? "bg-emerald-100 text-emerald-800" : status === "approved" ? "bg-champagne-soft text-ink" : status === "in review" ? "bg-amber-100 text-amber-800" : "bg-line text-ink-soft";
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper-raised/95 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs text-ink-soft">
            Slug: <code>{slug}</code> · Revision {revision}
          </p>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${statusColor}`}>{status}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {dirty ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Unsaved changes</span>
        ) : (
          saveState === "saved" && <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Saved</span>
        )}
        <button
          onClick={onSave}
          disabled={!isValid || saveState === "working" || !dirty}
          className="focus-ring rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
        >
          {saveState === "working" ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="w-full" aria-live="polite">
        {!isValid && <p className="text-xs text-red-600">This draft doesn&apos;t currently pass validation — fix the highlighted sections.</p>}
        {saveMessage && saveState !== "stale" && (
          <p role="status" className={`text-xs ${saveState === "error" ? "text-red-500" : "text-emerald-700"}`}>
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  );
}

const STATUS_DOT: Record<"complete" | "incomplete" | "blocked" | "neutral", string> = {
  complete: "bg-emerald-500",
  incomplete: "bg-line",
  blocked: "bg-red-500",
  neutral: "bg-line",
};
const STATUS_LABEL: Record<"complete" | "incomplete" | "blocked" | "neutral", string> = {
  complete: "Complete",
  incomplete: "Not started",
  blocked: "Needs attention",
  neutral: "",
};

function WorkspaceNav({
  activeTab,
  onChange,
  tabStatus,
}: {
  activeTab: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  tabStatus: Record<WorkspaceTab, "complete" | "incomplete" | "blocked" | "neutral">;
}) {
  const tabs = Object.keys(TAB_LABEL) as WorkspaceTab[];
  return (
    <nav aria-label="Generator workspace areas" className="min-w-0 flex gap-2 overflow-x-auto pb-1 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0">
      {tabs.map((tab) => {
        const status = tabStatus[tab];
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={active ? "page" : undefined}
            className={`focus-ring relative flex shrink-0 items-center justify-between gap-2 rounded-full px-4 py-2 text-left text-xs font-medium transition lg:rounded-xl lg:px-3 lg:py-2.5 ${
              active ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink"
            }`}
          >
            <span className="whitespace-nowrap">{TAB_LABEL[tab]}</span>
            {status !== "neutral" && (
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
                <span className="sr-only">{STATUS_LABEL[status]}</span>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function InvitationSettings({ draft, updateDraft }: { draft: InvitationComposition; updateDraft: (u: (p: InvitationComposition) => InvitationComposition) => void }) {
  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Invitation setup</h2>
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
            className="focus-ring"
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
                  onChange={(e) => updateDraft((prev) => (prev.weddingContext ? { ...prev, weddingContext: { ...prev.weddingContext, occasionCustomLabel: e.target.value || null } } : prev))}
                />
              </label>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DesignControls({ draft, updateDraft }: { draft: InvitationComposition; updateDraft: (u: (p: InvitationComposition) => InvitationComposition) => void }) {
  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Design controls</h2>
      <p className="mt-1 text-xs text-ink-soft">Trusted, allowlisted choices only — every selection here is validated the same way on save.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Typography</span>
          <select
            className={inputClass}
            value={draft.themeTokens.typographyId ?? "classic-serif"}
            onChange={(e) => updateDraft((prev) => ({ ...prev, themeTokens: { ...prev.themeTokens, typographyId: e.target.value as (typeof TYPOGRAPHY_IDS)[number] } }))}
          >
            {TYPOGRAPHY_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Section treatment</span>
          <select
            className={inputClass}
            value={draft.themeTokens.sectionStyleId ?? "soft"}
            onChange={(e) => updateDraft((prev) => ({ ...prev, themeTokens: { ...prev.themeTokens, sectionStyleId: e.target.value as (typeof SECTION_STYLE_IDS)[number] } }))}
          >
            {SECTION_STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Density</span>
          <select
            className={inputClass}
            value={draft.themeTokens.densityId ?? "comfortable"}
            onChange={(e) => updateDraft((prev) => ({ ...prev, themeTokens: { ...prev.themeTokens, densityId: e.target.value as (typeof DENSITY_IDS)[number] } }))}
          >
            {DENSITY_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Decorative motif</span>
          <select
            className={inputClass}
            value={draft.featureConfig.decorativeMotifId ?? ""}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, decorativeMotifId: (e.target.value || undefined) as InvitationComposition["featureConfig"]["decorativeMotifId"] } }))}
          >
            <option value="">Use design pack default</option>
            {DECORATIVE_MOTIF_IDS.map((id) => (
              <option key={id} value={id}>
                {DECORATIVE_MOTIF_REGISTRY[id].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Envelope treatment</span>
          <select
            className={inputClass}
            value={draft.featureConfig.envelopeTreatmentId ?? "classic"}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, envelopeTreatmentId: e.target.value as (typeof ENVELOPE_TREATMENT_IDS)[number] } }))}
          >
            {ENVELOPE_TREATMENT_IDS.map((id) => (
              <option key={id} value={id}>
                {ENVELOPE_TREATMENT_REGISTRY[id].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Ambient effect intensity</span>
          <select
            className={inputClass}
            value={draft.featureConfig.ambientMotif}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, ambientMotif: e.target.value as InvitationComposition["featureConfig"]["ambientMotif"] } }))}
          >
            <option value="none">None (reduced decorative intensity)</option>
            <option value="light">Light</option>
            <option value="full">Full</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.featureConfig.motion}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, motion: e.target.checked } }))}
            className="focus-ring"
          />
          Motion enabled
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.featureConfig.openingBurst}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, openingBurst: e.target.checked } }))}
            className="focus-ring"
          />
          Opening burst
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.featureConfig.envelopeOpening}
            onChange={(e) => updateDraft((prev) => ({ ...prev, featureConfig: { ...prev.featureConfig, envelopeOpening: e.target.checked } }))}
            className="focus-ring"
          />
          Envelope opening
        </label>
      </div>
    </section>
  );
}

function SectionsTab({
  draft,
  tab,
  sectionErrors,
  usedSectionIds,
  addSectionType,
  setAddSectionType,
  updateDraft,
}: {
  draft: InvitationComposition;
  tab: "content" | "events" | "media";
  sectionErrors: Map<number, string[]>;
  usedSectionIds: Set<string>;
  addSectionType: SectionType;
  setAddSectionType: (t: SectionType) => void;
  updateDraft: (u: (p: InvitationComposition) => InvitationComposition) => void;
}) {
  const typesForTab = SECTION_TYPES.filter((t) => SECTION_TAB[t] === tab);
  const indices = draft.sections.map((s, i) => i).filter((i) => SECTION_TAB[draft.sections[i].type] === tab);
  const errorCount = indices.reduce((sum, i) => sum + (sectionErrors.get(i)?.length ?? 0), 0);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">{TAB_LABEL[tab]}</h2>
        <div className="flex items-center gap-2">
          <select value={addSectionType} onChange={(e) => setAddSectionType(e.target.value as SectionType)} className="focus-ring rounded-full border border-line bg-paper px-3 py-1.5 text-xs">
            {typesForTab.map((t) => (
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
            className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-ink disabled:opacity-30"
          >
            + Add section
          </button>
        </div>
      </div>

      {errorCount > 0 && (
        <div role="alert" className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-700">
          <p className="font-medium">
            {errorCount} validation issue{errorCount === 1 ? "" : "s"} in this area.
          </p>
          <ul className="space-y-0.5">
            {indices
              .filter((i) => (sectionErrors.get(i)?.length ?? 0) > 0)
              .map((i) => (
                <li key={i}>
                  <a href={`#section-${draft.sections[i].id}`} className="focus-ring rounded underline underline-offset-2">
                    Jump to {draft.sections[i].type} section
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}

      {indices.length === 0 && <p className="mt-4 text-sm text-ink-soft">No sections in this area yet — add one above.</p>}

      <div className="mt-4 space-y-4">
        {indices.map((index) => {
          const section = draft.sections[index];
          return (
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
              onRemove={() => updateDraft((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))}
            />
          );
        })}
      </div>
    </section>
  );
}

function GuestsTab({ invitationId, summary }: { invitationId: string; summary: AdminGuestDashboardSummary | null }) {
  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Guests &amp; RSVP</h2>
      <p className="mt-1 text-sm text-ink-soft">Full guest list management, household links, CSV import/export, and RSVP tracking live on their own dedicated page.</p>

      {summary ? (
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Invited" value={summary.totalInvited} />
          <Stat label="Responded" value={summary.responded} />
          <Stat label="Attending" value={summary.attending} />
          <Stat label="Expected guests" value={summary.totalExpectedAttendees} />
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">No guests have been added yet.</p>
      )}

      <Link
        href={`/admin/invitations/${invitationId}/guests`}
        className="focus-ring mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
      >
        Manage guests →
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3 text-center">
      <div className="font-display text-2xl">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
    </div>
  );
}

function PublishControl({
  invitationId,
  publishedAt,
  blocking,
  isConcierge,
  isApprovedForCurrentRevision,
  hasUnresolvedChangeRequest,
}: {
  invitationId: string;
  publishedAt: string | null;
  blocking: number;
  isConcierge: boolean;
  isApprovedForCurrentRevision: boolean;
  hasUnresolvedChangeRequest: boolean;
}) {
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

  const conciergeBlocked = isConcierge && (blocking > 0 || !isApprovedForCurrentRevision || hasUnresolvedChangeRequest);

  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-4">
      <h2 className="font-display text-lg">Publication</h2>
      <p className="mt-1 text-xs text-ink-soft">{published ? "Currently published." : "Not published yet."}</p>

      {!published && isConcierge && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          {blocking > 0 && <li>{blocking} blocking readiness issue{blocking === 1 ? "" : "s"} above must be fixed first.</li>}
          {hasUnresolvedChangeRequest && <li>There is an unresolved change request — resolve it before publishing.</li>}
          {!hasUnresolvedChangeRequest && !isApprovedForCurrentRevision && <li>The client has not approved this exact version yet.</li>}
        </ul>
      )}
      {!published && !isConcierge && blocking > 0 && (
        <p className="mt-2 text-xs text-amber-700">{blocking} blocking readiness issue{blocking === 1 ? "" : "s"} above — publishing is still possible, but not recommended yet.</p>
      )}

      <button
        onClick={toggle}
        disabled={status === "working" || (!published && conciergeBlocked)}
        className="focus-ring mt-3 w-full rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-40"
      >
        {published ? "Unpublish" : "Publish"}
      </button>
      {message && <p className="mt-2 text-xs text-red-500">{message}</p>}
    </section>
  );
}
