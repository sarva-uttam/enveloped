import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { bulkImportGuests } from "@/lib/guest-admin.server";
import { MAX_IMPORT_ROWS, HOUSEHOLD_NAME_MAX_LENGTH, CONTACT_EMAIL_MAX_LENGTH, CONTACT_PHONE_MAX_LENGTH, INTERNAL_NOTES_MAX_LENGTH } from "@/lib/guests";

/**
 * Admin-only CSV import APPLY step — Stage 10. The preview/validation
 * step (column mapping, per-row errors, duplicate flags) happens entirely
 * client-side (src/lib/guest-csv.ts's parseGuestImportCsv(), run in the
 * browser against the file the admin just chose) — nothing is sent here
 * until the admin has reviewed that preview and explicitly confirmed.
 * This route re-validates the already-mapped rows regardless (defense in
 * depth — never trust that the client-side preview was the only check),
 * and the underlying admin_bulk_import_guests() SQL function validates a
 * third time. Never generates links unless `generateLinks` is explicitly
 * true — "no automatic link generation unless explicitly selected."
 */

const RowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  householdName: z.string().trim().max(HOUSEHOLD_NAME_MAX_LENGTH).nullable().optional(),
  contactEmail: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH).nullable().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(CONTACT_PHONE_MAX_LENGTH).nullable().optional(),
  permittedAttendees: z.number().int().min(1).max(10).nullable().optional(),
  allowPlusOne: z.boolean().nullable().optional(),
  internalNotes: z.string().trim().max(INTERNAL_NOTES_MAX_LENGTH).nullable().optional(),
});

const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(MAX_IMPORT_ROWS),
  generateLinks: z.boolean().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await bulkImportGuests(
    id,
    parsed.data.rows.map((r) => ({ ...r, contactEmail: r.contactEmail || null })),
    parsed.data.generateLinks
  );

  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "too-many-rows" ? 400 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }

  return NextResponse.json({ ok: true, inserted: result.inserted, results: result.results, generatedLinks: result.generatedLinks });
}
