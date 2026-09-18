"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_ITEM_MAX_COUNT,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  UNVERIFIED_IDENTITY_NOTE,
  type ReviewRoundStatus,
} from "@/lib/review";

/**
 * The client-facing decision panel — Stage 9 Part E. Rendered after the
 * invitation content (never before or over it — Part E: "no invitation
 * content hidden behind controls"), mounted with the token ALREADY
 * resolved server-side (this component receives `status`/`isCurrent`,
 * never the raw composition or private data) and the token itself only
 * as a plain string prop used exclusively to build the two fetch() URLs
 * below — never written to localStorage/sessionStorage/a cookie, never
 * logged (see the file-level comment on why passing it here is the
 * "necessary," not "unnecessary," case Part E allows).
 *
 * Opening this page never calls either submission route on its own —
 * every state transition below is gated behind an explicit button press
 * (Part F: "opening a preview must not itself approve or reject
 * anything").
 */

type ClientState = "idle" | "confirm-approve" | "changes-form" | "submitting" | "approved" | "changes-submitted" | "error";

interface FeedbackItemDraft {
  category: (typeof FEEDBACK_CATEGORIES)[number] | "";
  sectionId: string;
  message: string;
}

function emptyItem(): FeedbackItemDraft {
  return { category: "", sectionId: "", message: "" };
}

// `.focus-ring` — the one centralized keyboard-focus treatment for the
// whole admin interface AND this client-facing surface (see
// src/app/globals.css's own comment for the full rationale: a real
// `outline` for Windows high-contrast/forced-colors mode, plus a
// two-color box-shadow halo — paper then ink — that stays visible
// regardless of the control's own background). Previously this file
// used a local, Tailwind-ring-only `focusRingClass` constant; replaced
// during the Stage 9 accessibility correction so every interactive
// surface in the app shares exactly one definition, not one per file.
const focusRingClass = "focus-ring";

