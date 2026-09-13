"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TRANSITIONS, type RequestStatus } from "@/lib/requests";

/**
 * The status-change control on the request detail page — Stage 8 Part B.
 * Only ever offers the transitions REQUEST_STATUS_TRANSITIONS says are
 * valid from the CURRENT status (client-side UX only; the database
 * trigger is the real enforcement — see requests-admin.server.ts's own
 * comment). A no-op "change to the same status" is never offered at all.
 */
export function RequestStatusControl({ requestId, currentStatus }: { requestId: string; currentStatus: RequestStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const options = REQUEST_STATUS_TRANSITIONS[currentStatus];

  async function changeTo(next: RequestStatus) {
    if (!window.confirm(`Change this request's status to "${REQUEST_STATUS_LABELS[next]}"?`)) return;

    setStatus("working");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (options.length === 0) {
    return <p className="text-xs text-ink-soft">This request is archived — no further status changes are available.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((next) => (
          <button
            key={next}
            onClick={() => changeTo(next)}
            disabled={status === "working"}
            className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:border-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Mark as {REQUEST_STATUS_LABELS[next]}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className={`mt-2 text-xs ${status === "error" ? "text-red-500" : "text-ink-soft"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
