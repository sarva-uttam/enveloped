import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { listInvitationGuests, createGuest, listHouseholds, getGuestDashboardSummary } from "@/lib/guest-admin.server";
import {
  GUEST_NAME_MAX_LENGTH,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  INTERNAL_NOTES_MAX_LENGTH,
  MIN_PERMITTED_ATTENDEES,
  MAX_PERMITTED_ATTENDEES,
} from "@/lib/guests";

/**
 * Admin-only guest list — Stage 10. GET returns everything a single
 * page render of the guest-management panel needs (guest rows, the
 * dashboard summary, and available households) in one round trip;
 * POST creates a new guest. Every write here is a thin wrapper around a
 * SECURITY DEFINER function (guest-admin.server.ts), never a raw table
 * write — see supabase/migrations/20260914090000_guest_management.sql.
 */

const GuestInputSchema = z.object({
  name: z.string().trim().min(1).max(GUEST_NAME_MAX_LENGTH),
  householdId: z.string().uuid().nullable().optional(),
  contactEmail: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH).nullable().optional(),
  contactPhone: z.string().trim().max(CONTACT_PHONE_MAX_LENGTH).nullable().optional(),
  permittedAttendees: z.number().int().min(MIN_PERMITTED_ATTENDEES).max(MAX_PERMITTED_ATTENDEES).optional(),
  allowPlusOne: z.boolean().optional(),
  internalNotes: z.string().trim().max(INTERNAL_NOTES_MAX_LENGTH).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await params;
  const [guests, households, dashboard] = await Promise.all([
    listInvitationGuests(id),
    listHouseholds(id),
    getGuestDashboardSummary(id),
  ]);

  return NextResponse.json({ guests, households, dashboard });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await params;
  const rawBody = await req.json().catch(() => null);
  const parsed = GuestInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await createGuest(id, {
    name: parsed.data.name,
    householdId: parsed.data.householdId ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    contactPhone: parsed.data.contactPhone ?? null,
    permittedAttendees: parsed.data.permittedAttendees,
    allowPlusOne: parsed.data.allowPlusOne,
    internalNotes: parsed.data.internalNotes ?? null,
  });

  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "invalid-input" ? 400 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }

  return NextResponse.json({ ok: true, guestId: result.guestId });
}
