import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "./supabase-clients";

/**
 * Fixture helpers shared by the behavioral integration test files.
 * Everything here uses the service-role client (bypasses RLS entirely) —
 * appropriate for ARRANGING test state; the tests themselves always
 * exercise the anon/authenticated clients to observe RLS/RPC behavior.
 */

export interface InviteFixtureInput {
  slug: string;
  ownerId?: string | null;
  paid?: boolean;
  tier?: "bronze" | "silver" | "gold" | "platinum";
  category?: string;
  answers?: Record<string, unknown>;
  content?: Record<string, unknown> | null;
  generatorKind?: string | null;
  publishedAt?: string | null;
}

/** Inserts a raw `invites` row with full control over every column that
 *  matters for the RLS/RPC tests — service-role only, so callers must
 *  never treat this as "what the app does" (the app inserts through the
 *  authenticated owner's own client with no owner_id sent at all — see
 *  createOwnedInvite() below for that path instead). */
export async function createInviteFixture(input: InviteFixtureInput) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("invites")
    .insert({
      slug: input.slug,
      category: input.category ?? "wedding-other",
      tier: input.tier ?? "gold",
      answers: input.answers ?? { eventDate: "2027-06-01T18:00:00Z", song: "Test Song" },
      content: input.content === undefined ? { headline: "Test Headline" } : input.content,
      paid: input.paid ?? false,
      owner_id: input.ownerId ?? null,
      generator_kind: input.generatorKind ?? null,
      published_at: input.publishedAt ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createInviteFixture(${input.slug}) failed: ${error?.message ?? "no row returned"}`);
  }
  return data as { id: string; slug: string; [key: string]: unknown };
}

/** Inserts an invite the way the real app does — through the owner's OWN
 *  authenticated client, sending no owner_id at all, relying entirely on
 *  the column default (`default auth.uid()`). Proves the default itself
 *  works, not just that a service-role-set owner_id is respected later. */
export async function createOwnedInvite(ownerClient: SupabaseClient, slug: string) {
  const { data, error } = await ownerClient
    .from("invites")
    .insert({
      slug,
      category: "wedding-other",
      tier: "gold",
      answers: { eventDate: "2027-06-01T18:00:00Z", song: "Test Song" },
      content: { headline: "Test Headline" },
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createOwnedInvite(${slug}) failed: ${error?.message ?? "no row returned"}`);
  }
  return data as { id: string; slug: string; owner_id: string; [key: string]: unknown };
}

export async function createGuestFixture(inviteId: string, slug: string, name = "Test Guest") {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("invite_guests")
    .insert({ invite_id: inviteId, name, slug, click_teaser: "Click me." })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createGuestFixture(${slug}) failed: ${error?.message ?? "no row returned"}`);
  }
  return data as { id: string; slug: string; invite_id: string };
}

export async function createPaymentFixture(params: {
  invitationId: string;
  ownerId: string;
  providerOrderId: string;
}) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("payments")
    .insert({
      invitation_id: params.invitationId,
      owner_id: params.ownerId,
      provider: "paypal",
      provider_order_id: params.providerOrderId,
      tier: "gold",
      expected_amount: "79.00",
      currency: "USD",
      status: "created",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createPaymentFixture(${params.providerOrderId}) failed: ${error?.message ?? "no row returned"}`);
  }
  return data as { id: string; [key: string]: unknown };
}

/** Grants admin membership the ONLY way it can be granted — a direct
 *  service-role insert into app_admins, mirroring the documented manual
 *  bootstrap procedure (PROJECT_STATUS.md's Stage 2 section). Never do
 *  this through an ordinary authenticated client; there is no policy
 *  that would allow it (see 20260909120000_admin_identity.sql). */
export async function grantAdmin(userId: string, note = "test fixture"): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("app_admins").insert({ user_id: userId, note });
  if (error) {
    throw new Error(`grantAdmin(${userId}) failed: ${error.message}`);
  }
}

/** Deletes every row whose slug/reference_code/provider_order_id starts
 *  with the given run prefix, across every table a test file might have
 *  written to. Service-role only (RLS would otherwise block most of
 *  this). Safe to call even if some tables have nothing matching. This
 *  is best-effort, single-run tidiness — the actual cross-run guarantee
 *  is `supabase db reset` running before the whole suite, not this
 *  function; see tests/integration/README.md. */
export async function cleanupRunFixtures(runId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const prefix = `stage1-${runId}`;

  // invite_guests/invite_rsvps/payments cascade-delete when their parent
  // invite is deleted (all three FKs are ON DELETE CASCADE — see
  // supabase/schema.sql) — deleting matching invites is enough for them.
  await admin.from("invites").delete().like("slug", `${prefix}%`);
  await admin.from("requests").delete().like("reference_code", `${prefix}%`);
  await admin.from("invite_payment_records").delete().like("reference_note", `${prefix}%`);

  // auth.users rows created by createTestUser() — and any app_admins row
  // granted via grantAdmin() against one of them — aren't cleaned up
  // here either, same reasoning: both are wiped along with everything
  // else by the next `db:reset` (app_admins.user_id cascades ON DELETE
  // when its auth.users row goes), and there's no per-row identifier to
  // match on cheaply the way slug/reference_code prefixes work for the
  // tables above.
}
