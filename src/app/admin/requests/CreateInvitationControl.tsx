"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CULTURAL_PACK_IDS, CULTURAL_PACKS, type CulturalPackId } from "@/lib/composition/cultural-packs";

/**
 * "Create an invitation draft from this request" — Stage 8 Part C/E.
 * Offers ONLY the two implemented packs (CULTURAL_PACK_IDS itself, never
 * a hand-written list that could drift from the trusted registry or
 * mention an unfinished future pack — Part E: "do not claim future packs
 * are available"). If the server reports the request already has an
 * invitation (a race with another admin tab, or simply stale page state),
 * this redirects to the EXISTING draft instead of retrying — "direct the
 * administrator to the existing invitation instead of silently creating
 * another one."
 */
export function CreateInvitationControl({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [packId, setPackId] = useState<CulturalPackId>(CULTURAL_PACK_IDS[0]);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    setStatus("working");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/create-invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && typeof body.existingInvitationId === "string") {
          router.push(`/admin/invitations/${body.existingInvitationId}`);
          return;
        }
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : "Something went wrong.");
        return;
      }

      router.push(`/admin/invitations/${body.invitationId}`);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Create the invitation</h2>
      <p className="mt-1 text-xs text-ink-soft">
        Starts a structured draft from a trusted design pack. Nothing is published, charged, or shared with the client yet.
      </p>
      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-soft">Design pack</legend>
        <div className="mt-2 space-y-2">
          {CULTURAL_PACK_IDS.map((id) => (
            <label key={id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-ink">
              <input type="radio" name="packId" value={id} checked={packId === id} onChange={() => setPackId(id)} className="focus-ring mt-1" />
              <span>
                <span className="block font-medium text-ink">{CULTURAL_PACKS[id].label}</span>
                <span className="block text-xs text-ink-soft">{CULTURAL_PACKS[id].description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-[11px] text-ink-soft">
        Customs, ceremonies, and terminology are only a starting point — confirm every detail with the client before publishing.
      </p>
      <button
        onClick={create}
        disabled={status === "working"}
        className="focus-ring mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
      >
        {status === "working" ? "Creating…" : "Create invitation draft"}
      </button>
      {message && (
        <p role="status" className="mt-2 text-xs text-red-500">
          {message}
        </p>
      )}
    </div>
  );
}
