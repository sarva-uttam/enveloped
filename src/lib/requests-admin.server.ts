import "server-only";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isRequestStatus,
  isValidRequestStatusTransition,
  type RequestDetail,
  type RequestStatus,
  type RequestSummary,
} from "@/lib/requests";
import type { EventCategory, TierId } from "@/lib/types";

/**
 * Server-only, ADMINISTRATOR-ONLY request-management reads/writes —
 * Stage 8 (see PROJECT_STATUS.md's Stage 8 section, Part B). Same shape
 * as preview-admin.server.ts/composition-admin.server.ts: every function
 * re-verifies admin status itself via checkAdmin() before doing anything,
 * on top of (not instead of) the real RLS policies on `requests`
 * (20260909120000_admin_identity.sql) and the transition-validating
 * trigger (20260912100000_concierge_admin_generator.sql) — defense in
 * depth, not redundancy to trim: an ordinary authenticated caller is
 * rejected here before any query runs, AND would still be rejected by
 * the database itself if this layer were ever bypassed or had a bug.
 *
 * Uses the session-aware SERVER client throughout, never the
 * service-role client — the real authorization decision is is_admin()
 * reading the caller's own session, the same shape as every other admin
 * write in this project.
 */

interface RequestRow {
  id: string;
  reference_code: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_channel: string;
  category: string;
  event_date: string | null;
  tier_interest: string | null;
  requested_occasions: string[];
  notes: string | null;
  internal_notes: string | null;
  agreed_price: number | null;
  agreed_currency: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

function toSummary(row: RequestRow, invitationId: string | null): RequestSummary {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    status: (isRequestStatus(row.status) ? row.status : "new") as RequestStatus,
    name: row.name,
    email: row.email,
    phone: row.phone,
    preferredChannel: row.preferred_channel as RequestSummary["preferredChannel"],
    category: row.category as EventCategory,
    eventDate: row.event_date,
    tierInterest: row.tier_interest as TierId | null,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    invitationId,
  };
}

export type RequestListFilter = { status?: RequestStatus };

/**
 * Lists requests, most recently created first — admin-only. The RLS
 * policy ("requests admin select") already scopes this to nothing at all
 * for a non-admin caller; the checkAdmin() gate here means a non-admin
 * never even reaches that query, so "no rows" and "not authorized" are
 * never confused with each other by this function's own return shape
 * (it returns `null`, not an empty array, for the latter).
 *
 * A left-join lookup against `invites.request_id` in a second query
 * (rather than a Postgres-side join through PostgREST's embedding
 * syntax) keeps this function simple and matches the read-only,
 * admin-select-only shape of the new `invites` policy — one exists check
 * per request id, batched into a single `in (...)` query.
 */
export async function listRequests(filter: RequestListFilter = {}): Promise<RequestSummary[] | null> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  let query = client.from("requests").select("*").order("created_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error || !data) {
    console.error("listRequests: query failed", error?.message);
    return null;
  }

  const rows = data as RequestRow[];
  if (rows.length === 0) return [];

  const { data: invites } = await client
    .from("invites")
    .select("id, request_id")
    .in(
      "request_id",
      rows.map((r) => r.id)
    );
  const invitationByRequest = new Map<string, string>();
  for (const inv of (invites ?? []) as { id: string; request_id: string | null }[]) {
    if (inv.request_id) invitationByRequest.set(inv.request_id, inv.id);
  }

  return rows.map((row) => toSummary(row, invitationByRequest.get(row.id) ?? null));
}

/** Fetches one request's full detail (including internal-only fields the
 *  list view omits) plus whether it's already connected to an
 *  invitation — admin-only, `null` for a non-admin caller or a missing
 *  id, exactly like every other admin read in this project ("collapse
 *  not-authorized and not-found into one safe response" where the
 *  distinction doesn't matter to the caller). */
export async function getRequestDetail(requestId: string): Promise<RequestDetail | null> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (error || !data) return null;

  const row = data as RequestRow;

  const { data: invite } = await client.from("invites").select("id").eq("request_id", requestId).maybeSingle();

  return {
    ...toSummary(row, (invite as { id: string } | null)?.id ?? null),
    requestedOccasions: row.requested_occasions ?? [],
    notes: row.notes,
    internalNotes: row.internal_notes,
    agreedPrice: row.agreed_price,
    agreedCurrency: row.agreed_currency,
    updatedAt: row.updated_at,
  };
}

export type UpdateRequestStatusResult =
  | { ok: true }
  | { ok: false; reason: "not-admin" | "not-found" | "invalid-transition" | "database-error" };

/**
 * The one path this project's own admin UI uses to change a request's
 * status. The REAL enforcement is the database trigger
 * (enforce_request_status_transition(), which re-checks admin status and
 * transition validity itself, and writes the audit row) — this function
 * additionally checks both up front so a bad request never reaches the
 * database at all, and so a rejected transition surfaces here as a clean
 * typed reason rather than a raw Postgres error string the UI would have
 * to pattern-match.
 */
export async function updateRequestStatus(requestId: string, newStatus: RequestStatus): Promise<UpdateRequestStatusResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data: current, error: readError } = await client
    .from("requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();
  if (readError) return { ok: false, reason: "database-error" };
  if (!current) return { ok: false, reason: "not-found" };

  const currentStatus = current.status as RequestStatus;
  if (currentStatus !== newStatus && !isValidRequestStatusTransition(currentStatus, newStatus)) {
    return { ok: false, reason: "invalid-transition" };
  }

  const { error } = await client.from("requests").update({ status: newStatus }).eq("id", requestId);
  if (error) {
    // The trigger raises its own exception text for an invalid
    // transition or a non-admin caller — both already ruled out above,
    // so an error reaching here is a genuine, unexpected failure.
    console.error("updateRequestStatus: update failed", error.message);
    return { ok: false, reason: "database-error" };
  }

  return { ok: true };
}
