"use client";

import { useId, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { EventAttendanceEntry, RsvpStatus } from "@/lib/guests";

/**
 * The guest's real RSVP experience — Stage 10. Deliberately a SEPARATE
 * component from the composition schema's generic `RsvpSection`/RsvpForm
 * (rendered with `canRsvp={false}` on this route — see
 * src/app/guest/[token]/page.tsx), the same "physically separate,
 * independently evolvable" posture Stage 9's ReviewSection already
 * established relative to CompositionRenderer: a personalized guest link
 * carries admin-set permissions (attendee limit, plus-one) and richer
 * response data (event-level attendance, dietary notes) the generic
 * section has no concept of.
 *
 * `token` is received as a prop only because the POST call target
 * (`/api/guest/[token]/rsvp`) needs it in the URL — the same precedent
 * already established by ReviewSection.tsx for preview-token POSTs.
 * Never written to localStorage/sessionStorage, never logged.
 */
export function GuestRsvpPanel({
  token,
  accent,
  guestName,
  permittedAttendees,
  allowPlusOne,
  initialStatus,
  initialAttendeeCount,
  initialPlusOneName,
  initialDietaryNotes,
  initialEventAttendance,
  scheduleEntries,
}: {
  token: string;
  accent: string;
  guestName: string;
  permittedAttendees: number;
  allowPlusOne: boolean;
  initialStatus: RsvpStatus;
  initialAttendeeCount: number;
  initialPlusOneName: string | null;
  initialDietaryNotes: string | null;
  initialEventAttendance: EventAttendanceEntry[];
  scheduleEntries: { id: string; label: string }[];
}) {
  const [status, setStatus] = useState<RsvpStatus>(initialStatus);
  const [attending, setAttending] = useState<"yes" | "no" | null>(
    initialStatus === "attending" ? "yes" : initialStatus === "declined" ? "no" : null
  );
  const [attendeeCount, setAttendeeCount] = useState(Math.max(1, initialAttendeeCount || 1));
  const [plusOneName, setPlusOneName] = useState(initialPlusOneName ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(initialDietaryNotes ?? "");
  const [eventAttendance, setEventAttendance] = useState<Record<string, boolean>>(
    Object.fromEntries(initialEventAttendance.map((e) => [e.scheduleEntryId, e.attending]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dietaryId = useId();

  const hasPlusOneSlot = allowPlusOne && permittedAttendees > 1 && attendeeCount > 1;

  async function submit() {
    if (!attending) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${token}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: attending === "yes" ? "attending" : "declined",
          attendeeCount: attending === "yes" ? attendeeCount : 0,
          plusOneName: attending === "yes" && hasPlusOneSlot ? plusOneName.trim() || null : null,
          dietaryNotes: attending === "yes" ? dietaryNotes.trim() || null : null,
          eventAttendance:
            attending === "yes"
              ? scheduleEntries.map((e) => ({ scheduleEntryId: e.id, attending: eventAttendance[e.id] ?? true }))
              : [],
        }),
      });
      if (!res.ok) {
        setError("We couldn't record your response — please try again in a moment.");
        setSubmitting(false);
        return;
      }
      setStatus(attending === "yes" ? "attending" : "declined");
      setSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (status !== "pending") {
    return (
      <div
        role="status"
        className="mx-auto max-w-sm rounded-2xl border border-line bg-paper-raised/70 p-6 text-center"
      >
        {status === "attending" ? (
          <Check className="mx-auto h-6 w-6" style={{ color: accent }} aria-hidden="true" />
        ) : (
          <X className="mx-auto h-6 w-6 text-ink-soft" aria-hidden="true" />
        )}
        <p className="mt-2 text-sm text-ink-soft">
          {status === "attending"
            ? `Thank you, ${guestName} — we can't wait to celebrate with you.`
            : `Thank you for letting us know, ${guestName} — you'll be missed.`}
        </p>
        <button
          type="button"
          onClick={() => setStatus("pending")}
          className="focus-ring mt-3 rounded-full border border-line px-4 py-1.5 text-xs text-ink-soft transition hover:border-ink"
        >
          Change my response
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mx-auto max-w-sm rounded-2xl border border-line bg-paper-raised/70 p-6"
    >
      <p className="text-center text-sm font-medium text-ink">Will you be joining us, {guestName}?</p>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          aria-pressed={attending === "yes"}
          onClick={() => setAttending("yes")}
          className="focus-ring flex-1 rounded-full border px-4 py-2 text-sm transition"
          style={{
            borderColor: attending === "yes" ? accent : "var(--line)",
            background: attending === "yes" ? accent : "transparent",
            color: attending === "yes" ? "white" : "var(--ink)",
          }}
        >
          Joyfully accept
        </button>
        <button
          type="button"
          aria-pressed={attending === "no"}
          onClick={() => setAttending("no")}
          className="focus-ring flex-1 rounded-full border px-4 py-2 text-sm transition"
          style={{
            borderColor: attending === "no" ? accent : "var(--line)",
            background: attending === "no" ? accent : "transparent",
            color: attending === "no" ? "white" : "var(--ink)",
          }}
        >
          Regretfully decline
        </button>
      </div>

      {attending === "yes" && (
        <div className="mt-4 space-y-4">
          {permittedAttendees > 1 && (
            <label className="block text-xs text-ink-soft">
              Number attending (up to {permittedAttendees})
              <select
                value={attendeeCount}
                onChange={(e) => setAttendeeCount(Number(e.target.value))}
                className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
              >
                {Array.from({ length: permittedAttendees }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}

          {hasPlusOneSlot && (
            <label className="block text-xs text-ink-soft">
              Guest name
              <input
                value={plusOneName}
                onChange={(e) => setPlusOneName(e.target.value)}
                maxLength={120}
                placeholder="Who's joining you?"
                className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
              />
            </label>
          )}

          {scheduleEntries.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs text-ink-soft">Which events will you attend?</legend>
              {scheduleEntries.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={eventAttendance[entry.id] ?? true}
                    onChange={(e) => setEventAttendance((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                    className="focus-ring h-4 w-4 rounded border-line"
                  />
                  {entry.label}
                </label>
              ))}
            </fieldset>
          )}

          <label htmlFor={dietaryId} className="block text-xs text-ink-soft">
            Dietary or accessibility notes (optional)
            <textarea
              id={dietaryId}
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              maxLength={500}
              rows={2}
              className="focus-ring mt-1 w-full rounded-2xl border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-500">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!attending || submitting}
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
        style={{ background: accent }}
      >
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        Send RSVP
      </button>
    </form>
  );
}
