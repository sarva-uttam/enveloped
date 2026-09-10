"use client";

import { useState } from "react";

/**
 * The minimal admin-only control for private preview links — Stage 5
 * (2026-09-10, see PROJECT_STATUS.md's Stage 5 section). Deliberately
 * bare: one text input (the invitation's internal uuid — no
 * search/browse, see src/app/api/admin/invite-previews/route.ts's own
 * comment on why), three buttons, one result line. This is explicitly
 * NOT the request-management UI or the concierge admin editor — both
 * remain out of scope for this stage.
 *
 * The raw token is held in plain component state for exactly as long as
 * it takes the administrator to read and copy it — never written to
 * localStorage/sessionStorage, never logged (this component has no
 * console.* call on any path), and is REPLACED (not appended) by
 * whatever the next create/rotate/revoke call returns, so at most one
 * raw token ever exists in memory here at a time. Refreshing or
 * navigating away discards it completely, matching "the raw token is
 * shown only once" — there is no way to retrieve it again from this UI
 * after that.
 */
export function PreviewLinkTool() {
  const [inviteId, setInviteId] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function run(action: "create" | "rotate" | "revoke") {
    setStatus("working");
    setMessage(null);
    setToken(null);

    try {
      const res = await fetch("/api/admin/invite-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: inviteId.trim(), action }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }

      setStatus("idle");
      if (action === "revoke") {
        setMessage("Preview access revoked — the previous link no longer works.");
      } else {
        setToken(typeof body.token === "string" ? body.token : null);
        setMessage(action === "create" ? "Preview link created." : "Preview link rotated — the previous link no longer works.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="mt-10 max-w-md rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Private preview links</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Paste an invitation&apos;s internal id (uuid), not its slug.
      </p>
      <input
        aria-label="Invitation id"
        value={inviteId}
        onChange={(e) => setInviteId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        className="mt-3 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-offset-2"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => run("create")}
          disabled={!inviteId.trim() || status === "working"}
          className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Create
        </button>
        <button
          onClick={() => run("rotate")}
          disabled={!inviteId.trim() || status === "working"}
          className="rounded-full border border-line px-4 py-2 text-xs text-ink transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Rotate
        </button>
        <button
          onClick={() => run("revoke")}
          disabled={!inviteId.trim() || status === "working"}
          className="rounded-full border border-line px-4 py-2 text-xs text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Revoke
        </button>
      </div>

      {message && (
        <p role="status" className={`mt-3 text-xs ${status === "error" ? "text-red-500" : "text-ink-soft"}`}>
          {message}
        </p>
      )}

      {token && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
            Shown once — copy it now, it will not be shown again
          </p>
          <code className="mt-1 block break-all text-xs text-ink">
            {(typeof window !== "undefined" ? window.location.origin : "") + "/preview/" + token}
          </code>
        </div>
      )}
    </div>
  );
}
