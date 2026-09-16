"use client";

import { useEffect, useState } from "react";
import { InvitationExperience } from "@/components/experience/InvitationExperience";
import type { InvitationComposition } from "@/lib/composition/schema";

/**
 * The live-preview target — Stage 8 Part F. Loaded inside an `<iframe>`
 * by InvitationEditor.tsx, specifically so the preview gets a REAL,
 * independent browser viewport: shrinking a plain `<div>` cannot make
 * Tailwind's viewport-based `md:` breakpoints re-evaluate (they respond
 * to the actual window, not a parent container's width), but an iframe
 * element's rendered CSS width IS its own document's viewport for media-
 * query purposes — the same principle every browser's own responsive-
 * design device toolbar relies on. Sizing the iframe element itself
 * (desktop vs mobile width, InvitationEditor.tsx) is what actually
 * switches which breakpoint this page's own Tailwind classes see.
 *
 * Receives the in-progress DRAFT composition via `postMessage` from its
 * parent, not a server fetch — nothing is saved or persisted anywhere
 * just to preview it, and this route needs no admin-gated data of its
 * own (it lives under /admin/*, so AdminLayout's redirect-if-not-admin
 * still applies to it structurally, but this specific page performs no
 * database read — everything it renders arrives from its own parent
 * window in the same authenticated tab).
 *
 * "Never create a second renderer" (Part F): this imports the SAME
 * InvitationExperience/CompositionRenderer every public/preview/owner
 * route uses, unmodified. mode="review" (skips the envelope-opening
 * ceremony — appropriate for a repeatedly-re-rendering live preview) and
 * canRsvp={false} ALWAYS (Part F: "do not accidentally enable RSVP
 * inside the unsaved admin preview" — this is not a prop the parent
 * window can override via postMessage at all, structurally, since this
 * component never reads it from the incoming message).
 *
 * `forceReducedMotion` (Part F: "support reduced-motion preview") works
 * by monkey-patching this iframe's OWN `window.matchMedia` before the
 * composition renders — safe and contained because it only ever affects
 * this iframe's own document, never the parent admin page or any other
 * tab/window.
 */
interface PreviewMessage {
  type: "envelope-admin-preview";
  composition: InvitationComposition | null;
  forceReducedMotion: boolean;
  /** Stage 12 — when true, renders in `mode="guest"` instead of the
   *  default `mode="review"`, which is the ONLY difference between the
   *  two: the envelope-opening ceremony becomes active, so an
   *  administrator can preview/replay it live (EnvelopeOpening's own
   *  "Replay opening" control, unmodified). Everything else about this
   *  route's guarantees (canRsvp always false, no owner tooling, same
   *  trusted renderer) is unaffected by this flag. */
  previewOpeningAnimation?: boolean;
}

function isPreviewMessage(value: unknown): value is PreviewMessage {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "envelope-admin-preview");
}

export default function PreviewFramePage() {
  const [composition, setComposition] = useState<InvitationComposition | null>(null);
  const [patched, setPatched] = useState(false);
  const [openingAnimation, setOpeningAnimation] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;

      if (event.data.forceReducedMotion) {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query: string) =>
          query.includes("prefers-reduced-motion")
            ? ({
                matches: true,
                media: query,
                onchange: null,
                addEventListener() {},
                removeEventListener() {},
                addListener() {},
                removeListener() {},
                dispatchEvent: () => false,
              } as unknown as MediaQueryList)
            : original(query);
      }

      setComposition(event.data.composition);
      setOpeningAnimation(Boolean(event.data.previewOpeningAnimation));
      setPatched(true);
    }

    window.addEventListener("message", handleMessage);
    // Tell the parent this frame is ready to receive the first draft.
    window.parent.postMessage({ type: "envelope-admin-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!composition) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-8 text-center text-sm text-ink-soft">
        {patched ? "This draft doesn't currently pass validation — fix the highlighted fields to see it here." : "Waiting for the editor…"}
      </div>
    );
  }

  return <InvitationExperience composition={composition} canRsvp={false} mode={openingAnimation ? "guest" : "review"} />;
}
