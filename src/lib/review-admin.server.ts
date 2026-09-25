import "server-only";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReviewRoundStatus, FeedbackCategory, AdminReviewRound, AdminReviewFeedbackItem } from "@/lib/review";

/**
 * Server-only, ADMINISTRATOR-ONLY review-round management — Stage 9
 * (see PROJECT_STATUS.md's Stage 9 section, Part G). Same fail-closed,
 * checkAdmin()-gated shape as every other *-admin.server.ts file in
 * this project: every function re-verifies admin status itself, and
 * every underlying SQL function independently re-checks is_admin() too
 * — defense in depth, not redundancy to trim.
 *
 * Every mutation here is a thin wrapper around one narrow, single-
 * purpose SECURITY DEFINER function (never a raw table write) —
 * supabase/migrations/20260913120000_client_review_workflow.sql has the
 * full authorization/transition/audit design for each one.
 */

export type ReviewActionResult = { ok: true } | { ok: false; reason: "not-admin" | "not-found" | "database-error" };

export type CreateReviewRoundResult =
  | { ok: true; reviewRoundId: string }
  | { ok: false; reason: "not-admin" | "invite-not-found" | "already-active" | "database-error" };

/** Starts a new review round, bound to the invitation's CURRENT
 *  composition revision at the moment of creation — see
 *  admin_create_review_round()'s own comment for why that binding never
 *  changes afterward. Fails with `already-active` if a non-terminal
 *  round already exists (the database's partial unique index is the
 *  real guarantee; this just surfaces a specific reason). */
export async function createReviewRound(invitationId: string): Promise<CreateReviewRoundResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_create_review_round", { p_invite_id: invitationId });

  if (error) {
    if (error.message.includes("already exists")) return { ok: false, reason: "already-active" };
    if (error.message.includes("not found")) return { ok: false, reason: "invite-not-found" };
    console.error("createReviewRound: admin_create_review_round RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (typeof data !== "string") return { ok: false, reason: "database-error" };

  return { ok: true, reviewRoundId: data };
}

async function callBooleanRoundAction(rpcName: string, reviewRoundId: string): Promise<ReviewActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc(rpcName, { p_review_round_id: reviewRoundId });
  if (error) {
    console.error(`${rpcName} RPC failed`, error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export async function markReviewRoundReady(reviewRoundId: string): Promise<ReviewActionResult> {
  return callBooleanRoundAction("admin_mark_review_round_ready", reviewRoundId);
}

/** Records that the admin actually shared the link — Part J: "do not
 *  claim a preview was delivered merely because a link was created or
 *  copied." Calling this is the explicit statement that delivery
 *  happened; nothing else in this project ever sets sent_at. */
export async function sendReviewRound(reviewRoundId: string): Promise<ReviewActionResult> {
  return callBooleanRoundAction("admin_send_review_round", reviewRoundId);
}

export async function cancelReviewRound(reviewRoundId: string): Promise<ReviewActionResult> {
  return callBooleanRoundAction("admin_cancel_review_round", reviewRoundId);
}

export async function resolveReviewRound(reviewRoundId: string): Promise<ReviewActionResult> {
  return callBooleanRoundAction("admin_resolve_review_round", reviewRoundId);
}

export async function resolveReviewFeedbackItem(feedbackItemId: string): Promise<ReviewActionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_resolve_review_feedback_item", { p_feedback_item_id: feedbackItemId });
  if (error) {
    console.error("resolveReviewFeedbackItem: admin_resolve_review_feedback_item RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Admin read model — chronological review history (Part G: "inspect
// chronological review history," "distinguish current-revision approval
// from historical approval of an older revision"). Reached through the
// ordinary session-aware client, relying on review_rounds'/
// review_feedback_items' one admin-only SELECT policy — never the
// service-role client, so the real authorization decision is still
// is_admin() reading the caller's own session.
// ---------------------------------------------------------------------

/** Every review round for this invitation, newest first, each carrying
 *  its own structured feedback items (if any) — the complete history a
 *  single admin page render needs, in one function. Returns an empty
 *  array (never null) for a non-admin or an invitation with no rounds
 *  yet, so callers can render "no review started" without a separate
 *  null-check branch. */
export async function getInvitationReviewHistory(invitationId: string): Promise<AdminReviewRound[]> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return [];

  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data: rounds, error: roundsError } = await client
    .from("review_rounds")
    .select("id, round_number, status, composition_revision, created_at, sent_at, opened_at, decided_at, decision_display_name, resolved_at, superseded_at, cancelled_at")
    .eq("invite_id", invitationId)
    .order("round_number", { ascending: false });

  if (roundsError || !rounds || rounds.length === 0) return [];

  const roundIds = rounds.map((r) => r.id as string);
  const { data: items } = await client
    .from("review_feedback_items")
    .select("id, review_round_id, category, section_id, message, display_name, created_at, resolved_at")
    .in("review_round_id", roundIds)
    .order("created_at", { ascending: true });

  const itemsByRound = new Map<string, AdminReviewFeedbackItem[]>();
  for (const item of items ?? []) {
    const list = itemsByRound.get(item.review_round_id as string) ?? [];
    list.push({
      id: item.id,
      category: (item.category as FeedbackCategory | null) ?? null,
      sectionId: item.section_id ?? null,
      message: item.message,
      displayName: item.display_name ?? null,
      createdAt: item.created_at,
      resolvedAt: item.resolved_at ?? null,
    });
    itemsByRound.set(item.review_round_id as string, list);
  }

  return rounds.map((r) => ({
    id: r.id,
    roundNumber: r.round_number,
    status: r.status as ReviewRoundStatus,
    compositionRevision: r.composition_revision,
    createdAt: r.created_at,
    sentAt: r.sent_at ?? null,
    openedAt: r.opened_at ?? null,
    decidedAt: r.decided_at ?? null,
    decisionDisplayName: r.decision_display_name ?? null,
    resolvedAt: r.resolved_at ?? null,
    supersededAt: r.superseded_at ?? null,
    cancelledAt: r.cancelled_at ?? null,
    feedbackItems: itemsByRound.get(r.id) ?? [],
  }));
}
