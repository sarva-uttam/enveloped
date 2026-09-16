"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { InvitationComposition } from "@/lib/composition/schema";

const WIDTHS = { desktop: "100%", tablet: "834px", mobile: "390px" } as const;
type PreviewWidth = keyof typeof WIDTHS;
const ZOOM_LEVELS = [0.6, 0.75, 1] as const;

/**
 * The single live-preview surface — Stage 12 Part 9. Reuses the EXACT
 * same iframe/`postMessage` mechanism InvitationEditor.tsx built in
 * Stage 8 (never a second visual implementation — the iframe's own
 * document renders the SAME `InvitationExperience`/`CompositionRenderer`
 * every public/preview/owner route uses): a debounced message carrying
 * the current, already-schema-validated draft (or `null`, which the
 * frame shows its own "doesn't validate" explanation for, never a
 * crash), plus a `forceReducedMotion` and, new this stage,
 * `previewOpeningAnimation` flag.
 *
 * Rendered exactly ONCE by GeneratorWorkspace regardless of which tab is
 * active — only this component's OWN wrapper classes change between
 * "compact, right-rail" and "full, Preview-tab" placement, so the iframe
 * is never remounted/reloaded by a tab switch, and its ready-handshake
 * state survives.
 *
 * `canRsvp={false}` is enforced entirely inside preview-frame/page.tsx,
 * never as a prop this component could override — "do not allow
 * admin-preview RSVP" holds structurally, not by convention here.
 */
export function PreviewPane({
  invitationId,
  composition,
  isDraftValid,
}: {
  invitationId: string;
  composition: InvitationComposition | null;
  /** Whether the CURRENT (possibly unsaved) draft is schema-valid —
   *  `composition` is only ever the validated version or `null`; this
   *  flag lets the pane explain an invalid draft distinctly from "no
   *  composition yet at all." */
  isDraftValid: boolean;
}) {
  const [width, setWidth] = useState<PreviewWidth>("desktop");
  const [zoom, setZoom] = useState<(typeof ZOOM_LEVELS)[number]>(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [openingAnimation, setOpeningAnimation] = useState(false);
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    function handleReady(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === "envelope-admin-preview-ready") setReady(true);
    }
    window.addEventListener("message", handleReady);
    return () => window.removeEventListener("message", handleReady);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "envelope-admin-preview",
          composition,
          forceReducedMotion: reducedMotion,
          previewOpeningAnimation: openingAnimation,
        },
        window.location.origin
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [composition, ready, reducedMotion, openingAnimation]);

  return (
    <section aria-label="Live invitation preview" className="rounded-2xl border border-line bg-paper-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg">Live preview</h2>
        <span role="status" className="text-[11px] text-ink-soft">
          {!isDraftValid ? "Draft doesn't validate — showing an explanation" : composition ? "Showing current unsaved draft" : "Waiting for content"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(Object.keys(WIDTHS) as PreviewWidth[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-pressed={width === w}
            className={`focus-ring rounded-full px-3 py-1 text-xs capitalize ${width === w ? "bg-ink text-paper" : "border border-line text-ink-soft"}`}
          >
            {w}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-ink-soft">
          Zoom
          <select
            className="focus-ring rounded border border-line bg-paper px-1.5 py-1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value) as (typeof ZOOM_LEVELS)[number])}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} className="focus-ring" />
          Reduced motion
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={openingAnimation} onChange={(e) => setOpeningAnimation(e.target.checked)} className="focus-ring" />
          Preview opening animation
        </label>
      </div>

      <PreviewErrorBoundary>
        <div className="mt-3 overflow-auto rounded-xl border border-line bg-paper" style={{ maxHeight: "70vh" }}>
          <div style={{ width: WIDTHS[width], margin: width === "desktop" ? undefined : "0 auto" }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: `${100 / zoom}%` }}>
              <iframe
                ref={iframeRef}
                src={`/admin/invitations/${invitationId}/preview-frame`}
                title="Invitation preview"
                className="h-[900px] w-full bg-paper"
              />
            </div>
          </div>
        </div>
      </PreviewErrorBoundary>
    </section>
  );
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          The preview panel hit an unexpected error. The rest of the editor is unaffected — try switching preview width or reloading this page.
        </div>
      );
    }
    return this.props.children;
  }
}
