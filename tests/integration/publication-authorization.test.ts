import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createOwnedInvite, createInviteFixture, grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 3's publication authorization:
 * who can change `published_at`, and how. See
 * supabase/migrations/20260909150000_publication_payment_split.sql and
 * PROJECT_STATUS.md's Stage 3 section.
 */

const runId = makeRunId();
let ownerA: TestUser;
let ordinaryUser: TestUser;
let admin: TestUser;

beforeAll(async () => {
  ownerA = await createTestUser(runId, "pub-owner-a");
  ordinaryUser = await createTestUser(runId, "pub-ordinary");
  admin = await createTestUser(runId, "pub-admin");
  await grantAdmin(admin.userId, `stage1-${runId}-pub-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("ordinary clients cannot directly change published_at/paid/paypal_order_id", () => {
  it("the invite's own owner cannot set published_at via a raw update — the trigger rejects it", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-owner-cannot-publish`);

    const { error } = await ownerA.client
      .from("invites")
      .update({ published_at: new Date().toISOString() })
      .eq("slug", invite.slug);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("published_at can only be set by an administrator");

    const admin_ = createServiceRoleClient();
    const { data } = await admin_.from("invites").select("published_at").eq("slug", invite.slug).single();
    expect(data?.published_at).toBeNull();
  });

  it("the invite's own owner cannot unpublish (set published_at to null) an already-published invite either", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-owner-cannot-unpublish`,
      ownerId: ownerA.userId,
      publishedAt: new Date().toISOString(),
    });

    const { error } = await ownerA.client.from("invites").update({ published_at: null }).eq("id", invite.id);
    expect(error).not.toBeNull();

    const admin_ = createServiceRoleClient();
    const { data } = await admin_.from("invites").select("published_at").eq("id", invite.id).single();
    expect(data?.published_at).not.toBeNull();
  });

  it("the owner still cannot set paid/paypal_order_id directly — Stage 0's protection is unchanged, verified again here alongside the new published_at guard", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-owner-cannot-pay`);

    const { error } = await ownerA.client.from("invites").update({ paid: true }).eq("slug", invite.slug);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("paid and paypal_order_id can only be set by the payment system");
  });

  it("even an ADMINISTRATOR's own client cannot set published_at via a raw table update on someone else's invite — invites RLS still only lets the owner's own client target the row at all (zero rows affected, not an error — the same shape as any other cross-owner update; the trigger's is_admin() exception exists only for publish_invite()/unpublish_invite(), which run as the function owner, bypassing invites' owner-only RLS the same way any other SECURITY DEFINER function here does)", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-admin-raw-update-blocked`);

    const { data, error } = await admin.client
      .from("invites")
      .update({ published_at: new Date().toISOString() })
      .eq("slug", invite.slug)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const admin_ = createServiceRoleClient();
    const { data: stillUnpublished } = await admin_.from("invites").select("published_at").eq("slug", invite.slug).single();
    expect(stillUnpublished?.published_at).toBeNull();
  });
});

describe("publish_invite() / unpublish_invite() — administrator-only, via RPC", () => {
  it("an ordinary authenticated (non-admin) user cannot call publish_invite()", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-ordinary-cannot-publish`);
    const { error } = await ordinaryUser.client.rpc("publish_invite", { p_invite_id: invite.id });
    expect(error).not.toBeNull();

    const admin_ = createServiceRoleClient();
    const { data } = await admin_.from("invites").select("published_at").eq("id", invite.id).single();
    expect(data?.published_at).toBeNull();
  });

  it("an ordinary authenticated (non-admin) user cannot call unpublish_invite()", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-ordinary-cannot-unpublish`,
      ownerId: ownerA.userId,
      publishedAt: new Date().toISOString(),
    });
    const { error } = await ordinaryUser.client.rpc("unpublish_invite", { p_invite_id: invite.id });
    expect(error).not.toBeNull();

    const admin_ = createServiceRoleClient();
    const { data } = await admin_.from("invites").select("published_at").eq("id", invite.id).single();
    expect(data?.published_at).not.toBeNull();
  });

  it("an anonymous user cannot call publish_invite() at all", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-anon-cannot-publish`);
    const { error } = await createAnonClient().rpc("publish_invite", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
  });

  it("an anonymous user cannot call unpublish_invite() at all", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-anon-cannot-unpublish`,
      ownerId: ownerA.userId,
      publishedAt: new Date().toISOString(),
    });
    const { error } = await createAnonClient().rpc("unpublish_invite", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
  });

  it("an administrator CAN publish an invitation — even one they don't own, and even if it's unpaid", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-admin-publishes`);
    // Confirm it starts unpaid AND unpublished, to prove admin publish
    // doesn't depend on payment state at all.
    const admin_ = createServiceRoleClient();
    const { data: before } = await admin_.from("invites").select("paid, published_at").eq("id", invite.id).single();
    expect(before?.paid).toBe(false);
    expect(before?.published_at).toBeNull();

    const { data: result, error } = await admin.client.rpc("publish_invite", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(result).toBe(true);

    const { data: after } = await admin_.from("invites").select("paid, published_at").eq("id", invite.id).single();
    expect(after?.published_at).not.toBeNull();
    // Publishing does not change paid.
    expect(after?.paid).toBe(false);
  });

  it("an administrator CAN unpublish an invitation", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-admin-unpublishes`,
      ownerId: ownerA.userId,
      paid: true,
      publishedAt: new Date().toISOString(),
    });

    const { data: result, error } = await admin.client.rpc("unpublish_invite", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(result).toBe(true);

    const admin_ = createServiceRoleClient();
    const { data: after } = await admin_.from("invites").select("paid, published_at").eq("id", invite.id).single();
    expect(after?.published_at).toBeNull();
    // Unpublishing does not change paid.
    expect(after?.paid).toBe(true);
  });

  it("publish_invite() on a non-existent invitation id fails safely — returns false, not an error", async () => {
    const { data, error } = await admin.client.rpc("publish_invite", { p_invite_id: randomUUID() });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("unpublish_invite() on a non-existent invitation id fails safely — returns false, not an error", async () => {
    const { data, error } = await admin.client.rpc("unpublish_invite", { p_invite_id: randomUUID() });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

describe("recording payment does not change published_at", () => {
  it("a service-role payment update (the real markInvitePaid() path) leaves published_at exactly as it was", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-payment-preserves-publish-state`);
    const admin_ = createServiceRoleClient();

    // Starts unpublished — confirm a payment update doesn't publish it.
    await admin_.from("invites").update({ paid: true, paypal_order_id: `stage1-${runId}-order` }).eq("id", invite.id);
    const { data: stillUnpublished } = await admin_.from("invites").select("published_at").eq("id", invite.id).single();
    expect(stillUnpublished?.published_at).toBeNull();

    // Now published by an admin — confirm a SECOND payment update
    // doesn't touch published_at either way.
    await admin.client.rpc("publish_invite", { p_invite_id: invite.id });
    await admin_.from("invites").update({ paid: false }).eq("id", invite.id); // e.g. a refund
    const { data: stillPublished } = await admin_.from("invites").select("published_at, paid").eq("id", invite.id).single();
    expect(stillPublished?.published_at).not.toBeNull();
    expect(stillPublished?.paid).toBe(false);
  });
});
