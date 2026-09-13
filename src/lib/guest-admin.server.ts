import "server-only";
import { randomBytes } from "crypto";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateGuestToken, hashGuestToken } from "@/lib/guest-tokens.server";
import { slugify } from "@/lib/utils";
import type {
  AdminGuestRow,
  AdminGuestHousehold,
  AdminGuestDashboardSummary,
  GuestCsvImportRow,
  GuestCsvImportRowResult,
  RsvpStatus,
} from "@/lib/guests";

/**
 * Server-only, ADMINISTRATOR-ONLY guest management — Stage 10 (see
 * supabase/migrations/20260914090000_guest_management.sql for the full
 * authorization/audit design). Same fail-closed, checkAdmin()-gated shape
 * as every other *-admin.server.ts file in this project: every function
 * re-verifies admin status itself, and every underlying SQL function
 * independently re-checks is_admin() too — defense in depth, not
 * redundancy to trim.
 *
 * Never uses the service-role client — every call goes through the
 * session-aware SERVER client, so the real authorization decision is
 * is_admin() reading the caller's own session.
 */

export type GuestActionResult = { ok: true } | { ok: false; reason: "not-admin" | "not-found" | "invalid-input" | "database-error" };

function mapGuestRow(row: Record<string, unknown>): AdminGuestRow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    householdId: (row.household_id as string | null) ?? null,
    householdName: (row.household_name as string | null) ?? null,
    contactEmail: (row.contact_email as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    permittedAttendees: row.permitted_attendees as number,
    allowPlusOne: Boolean(row.allow_plus_one),
    internalNotes: (row.internal_notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    rsvpStatus: row.rsvp_status as RsvpStatus,
    attendeeCount: row.attendee_count as number,
    plusOneName: (row.plus_one_name as string | null) ?? null,
    dietaryNotes: (row.dietary_notes as string | null) ?? null,
    eventAttendance: Array.isArray(row.event_attendance) ? (row.event_attendance as AdminGuestRow["eventAttendance"]) : [],
    respondedAt: (row.responded_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    hasLink: Boolean(row.has_link),
    linkRevoked: Boolean(row.link_revoked),
  };
}

/** Every guest for this invitation — empty array (never null) for a
 *  non-admin or an invitation with no guests yet. */
export async function listInvitationGuests(invitationId: string): Promise<AdminGuestRow[]> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return [];

  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client.rpc("admin_list_invite_guests", { p_invite_id: invitationId });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapGuestRow);
}

/** A short, name-derived slug with a random suffix — guaranteed-unique
 *  in practice (8 hex chars of randomness), never a sequential or
 *  otherwise predictable id (Stage 10: "stable machine identifiers", and
 *  separately "no predictable IDs in public URLs" for the LINK token —
 *  this slug is an internal identifier, not the guest's credential, but
 *  keeping it non-predictable too costs nothing). */
