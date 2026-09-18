"use client";

import { useState } from "react";

/**
 * Preview-link management, scoped to one already-known invitation —
 * Stage 8 Part H. Reuses the EXISTING /api/admin/invite-previews route
 * and its underlying preview-admin.server.ts functions verbatim (no new
 * token-generation logic anywhere in this file) — the only difference
 * from PreviewLinkTool.tsx (Stage 5) is that this component already
 * knows its invitation id, so there's no id text field to fill in.
 *
 * `hasLinkInitially` (from AdminInvitationDetail.hasPreviewLink) is a
 * single boolean the server already computed WITHOUT ever exposing the
 * stored hash — "see whether preview access currently exists without
 * seeing the stored hash" is true from the moment this component mounts,
 * not just after an action. The raw token itself is held only in plain
 * component state, for exactly as long as it takes to read/copy it —
 * never written to storage, never logged (no console.* call on any path
 * here) — identical discipline to PreviewLinkTool.tsx.
 */
export function PreviewLinkPanel({ invitationId, hasLinkInitially }: { invitationId: string; hasLinkInitially: boolean }) {
  const [hasLink, setHasLink] = useState(hasLinkInitially);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function run(action: "create" | "rotate" | "revoke", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;

    setStatus("working");
    setMessage(null);
    setToken(null);
    try {
      const res = await fetch("/api/admin/invite-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: invitationId, action }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }

      setStatus("idle");
      if (action === "revoke") {
        setHasLink(false);
        setMessage("Preview access revoked — the previous link no longer works.");
      } else {
        setHasLink(true);
        setToken(typeof body.token === "string" ? body.token : null);
        setMessage(action === "create" ? "Preview link created." : "Preview link rotated — the previous link no longer works.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  const previewUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/preview/${token}` : null;

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Private preview link</h2>
      <p className="mt-1 text-xs text-ink-soft">
        {hasLink ? "A preview link currently exists for this invitation." : "No preview link exists yet."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!hasLink ? (
          <button
            onClick={() => run("create")}
            disabled={status === "working"}
            className="focus-ring rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition disabled:opacity-40"
          >
            Create preview link
          </button>
        ) : (
          <>
            <button
              onClick={() => run("rotate", "Rotate the preview link? The previous link will stop working immediately.")}
              disabled={status === "working"}
              className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink disabled:opacity-40"
            >
              Rotate
            </button>
            <button
              onClick={() => run("revoke", "Revoke the preview link? The client will no longer be able to open it.")}
              disabled={status === "working"}
              className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-40"
            >
              Revoke
            </button>
          </>
        )}
      </div>

      {message && (
        <p role="status" className={`mt-3 text-xs ${status === "error" ? "text-red-500" : "text-ink-soft"}`}>
          {message}
        </p>
      )}

      {previewUrl && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Shown once — copy it now, it will not be shown again</p>
          <code className="mt-1 block break-all text-xs text-ink">{previewUrl}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(previewUrl).catch(() => {})}
            className="focus-ring mt-2 rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-ink"
          >
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}
