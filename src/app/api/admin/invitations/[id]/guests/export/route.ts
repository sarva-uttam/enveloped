import { checkAdmin } from "@/lib/auth/admin.server";
import { listInvitationGuests } from "@/lib/guest-admin.server";
import { rowsToCsv } from "@/lib/guest-csv";

/**
 * Admin-only guest-list CSV export — Stage 10. Only fields appropriate
 * for operational use (never token hashes — listInvitationGuests()'s own
 * return shape has no such field to begin with, so there is no code path
 * that could include one). Guest-SUBMITTED fields (plus-one name, dietary
 * notes) are clearly labelled as such in the header, distinct from
 * admin-set fields. Every cell passes through rowsToCsv()'s
 * formula-injection sanitization.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Administrator access required." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const { id } = await params;
  const guests = await listInvitationGuests(id);

  const headers = [
    "name",
    "household",
    "contactEmail",
    "contactPhone",
    "permittedAttendees",
    "allowPlusOne",
    "isActive",
    "rsvpStatus",
    "attendeeCount",
    "plusOneName (guest-submitted, unverified)",
    "dietaryNotes (guest-submitted, unverified)",
    "hasLink",
    "linkRevoked",
    "createdAt",
  ];

  const rows = guests.map((g) => [
    g.name,
    g.householdName ?? "",
    g.contactEmail ?? "",
    g.contactPhone ?? "",
    g.permittedAttendees,
    g.allowPlusOne,
    g.isActive,
    g.rsvpStatus,
    g.attendeeCount,
    g.plusOneName ?? "",
    g.dietaryNotes ?? "",
    g.hasLink,
    g.linkRevoked,
    g.createdAt,
  ]);

  const csv = rowsToCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests-${id}.csv"`,
    },
  });
}
