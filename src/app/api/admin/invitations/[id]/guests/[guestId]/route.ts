import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { updateGuest, deleteGuest, setGuestActive, createGuestLink, rotateGuestLink, revokeGuestLink } from "@/lib/guest-admin.server";
import { GUEST_NAME_MAX_LENGTH, CONTACT_EMAIL_MAX_LENGTH, CONTACT_PHONE_MAX_LENGTH, INTERNAL_NOTES_MAX_LENGTH, MIN_PERMITTED_ATTENDEES, MAX_PERMITTED_ATTENDEES } from "@/lib/guests";

/**
 * Admin-only single-guest operations — Stage 10. PATCH edits fields;
 * DELETE hard-deletes (only succeeds for a guest never linked/never
 * responded — admin_delete_guest()'s own guard, surfaced here as 409);
 * POST handles every link-lifecycle and active-state action through one
 * `action` field, the same shape publish/route.ts and reviews/[roundId]/
 * route.ts already use for a small fixed set of single-purpose actions.
 *
 * A create/rotate response includes the raw token — the ONE time it is
 * ever returned. It is never logged, never stored beyond this response
 * body, and the client is responsible for showing the same
 * one-time-only warning src/app/admin/PreviewLinkTool.tsx already
 * established for preview links.
 */

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(GUEST_NAME_MAX_LENGTH),
  householdId: z.string().uuid().nullable().optional(),
  contactEmail: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH).nullable().optional(),
  contactPhone: z.string().trim().max(CONTACT_PHONE_MAX_LENGTH).nullable().optional(),
  permittedAttendees: z.number().int().min(MIN_PERMITTED_ATTENDEES).max(MAX_PERMITTED_ATTENDEES).optional(),
  allowPlusOne: z.boolean().optional(),
  internalNotes: z.string().trim().max(INTERNAL_NOTES_MAX_LENGTH).nullable().optional(),
});

const ActionSchema = z.object({ action: z.enum(["activate", "deactivate", "create-link", "rotate-link", "revoke-link"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { guestId } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await updateGuest(guestId, {
    name: parsed.data.name,
    householdId: parsed.data.householdId ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    contactPhone: parsed.data.contactPhone ?? null,
    permittedAttendees: parsed.data.permittedAttendees,
    allowPlusOne: parsed.data.allowPlusOne,
    internalNotes: parsed.data.internalNotes ?? null,
  });

  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { guestId } = await params;
  const result = await deleteGuest(guestId);

  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : result.reason === "not-eligible" ? 409 : 500;
    const error =
      result.reason === "not-eligible"
        ? "This guest has already responded or has an issued link — deactivate instead of deleting."
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { guestId } = await params;
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  switch (parsed.data.action) {
    case "activate":
    case "deactivate": {
      const result = await setGuestActive(guestId, parsed.data.action === "activate");
      if (!result.ok) {
        const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
      }
      return NextResponse.json({ ok: true });
    }
    case "create-link":
    case "rotate-link": {
      const result = parsed.data.action === "create-link" ? await createGuestLink(guestId) : await rotateGuestLink(guestId);
      if (!result.ok) {
        const status = result.reason === "not-admin" ? 403 : result.reason === "guest-not-found" ? 404 : result.reason === "already-exists" ? 409 : 500;
        const error = result.reason === "already-exists" ? "A link already exists for this guest — rotate it instead." : "Something went wrong. Please try again.";
        return NextResponse.json({ error }, { status });
      }
      return NextResponse.json({ ok: true, token: result.token });
    }
    case "revoke-link": {
      const result = await revokeGuestLink(guestId);
      if (!result.ok) {
        const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
      }
      return NextResponse.json({ ok: true });
    }
  }
}