export function ReviewSection({
  token,
  status,
  isCurrent,
  sections,
}: {
  token: string;
  status: ReviewRoundStatus | null;
  isCurrent: boolean;
  sections: { id: string; type: string }[];
}) {
  const [state, setState] = useState<ClientState>("idle");
  const [displayName, setDisplayName] = useState("");
  const [items, setItems] = useState<FeedbackItemDraft[]>([emptyItem()]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Part L: "submission success receives accessible focus."
  useEffect(() => {
    if (state === "approved" || state === "changes-submitted") {
      confirmationHeadingRef.current?.focus();
    }
  }, [state]);

  // status === null means no round has ever existed for this invitation
  // — isCurrent is meaningless in that case (there's nothing to compare
  // a revision against, so the server always reports it as false) and
  // must NOT be read as "stale." Staleness only applies to a round that
  // once existed and has since fallen behind the invitation's current
  // revision.
  const notYetOpen = status === null || status === "draft" || status === "ready_to_send" || status === "resolved" || status === "cancelled";
  const stale = !notYetOpen && (status === "superseded" || !isCurrent);

  async function submitApproval() {
    setState("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/preview/${token}/review/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });
      if (!res.ok) {
        setState("error");
        setErrorMessage("This review is no longer available. Please refresh the page.");
        return;
      }
      setState("approved");
    } catch {
      setState("error");
      setErrorMessage("Something went wrong. Please check your connection and try again.");
    }
  }

  function updateItem(index: number, patch: Partial<FeedbackItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => (prev.length >= FEEDBACK_ITEM_MAX_COUNT ? prev : [...prev, emptyItem()]));
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function submitChanges(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!acknowledged) {
      setValidationError("Please confirm you understand this is submitted through the private link before continuing.");
      return;
    }

    const trimmedItems = items.map((item) => ({ ...item, message: item.message.trim().replace(/\s+/g, " ") }));
    if (trimmedItems.every((item) => item.message.length === 0)) {
      setValidationError("Please describe at least one change.");
      return;
    }
    for (const item of trimmedItems) {
      if (item.message && /[<>]/.test(item.message)) {
        setValidationError("Feedback can't contain HTML-like characters (< or >). Please rephrase.");
        return;
      }
    }

    const payloadItems = trimmedItems
      .filter((item) => item.message.length > 0)
      .map((item) => ({
        category: item.category || null,
        sectionId: item.sectionId || null,
        message: item.message,
      }));

    setState("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/preview/${token}/review/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloadItems, displayName: displayName.trim() || null }),
      });
      if (!res.ok) {
        setState("error");
        setErrorMessage("This review is no longer available. Please refresh the page.");
        return;
      }
      setState("changes-submitted");
    } catch {
      setState("error");
      setErrorMessage("Something went wrong. Please check your connection and try again.");
    }
  }

  if (stale) {
    return (
      <section className="mx-auto max-w-lg px-6 py-10 text-center">
        <h2 className="font-display text-xl">This version has changed</h2>
        <p className="mt-2 text-sm text-ink-soft">
          The invitation has been updated since you last reviewed it. An updated version will be shared with you for review — please check back, or reach out to whoever sent you this link.
        </p>
      </section>
    );
  }

  if (notYetOpen) {
    return (
      <section className="mx-auto max-w-lg px-6 py-10 text-center">
        <h2 className="font-display text-xl">Not yet open for review</h2>
        <p className="mt-2 text-sm text-ink-soft">This invitation isn&apos;t ready for your review yet. Please check back soon.</p>
      </section>
    );
  }

  if (state === "approved" || status === "client_approved") {
    return (
      <section className="mx-auto max-w-lg px-6 py-10 text-center">
        <h2 ref={confirmationHeadingRef} tabIndex={-1} className="font-display text-xl outline-none">
          You&apos;ve approved this version
        </h2>
        <p className="mt-2 text-sm text-ink-soft">Thank you! The team has been notified and will take it from here.</p>
        <p className="mt-4 text-[11px] italic text-ink-soft">{UNVERIFIED_IDENTITY_NOTE}</p>
      </section>
    );
  }

  if (state === "changes-submitted" || status === "changes_requested") {
    return (
      <section className="mx-auto max-w-lg px-6 py-10 text-center">
        <h2 ref={confirmationHeadingRef} tabIndex={-1} className="font-display text-xl outline-none">
          Your feedback has been received
        </h2>
        <p className="mt-2 text-sm text-ink-soft">Thank you! The team will review your requested changes and follow up.</p>
        <p className="mt-4 text-[11px] italic text-ink-soft">{UNVERIFIED_IDENTITY_NOTE}</p>
      </section>
    );
  }

  // status === "awaiting_client" from here on.

  return (
    <section className="mx-auto max-w-lg px-6 py-10">
      <h2 className="text-center font-display text-xl">What do you think?</h2>
      <p className="mt-2 text-center text-sm text-ink-soft">Let us know if this is ready, or if you&apos;d like any changes.</p>

      {state === "idle" && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => setState("confirm-approve")}
            className={`rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft ${focusRingClass}`}
          >
            Approve this version
          </button>
          <button
            type="button"
            onClick={() => setState("changes-form")}
            className={`rounded-full border border-line px-6 py-3 text-sm font-medium text-ink transition hover:border-ink ${focusRingClass}`}
          >
            Request changes
          </button>
        </div>
      )}

      {state === "confirm-approve" && (
        <div className="mt-6 rounded-2xl border border-line bg-paper-raised p-5 text-center">
          <p className="text-sm text-ink">Approve this exact version of the invitation?</p>
          <p className="mt-2 text-xs text-ink-soft">This lets the team know it&apos;s ready to move forward. {UNVERIFIED_IDENTITY_NOTE}</p>
          <label className="mt-4 block text-left">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Your name (optional)</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-ring"
              placeholder="Not a verified identity — just a label"
            />
          </label>
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" onClick={() => setState("idle")} className={`rounded-full border border-line px-5 py-2 text-sm text-ink-soft transition hover:border-ink ${focusRingClass}`}>
              Cancel
            </button>
            <button type="button" onClick={submitApproval} className={`rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft ${focusRingClass}`}>
              Yes, approve
            </button>
          </div>
        </div>
      )}

      {state === "submitting" && (
        <p role="status" className="mt-6 text-center text-sm text-ink-soft">
          Submitting…
        </p>
      )}

      {state === "error" && (
        <div role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-center text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {state === "changes-form" && (
        <form onSubmit={submitChanges} className="mt-6 space-y-4 rounded-2xl border border-line bg-paper-raised p-5">
          {items.map((item, index) => (
            <fieldset key={index} className="space-y-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Change {index + 1}</legend>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Category (optional)</span>
                <select
                  value={item.category}
                  onChange={(e) => updateItem(index, { category: e.target.value as FeedbackItemDraft["category"] })}
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-ring"
                >
                  <option value="">Not specified</option>
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {FEEDBACK_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>

              {sections.length > 0 && (
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Which part (optional)</span>
                  <select
                    value={item.sectionId}
                    onChange={(e) => updateItem(index, { sectionId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-ring"
                  >
                    <option value="">Not specified</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.type}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">What would you like changed?</span>
                <textarea
                  value={item.message}
                  onChange={(e) => updateItem(index, { message: e.target.value })}
                  maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-ring"
                />
              </label>

              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(index)} className={`rounded text-xs text-ink-soft underline underline-offset-2 hover:text-red-500 ${focusRingClass}`}>
                  Remove this item
                </button>
              )}
            </fieldset>
          ))}

          {items.length < FEEDBACK_ITEM_MAX_COUNT && (
            <button type="button" onClick={addItem} className={`rounded text-xs font-medium text-ink underline underline-offset-2 ${focusRingClass}`}>
              + Add another change
            </button>
          )}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Your name (optional)</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus-ring"
              placeholder="Not a verified identity — just a label"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-ink-soft">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className={`mt-0.5 rounded ${focusRingClass}`} />
            <span>I understand this is submitted through a private link, and is not a verified identity.</span>
          </label>

          {validationError && (
            <p role="alert" className="text-xs text-red-600">
              {validationError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setState("idle")} className={`rounded-full border border-line px-5 py-2 text-sm text-ink-soft transition hover:border-ink ${focusRingClass}`}>
              Cancel
            </button>
            <button type="submit" className={`rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft ${focusRingClass}`}>
              Submit
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
