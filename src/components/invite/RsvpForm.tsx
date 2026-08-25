"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { submitRsvp } from "@/lib/storage";

export function RsvpForm({
  accent,
  inviteId,
  guestId,
  defaultName,
}: {
  accent: string;
  inviteId?: string;
  guestId?: string;
  defaultName?: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attending, setAttending] = useState<"yes" | "no" | null>(null);
  const [name, setName] = useState(defaultName || "");

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-paper-raised/70 p-6 text-center">
        <Check className="h-6 w-6" style={{ color: accent }} />
        <p className="text-sm text-ink-soft">
          Thank you — your RSVP has been recorded.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!attending || !name.trim()) return;
        setSubmitting(true);
        if (inviteId) {
          await submitRsvp(inviteId, guestId || null, name.trim(), attending);
        }
        setSubmitting(false);
        setSubmitted(true);
      }}
      className="mx-auto max-w-sm rounded-2xl border border-line bg-paper-raised/70 p-6"
    >
      <p className="text-center text-sm font-medium text-ink">Will you be joining us?</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setAttending("yes")}
          className="flex-1 rounded-full border px-4 py-2 text-sm transition"
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
          onClick={() => setAttending("no")}
          className="flex-1 rounded-full border px-4 py-2 text-sm transition"
          style={{
            borderColor: attending === "no" ? accent : "var(--line)",
            background: attending === "no" ? accent : "transparent",
            color: attending === "no" ? "white" : "var(--ink)",
          }}
        >
          Regretfully decline
        </button>
      </div>
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="mt-4 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={!attending || submitting}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
        style={{ background: accent }}
      >
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Send RSVP
      </button>
    </form>
  );
}
