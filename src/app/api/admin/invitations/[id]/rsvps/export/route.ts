import { checkAdmin } from "@/lib/auth/admin.server";
import { listInvitationGuests } from "@/lib/guest-admin.server";
import { rowsToCsv } from "@/lib/guest-csv";

/**
 * Admin-only RSVP RESPONSE export — Stage 10. Distinct from the guest
 * LIST export: only guests who have actually responded, with their
 * response detail (attendee count, plus-one, dietary notes, event-level
 * attendance) front and center rather than admin-set permission fields.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Administrator access required." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const { id } = await params;
  const guests = await listInvitationGuests(id);
  const responded = guests.filter((g) => g.rsvpStatus !== "pending");

  const headers = [
    "name",
    "household",
    "rsvpStatus",
    "attendeeCount",
    "plusOneName (guest-submitted, unverified)",
    "dietaryNotes (guest-submitted, unverified)",
    "eventAttendance (guest-submitted, unverified)",
    "respondedAt",
  ];

  const rows = responded.map((g) => [
    g.name,
    g.householdName ?? "",
    g.rsvpStatus,
    g.attendeeCount,
    g.plusOneName ?? "",
    g.dietaryNotes ?? "",
    g.eventAttendance.map((e) => `${e.scheduleEntryId}:${e.attending ? "yes" : "no"}`).join("; "),
    g.respondedAt ?? "",
  ]);

  const csv = rowsToCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rsvps-${id}.csv"`,
    },
  });
}
