import { Eye } from "lucide-react";

/**
 * The visible, non-sensitive "this is a private preview" indicator for
 * /preview/[token] — Stage 5 (2026-09-10, see PROJECT_STATUS.md's Stage
 * 5 section). Server-rendered, no "use client": plain text and a plain
 * icon, nothing interactive, nothing that needs hydration.
 *
 * Deliberately says NOTHING sensitive — no invitation id, no token (this
 * component never receives one; see /preview/[token]/page.tsx, which
 * never passes the raw token to any component at all), no owner name, no
 * guest name. `isPublished` is the one signal it reflects, and it's not
 * sensitive: it only tells the one person who already possesses this
 * unguessable link whether the invitation shown is also independently
 * reachable at its own public /invite/[id] URL — "show that the
 * invitation is not necessarily published."
 */
export function PreviewBanner({ isPublished }: { isPublished: boolean }) {
  return (
    <div className="border-b border-line bg-paper-raised/80 px-6 py-3 text-center text-xs text-ink-soft">
      <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide text-ink">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Preview
      </span>
      <span className="ml-2">
        {isPublished
          ? "This invitation is live and publicly shareable via its guest links."
          : "This invitation has not been published yet — it isn't visible to guests."}
      </span>
    </div>
  );
}
