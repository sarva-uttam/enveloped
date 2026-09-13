import "server-only";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { buildCompositionFromPack } from "@/lib/composition-admin.server";
import type { InvitationComposition } from "@/lib/composition/schema";
import { isKnownCulturalPackId, type CulturalPackId } from "@/lib/composition/cultural-packs";
import type { EventCategory, TierId } from "@/lib/types";
import type { RequestDetail } from "@/lib/requests";

/**
 * Server-only, ADMINISTRATOR-ONLY invitation-authoring orchestration —
 * Stage 8 (see PROJECT_STATUS.md's Stage 8 section, Parts C/D/I). Same
 * fail-closed, checkAdmin()-gated shape as every other *.server.ts file
 * in this project; every write goes through a dedicated SECURITY DEFINER
 * function (never a raw table write), and every function here re-checks
 * admin status itself even though the database independently does too.
 */

// ---------------------------------------------------------------------
// Create an invitation from a request (Part C)
// ---------------------------------------------------------------------

export type CreateInvitationResult =
  | { ok: true; invitationId: string }
  | { ok: false; reason: "not-admin" | "request-not-found" | "already-exists"; existingInvitationId?: string }
  | { ok: false; reason: "invalid-pack" | "database-error" };

/**
 * Creates the invitation draft for a request — Part C in full: server-
 * side only, admin-checked twice (here, and again inside the database
 * function), duplicate-proof (checked here for a friendly redirect
 * target, and structurally guaranteed by the database's own partial
 * unique index regardless of any race), copies ONLY category/tier/name-
 * derived-slug from the request (never notes/internal_notes/email/phone
 * into anything that will ever render), never sets paid/published_at/
 * owner_id, never invents cultural or ceremony detail beyond the
 * SELECTED pack's own generic placeholders (buildCompositionFromPack()),
 * and generates no preview link at all — that remains a separate,
 * explicit administrator action (Part H).
 */