function generateGuestSlug(name: string): string {
  const base = slugify(name) || "guest";
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export interface GuestInput {
  name: string;
  householdId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  permittedAttendees?: number;
  allowPlusOne?: boolean;
  internalNotes?: string | null;
}

export type CreateGuestResult = { ok: true; guestId: string } | { ok: false; reason: "not-admin" | "invalid-input" | "database-error" };

export async function createGuest(invitationId: string, input: GuestInput): Promise<CreateGuestResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const name = input.name.trim();
  if (!name || name.length > 160) return { ok: false, reason: "invalid-input" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_create_guest", {
    p_invite_id: invitationId,
    p_name: name,
    p_slug: generateGuestSlug(name),
    p_household_id: input.householdId ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_permitted_attendees: input.permittedAttendees ?? 1,
    p_allow_plus_one: input.allowPlusOne ?? false,
    p_internal_notes: input.internalNotes ?? null,
  });

  if (error) {
    console.error("createGuest: admin_create_guest RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (typeof data !== "string") return { ok: false, reason: "database-error" };
  return { ok: true, guestId: data };
}

export async function updateGuest(guestId: string, input: GuestInput): Promise<GuestActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const name = input.name.trim();
  if (!name || name.length > 160) return { ok: false, reason: "invalid-input" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_update_guest", {
    p_guest_id: guestId,
    p_name: name,
    p_household_id: input.householdId ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_permitted_attendees: input.permittedAttendees ?? 1,
    p_allow_plus_one: input.allowPlusOne ?? false,
    p_internal_notes: input.internalNotes ?? null,
  });

  if (error) {
    console.error("updateGuest: admin_update_guest RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export async function setGuestActive(guestId: string, isActive: boolean): Promise<GuestActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_set_guest_active", { p_guest_id: guestId, p_is_active: isActive });
  if (error) {
    console.error("setGuestActive: admin_set_guest_active RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export type DeleteGuestResult = { ok: true } | { ok: false; reason: "not-admin" | "not-found" | "not-eligible" | "database-error" };

/** Hard-deletes a guest — only succeeds for a guest who has never
 *  responded and never had a link issued (admin_delete_guest()'s own
 *  guard); every other case should use setGuestActive(id, false)
 *  (archive/deactivate) instead. */
export async function deleteGuest(guestId: string): Promise<DeleteGuestResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_delete_guest", { p_guest_id: guestId });
  if (error) {
    if (error.message.includes("already responded") || error.message.includes("issued link")) {
      return { ok: false, reason: "not-eligible" };
    }
    console.error("deleteGuest: admin_delete_guest RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Personalized guest link lifecycle — the ONLY module that ever
// generates a raw guest token. The raw token is returned exactly once,
// from the return value of the function that created or rotated it, and
// never again — nothing here persists it beyond the call.
// ---------------------------------------------------------------------

export type GuestLinkResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not-admin" | "guest-not-found" | "already-exists" | "database-error" };

export async function createGuestLink(guestId: string): Promise<GuestLinkResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const token = generateGuestToken();
  const tokenHash = hashGuestToken(token);

  const { error } = await client.rpc("admin_create_guest_link", { p_guest_id: guestId, p_token_hash: tokenHash });
  if (error) {
    if (error.message.includes("already exists")) return { ok: false, reason: "already-exists" };
    if (error.message.includes("not found")) return { ok: false, reason: "guest-not-found" };
    console.error("createGuestLink: admin_create_guest_link RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }

  return { ok: true, token };
}

export async function rotateGuestLink(guestId: string): Promise<GuestLinkResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const token = generateGuestToken();
  const tokenHash = hashGuestToken(token);

  const { data, error } = await client.rpc("admin_rotate_guest_link", { p_guest_id: guestId, p_token_hash: tokenHash });
  if (error) {
    console.error("rotateGuestLink: admin_rotate_guest_link RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "guest-not-found" };

  return { ok: true, token };
}

export async function revokeGuestLink(guestId: string): Promise<GuestActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_revoke_guest_link", { p_guest_id: guestId });
  if (error) {
    console.error("revokeGuestLink: admin_revoke_guest_link RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Households — plain admin CRUD (invite_guest_households has a direct
// admin RLS policy, same shape as requests/templates; no state-machine
// invariant to protect, so no RPC wrapper is needed here).
// ---------------------------------------------------------------------

export async function listHouseholds(invitationId: string): Promise<AdminGuestHousehold[]> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return [];

  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("invite_guest_households")
    .select("id, name, created_at")
    .eq("invite_id", invitationId)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data.map((h) => ({ id: h.id, name: h.name, createdAt: h.created_at }));
}

export type CreateHouseholdResult = { ok: true; householdId: string } | { ok: false; reason: "not-admin" | "invalid-input" | "database-error" };

export async function createHousehold(invitationId: string, name: string): Promise<CreateHouseholdResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) return { ok: false, reason: "invalid-input" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.from("invite_guest_households").insert({ invite_id: invitationId, name: trimmed }).select("id").single();
  if (error || !data) return { ok: false, reason: "database-error" };
  return { ok: true, householdId: data.id };
}

export async function deleteHousehold(householdId: string): Promise<GuestActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { error, count } = await client.from("invite_guest_households").delete({ count: "exact" }).eq("id", householdId);
  if (error) return { ok: false, reason: "database-error" };
  if (!count) return { ok: false, reason: "not-found" };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Dashboard — exact counts only.
// ---------------------------------------------------------------------

export async function getGuestDashboardSummary(invitationId: string): Promise<AdminGuestDashboardSummary | null> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("admin_guest_dashboard_summary", { p_invite_id: invitationId }).maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    totalInvited: Number(row.total_invited),
    responded: Number(row.responded),
    attending: Number(row.attending),
    declined: Number(row.declined),
    pending: Number(row.pending),
    totalExpectedAttendees: Number(row.total_expected_attendees),
    plusOneCount: Number(row.plus_one_count),
    withDietaryNotes: Number(row.with_dietary_notes),
  };
}

// ---------------------------------------------------------------------
// Bulk CSV import — apply phase only (preview/validation happens
// entirely client-side in src/lib/guest-csv.ts before this is ever
// called; this function re-validates defensively regardless, and the
// underlying admin_bulk_import_guests() SQL function does so again).
// Link generation, when explicitly requested, happens AFTER the import
// commits, one guest at a time, through the exact same createGuestLink()
// used everywhere else — never inside the import transaction itself, so
// token generation always stays in trusted Node code, never SQL.
// ---------------------------------------------------------------------

export type BulkImportResult =
  | { ok: true; inserted: number; results: GuestCsvImportRowResult[]; generatedLinks: Record<string, string> }
  | { ok: false; reason: "not-admin" | "too-many-rows" | "database-error" };

export async function bulkImportGuests(
  invitationId: string,
  rows: GuestCsvImportRow[],
  generateLinks: boolean
): Promise<BulkImportResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  if (rows.length === 0 || rows.length > 500) return { ok: false, reason: "too-many-rows" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_bulk_import_guests", {
    p_invite_id: invitationId,
    p_rows: rows.map((r) => ({
      name: r.name,
      householdName: r.householdName ?? null,
      contactEmail: r.contactEmail ?? null,
      contactPhone: r.contactPhone ?? null,
      permittedAttendees: r.permittedAttendees ?? null,
      allowPlusOne: r.allowPlusOne ?? null,
      internalNotes: r.internalNotes ?? null,
    })),
  });

  if (error) {
    console.error("bulkImportGuests: admin_bulk_import_guests RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }

  const payload = data as { inserted: number; results: GuestCsvImportRowResult[] };
  const generatedLinks: Record<string, string> = {};

  if (generateLinks) {
    for (const result of payload.results) {
      if (result.status === "inserted" && result.guestId) {
        const linkResult = await createGuestLink(result.guestId);
        if (linkResult.ok) {
          generatedLinks[result.guestId] = linkResult.token;
        }
      }
    }
  }

  return { ok: true, inserted: payload.inserted, results: payload.results, generatedLinks };
}
