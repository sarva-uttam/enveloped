"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ROUND_STATUS_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  UNVERIFIED_IDENTITY_NOTE,
  type AdminReviewRound,
} from "@/lib/review";

/**
 * Admin review-round management — Stage 9 Part G. Renders only when the
 * invitation is concierge-generated (InvitationEditor.tsx's own check —
 * this component never inspects generatorKind itself, matching Part I's
 * "do not impose the concierge approval workflow on the separate
 * self-service product"). `history` is server-fetched (page.tsx ->
 * getInvitationReviewHistory()), newest round first; every action here
 * calls router.refresh() on success rather than mutating local state,
 * the same pattern RequestStatusControl.tsx already established — the
 * database's own transition rules are the source of truth, not this
 * component's guess at what changed.
 *
 * `currentRevision` is InvitationEditor's LIVE revision state (updated
 * immediately after a save, before any server round-trip could refresh
 * `history`) — comparing the latest round's own compositionRevision
 * against it is what lets this panel correctly show "not approved for
 * the current version" the instant an edit is saved, even before
 * `history` itself has been refetched.
 */
export function ReviewPanel({ invitationId, currentRevision, history }: { invitationId: string; currentRevision: number; history: AdminReviewRound[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const latest = history[0] ?? null;
  const olderRounds = history.slice(1);

  async function runRoundAction(action: "ready" | "send" | "cancel" | "resolve", roundId: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setStatus("working");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/reviews/${roundId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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

  async function createRound() {
    setStatus("working");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/review`, { method: "POST" });
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

  async function resolveFeedbackItem(itemId: string) {
    setStatus("working");
    try {
      const res = await fetch(`/api/admin/reviews/feedback/${itemId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
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

  const canStartNewRound = !latest || !["draft", "ready_to_send", "awaiting_client", "changes_requested", "client_approved"].includes(latest.status);

  return (
    <section className="rounded-2xl border border-line bg-paper-raised p-4">
      <h2 className="font-display text-lg">Client review</h2>

      {!latest && (
        <p className="mt-1 text-xs text-ink-soft">No review round has been started for this invitation yet.</p>
      )}

      {latest && (
        <div className="mt-2 rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Round {latest.roundNumber}</span>
            <StatusBadge status={latest.status} isCurrent={latest.compositionRevision === currentRevision} />
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            Bound to revision {latest.compositionRevision}
            {latest.compositionRevision !== currentRevision && " — this invitation has since been edited (revision " + currentRevision + ")"}
          </p>

          {latest.decidedAt && (
            <p className="mt-1 text-[11px] text-ink-soft">
              Decided {new Date(latest.decidedAt).toLocaleString()}
              {latest.decisionDisplayName && <> — signed &ldquo;{latest.decisionDisplayName}&rdquo;</>}
              <span className="block italic">{UNVERIFIED_IDENTITY_NOTE}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {latest.status === "draft" && (
              <button onClick={() => runRoundAction("ready", latest.id)} disabled={status === "working"} className="focus-ring rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-40">
                Mark ready
              </button>
            )}
            {latest.status === "ready_to_send" && (
              <button onClick={() => runRoundAction("send", latest.id)} disabled={status === "working"} className="focus-ring rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-40">
                Mark as sent
              </button>
            )}
            {(latest.status === "changes_requested" || latest.status === "client_approved") && (
              <button
                onClick={() => runRoundAction("resolve", latest.id, "Mark this review round as resolved? This closes it out without changing the composition.")}
                disabled={status === "working"}
                className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-ink transition hover:border-ink disabled:opacity-40"
              >
                Mark resolved
              </button>
            )}
            {["draft", "ready_to_send", "awaiting_client", "changes_requested", "client_approved"].includes(latest.status) && (
              <button
                onClick={() => runRoundAction("cancel", latest.id, "Cancel this review round?")}
                disabled={status === "working"}
                className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-40"
              >
                Cancel round
              </button>
            )}
          </div>

          {latest.feedbackItems.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Feedback ({latest.feedbackItems.length})</p>
              {latest.feedbackItems.map((item) => (
                <div key={item.id} className={`rounded-lg border border-line p-2 text-xs ${item.resolvedAt ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {item.category ? FEEDBACK_CATEGORY_LABELS[item.category] : "General"}
                      {item.sectionId && <span className="ml-1 text-ink-soft">· {item.sectionId}</span>}
                    </span>
                    {!item.resolvedAt && (
                      <button onClick={() => resolveFeedbackItem(item.id)} disabled={status === "working"} className="focus-ring rounded text-[11px] text-ink-soft underline underline-offset-2 hover:text-ink">
                        Resolve
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink">{item.message}</p>
                  {item.displayName && <p className="mt-1 italic text-ink-soft">— &ldquo;{item.displayName}&rdquo; ({UNVERIFIED_IDENTITY_NOTE})</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canStartNewRound && (
        <button onClick={createRound} disabled={status === "working"} className="focus-ring mt-3 w-full rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:border-ink disabled:opacity-40">
          Start a review round
        </button>
      )}

      {message && (
        <p role="status" className={`mt-2 text-xs ${status === "error" ? "text-red-500" : "text-ink-soft"}`}>
          {message}
        </p>
      )}

      {olderRounds.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="focus-ring cursor-pointer rounded text-ink-soft">Review history ({olderRounds.length} earlier round{olderRounds.length === 1 ? "" : "s"})</summary>
          <div className="mt-2 space-y-2">
            {olderRounds.map((round) => (
              <div key={round.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">Round {round.roundNumber} · revision {round.compositionRevision}</span>
                  <StatusBadge status={round.status} isCurrent={false} />
                </div>
                {round.decidedAt && (
                  <p className="mt-1 text-ink-soft">
                    Decided {new Date(round.decidedAt).toLocaleString()}
                    {round.decisionDisplayName && <> — &ldquo;{round.decisionDisplayName}&rdquo;</>}
                  </p>
                )}
                {round.feedbackItems.length > 0 && <p className="mt-1 text-ink-soft">{round.feedbackItems.length} feedback item{round.feedbackItems.length === 1 ? "" : "s"}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function StatusBadge({ status, isCurrent }: { status: AdminReviewRound["status"]; isCurrent: boolean }) {
  const color =
    status === "client_approved" && isCurrent
      ? "bg-emerald-100 text-emerald-800"
      : status === "changes_requested"
        ? "bg-amber-100 text-amber-800"
        : status === "superseded" || status === "cancelled"
          ? "bg-line text-ink-soft"
          : "bg-paper text-ink-soft border border-line";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{ROUND_STATUS_LABELS[status]}</span>;
}