export async function createInvitationFromRequest(params: {
  requestId: string;
  packId: string;
}): Promise<CreateInvitationResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  if (!isKnownCulturalPackId(params.packId)) {
    return { ok: false, reason: "invalid-pack" };
  }

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data: request, error: requestError } = await client
    .from("requests")
    .select("id, name, category, tier_interest")
    .eq("id", params.requestId)
    .maybeSingle();
  if (requestError) return { ok: false, reason: "database-error" };
  if (!request) return { ok: false, reason: "request-not-found" };

  const { data: existing } = await client
    .from("invites")
    .select("id")
    .eq("request_id", params.requestId)
    .maybeSingle();
  if (existing) return { ok: false, reason: "already-exists", existingInvitationId: (existing as { id: string }).id };

  const composition = buildCompositionFromPack({
    packId: params.packId,
    eventCategory: request.category as EventCategory,
  });
  if (!composition) return { ok: false, reason: "invalid-pack" };

  const slug = await generateUniqueSlug(client, request.name ?? request.category);
  const tier: TierId = (request.tier_interest as TierId | null) ?? "bronze";

  const { data, error } = await client.rpc("admin_create_invitation_from_request", {
    p_request_id: params.requestId,
    p_slug: slug,
    p_category: request.category,
    p_tier: tier,
    p_composition: composition,
    p_occasion: null,
    p_occasion_custom_label: null,
  });

  if (error) {
    if (error.message.includes("already has an invitation")) return { ok: false, reason: "already-exists" };
    console.error("createInvitationFromRequest: RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (typeof data !== "string") return { ok: false, reason: "database-error" };

  return { ok: true, invitationId: data };
}

/** `slugify(name) + "-" + a short random suffix`, retried a few times on
 *  a collision (the `invites.slug` unique constraint is the real
 *  guarantee; this loop just makes a collision — vanishingly unlikely,
 *  never expected in practice — a retry instead of a hard failure). */
async function generateUniqueSlug(client: Awaited<ReturnType<typeof createServerSupabaseClient>>, base: string): Promise<string> {
  const root = slugify(base) || "invite";
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const candidate = `${root}-${suffix}`;
    const { data } = await client!.from("invites").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Exceedingly unlikely fallback — timestamp is unique enough on its own.
  return `${root}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------
// Admin invitation detail (Part D/F/G) — the editor's own read model
// ---------------------------------------------------------------------

export interface AdminInvitationDetail {
  id: string;
  slug: string;
  category: EventCategory;
  tier: TierId;
  requestId: string | null;
  publishedAt: string | null;
  paid: boolean;
  hasPreviewLink: boolean;
  composition: unknown | null;
  compositionRevision: number;
}

/**
 * The editor's read model — deliberately narrow, matching
 * OwnerInviteViewModel's own "never send more than the consumer needs"
 * discipline: never returns owner_id, paypal_order_id, or any preview
 * token/hash (see hasPreviewLink below — a boolean, never the hash
 * itself, never even whether the table row is active vs revoked beyond
 * that one bit). `composition` is returned RAW/unvalidated — the editor
 * validates it itself before ever rendering or re-saving it, the same
 * division of responsibility StoredInvite.composition already
 * established for the owner-management read path.
 */
export async function getAdminInvitationDetail(invitationId: string): Promise<AdminInvitationDetail | null> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("invites")
    .select("id, slug, category, tier, request_id, published_at, paid, composition, composition_revision")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !data) return null;

  const { data: preview } = await client
    .from("invite_previews")
    .select("revoked_at")
    .eq("invite_id", invitationId)
    .maybeSingle();

  return {
    id: data.id,
    slug: data.slug,
    category: data.category as EventCategory,
    tier: data.tier as TierId,
    requestId: data.request_id,
    publishedAt: data.published_at,
    paid: Boolean(data.paid),
    hasPreviewLink: Boolean(preview && !(preview as { revoked_at: string | null }).revoked_at),
    composition: data.composition ?? null,
    compositionRevision: data.composition_revision ?? 0,
  };
}

/** Lists every admin-visible invitation connected to a request — used by
 *  the request detail page to link straight to an existing draft instead
 *  of offering to create a duplicate. Returns `null` for a non-admin. */
export async function getInvitationIdForRequest(requestId: string): Promise<string | null> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return null;
  const client = await createServerSupabaseClient();
  if (!client) return null;
  const { data } = await client.from("invites").select("id").eq("request_id", requestId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---------------------------------------------------------------------
// Publish / unpublish (Part I) — thin wrappers around the EXISTING,
// already-hardened publish_invite()/unpublish_invite() functions
// (20260909150000_publication_payment_split.sql). Nothing new added to
// the database for this — "linked from the admin route only after
// inspection," not re-implemented.
// ---------------------------------------------------------------------

export type PublishResult = { ok: true } | { ok: false; reason: "not-admin" | "not-found" | "database-error" };

export async function publishInvitation(invitationId: string): Promise<PublishResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };
  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };
  const { data, error } = await client.rpc("publish_invite", { p_invite_id: invitationId });
  if (error) return { ok: false, reason: "database-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export async function unpublishInvitation(invitationId: string): Promise<PublishResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };
  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };
  const { data, error } = await client.rpc("unpublish_invite", { p_invite_id: invitationId });
  if (error) return { ok: false, reason: "database-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

/**
 * Publication readiness (Part I) now lives in
 * src/lib/composition/readiness.ts — deliberately NOT `server-only`
 * (unlike everything else in this file), so the live editor (a Client
 * Component) can re-run the identical assessment against an in-progress
 * draft, not just the server-fetched saved state. Re-exported here so
 * existing/future server-side callers keep one import path.
 * `RequestDetail` (this module's own richer type) is a structural
 * superset of readiness.ts's `PrivateFieldsForLeakCheck` — passed
 * straight through, no adapter needed.
 */
export { assessPublicationReadiness, type ReadinessIssue, type ReadinessReport } from "@/lib/composition/readiness";

export type { InvitationComposition, CulturalPackId };
export type { RequestDetail };
