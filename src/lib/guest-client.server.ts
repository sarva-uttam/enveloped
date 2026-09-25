import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidGuestTokenFormat } from "@/lib/guest-tokens.server";
import type { GuestInviteView, RsvpStatus } from "@/lib/guests";
import { isRsvpStatus } from "@/lib/guests";
import type { TierId, GeneratedInviteContent } from "@/lib/types";


/**
 * Server-only, TOKEN-gated guest actions — Stage 10. The untrusted,
 * anonymous-reachable side of the guest workflow: every function here
 * accepts a RAW guest token (never a hash, never a guest/invitation id)
 * and hands it straight to a SECURITY DEFINER function that hashes and
 * verifies it internally — the same trust shape as
 * src/lib/review-client.server.ts's submitApproval()/submitChangeRequest().
 * Nothing here ever logs, stores, or echoes the raw token.
 */

/** Redeems a raw guest token — null for an invalid/malformed/revoked
 *  token, a deactivated guest, or an unpublished invitation (unlike a
 *  preview token, a guest link grants no early access — see
 *  get_guest_invite()'s own comment in the migration). */
export async function getGuestInviteServer(token: string): Promise<GuestInviteView | null> {
  if (!isValidGuestTokenFormat(token)) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("get_guest_invite", { p_token: token }).maybeSingle();
  if (error || !data) return null;

  const row = data as {
    invite_id: string;
    slug: string;
    tier: string;
    content: GeneratedInviteContent;
    composition: unknown;
    guest_id: string;
    guest_name: string;
    permitted_attendees: number;
    allow_plus_one: boolean;
    rsvp_status: string;
    attendee_count: number;
    plus_one_name: string | null;
    dietary_notes: string | null;
    event_attendance: unknown;
  };

  return {
    inviteId: row.invite_id,
    slug: row.slug,
    tier: (row.tier as TierId) ?? "bronze",
    content: row.content,
    composition: row.composition ?? null,
    guestId: row.guest_id,
    guestName: row.guest_name,
    permittedAttendees: row.permitted_attendees,
    allowPlusOne: Boolean(row.allow_plus_one),
    rsvpStatus: (isRsvpStatus(row.rsvp_status) ? row.rsvp_status : "pending") as RsvpStatus,
    attendeeCount: row.attendee_count,
    plusOneName: row.plus_one_name,
    dietaryNotes: row.dietary_notes,
    eventAttendance: Array.isArray(row.event_attendance) ? (row.event_attendance as GuestInviteView["eventAttendance"]) : [],
  };
}

const RsvpInputSchema = z.object({
  status: z.enum(["attending", "declined"]),
  attendeeCount: z.number().int().min(0).max(10),
  plusOneName: z
    .string()
    .trim()
    .max(120)
    .refine((v) => !/[<>]/.test(v), { message: "must not contain HTML-like characters" })
    .nullable()
    .optional(),
  dietaryNotes: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !/[<>]/.test(v), { message: "must not contain HTML-like characters" })
    .nullable()
    .optional(),
  eventAttendance: z
    .array(
      z.object({
        scheduleEntryId: z
          .string()
          .trim()
          .max(64)
          .regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        attending: z.boolean(),
      })
    )
    .max(12)
    .optional(),
});

export type SubmitGuestRsvpResult = { ok: true } | { ok: false; reason: "unavailable" | "invalid-input" };

/** Submits (or corrects) an RSVP for whatever guest the token resolves
 *  to. `unavailable` covers every rejection reason identically — bad
 *  token, revoked/inactive guest, unpublished invitation, over-limit
 *  attendee count, plus-one not permitted, unknown schedule entry — by
 *  design, matching submit_review_approval()'s generic-failure shape. */
export async function submitGuestRsvp(token: string, input: unknown): Promise<SubmitGuestRsvpResult> {
  if (!isValidGuestTokenFormat(token)) return { ok: false, reason: "unavailable" };

  const parsed = RsvpInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "unavailable" };

  const { data, error } = await client.rpc("submit_guest_rsvp", {
    p_token: token,
    p_status: parsed.data.status,
    p_attendee_count: parsed.data.attendeeCount,
    p_plus_one_name: parsed.data.plusOneName || null,
    p_dietary_notes: parsed.data.dietaryNotes || null,
    p_event_attendance: parsed.data.eventAttendance ?? [],
  });

  if (error || data !== "ok") return { ok: false, reason: "unavailable" };
  return { ok: true };
}
