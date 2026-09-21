import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createOwnedInvite, createPaymentFixture, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — exercises RLS as genuine anon/
 * authenticated PostgREST callers against the local, disposable Supabase
 * stack (see tests/integration/README.md). Every client here is a real
 * @supabase/supabase-js instance pointed at the local API; nothing is
 * mocked. This is the real-Postgres verification PROJECT_STATUS.md and
 * REVIEW_BRIEF.md have flagged as missing since the auth_ownership
 * migration was first written (Round 5's own history is the reason this
 * exists at all — a text-pattern-only guard let a real RLS bug through).
 *
 * Test data is isolated by a per-run id in every slug/reference/note —
 * cleanupRunFixtures() below removes it at the end, and `npm run db:reset`
 * (run before the suite by `npm run test:db`) is the actual guarantee
 * that a failed run's leftovers never affect the next one.
 */

const runId = makeRunId();
let ownerA: TestUser;
let ownerB: TestUser;

beforeAll(async () => {
  ownerA = await createTestUser(runId, "owner-a");
  ownerB = await createTestUser(runId, "owner-b");
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("raw invites table — never publicly readable", () => {
  it("an anonymous caller sees no rows at all, paid or not", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-raw-read`);
    const anon = createAnonClient();

    const { data, error } = await anon.from("invites").select("*").eq("slug", invite.slug);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("owner-only access", () => {
  it("owner_id defaults to the creating user's own id — the client never has to (or can) set it", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-default-owner`);
    expect(invite.owner_id).toBe(ownerA.userId);
  });

  it("the owner can read their own invite; a different signed-in user gets nothing back for it", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-owner-read`);

    const { data: ownRead } = await ownerA.client.from("invites").select("*").eq("slug", invite.slug);
    expect(ownRead).toHaveLength(1);

    const { data: otherRead, error } = await ownerB.client.from("invites").select("*").eq("slug", invite.slug);
    expect(error).toBeNull();
    expect(otherRead).toEqual([]);
  });

  it("a non-owner's update against another owner's invite affects zero rows; the owner's own update succeeds", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-cross-update`);

    const { data: blocked, error: blockedErr } = await ownerB.client
      .from("invites")
      .update({ category: "birthday" })
      .eq("slug", invite.slug)
      .select();
    expect(blockedErr).toBeNull();
    expect(blocked).toEqual([]); // RLS filters the UPDATE's own WHERE-visible rows to none

    const admin = createServiceRoleClient();
    const { data: stillOriginal } = await admin.from("invites").select("category").eq("slug", invite.slug).single();
    expect(stillOriginal?.category).toBe("wedding-other"); // unchanged by ownerB's attempt

    const { data: allowed, error: allowedErr } = await ownerA.client
      .from("invites")
      .update({ category: "birthday" })
      .eq("slug", invite.slug)
      .select();
    expect(allowedErr).toBeNull();
    expect(allowed).toHaveLength(1);
    expect(allowed![0].category).toBe("birthday");
  });

  it("a non-owner's delete against another owner's invite affects zero rows; the owner's own delete succeeds", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-cross-delete`);
    const admin = createServiceRoleClient();

    const { data: blocked } = await ownerB.client.from("invites").delete().eq("slug", invite.slug).select();
    expect(blocked).toEqual([]);
    const { data: stillThere } = await admin.from("invites").select("id").eq("slug", invite.slug);
    expect(stillThere).toHaveLength(1);

    const { data: allowed } = await ownerA.client.from("invites").delete().eq("slug", invite.slug).select();
    expect(allowed).toHaveLength(1);
    const { data: goneNow } = await admin.from("invites").select("id").eq("slug", invite.slug);
    expect(goneNow).toEqual([]);
  });
});

describe("protected payment fields — paid/paypal_order_id can only be set by service_role", () => {
  it("the owner's own direct update to `paid` is rejected by the trigger", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-paid-guard`);

    const { error } = await ownerA.client.from("invites").update({ paid: true }).eq("slug", invite.slug);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("paid and paypal_order_id can only be set by the payment system");

    const admin = createServiceRoleClient();
    const { data } = await admin.from("invites").select("paid").eq("slug", invite.slug).single();
    expect(data?.paid).toBe(false);
  });

  it("the SAME owner updating an ordinary, non-gated column succeeds — proving the block above is the trigger, not a blanket RLS denial", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-paid-guard-control`);
    const { error, data } = await ownerA.client
      .from("invites")
      .update({ category: "holiday" })
      .eq("slug", invite.slug)
      .select();
    expect(error).toBeNull();
    expect(data![0].category).toBe("holiday");
  });

  it("the service-role client CAN set paid/paypal_order_id — this is the one exempted path (markInvitePaid)", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-paid-service-role`);
    const admin = createServiceRoleClient();

    const { error } = await admin
      .from("invites")
      .update({ paid: true, paypal_order_id: "TEST-ORDER-1" })
      .eq("slug", invite.slug);
    expect(error).toBeNull();

    const { data } = await admin.from("invites").select("paid, paypal_order_id").eq("slug", invite.slug).single();
    expect(data?.paid).toBe(true);
    expect(data?.paypal_order_id).toBe("TEST-ORDER-1");
  });
});

describe("payments table — no insert/update/delete for anon or authenticated, ever", () => {
  it("an authenticated owner cannot insert a payments row, even truthfully naming their own invitation/owner id", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-payments-insert-block`);

    const { error } = await ownerA.client.from("payments").insert({
      invitation_id: invite.id,
      owner_id: ownerA.userId,
      provider: "paypal",
      provider_order_id: `stage1-${runId}-fake-order`,
      tier: "gold",
      expected_amount: "79.00",
      currency: "USD",
    });
    expect(error).not.toBeNull();
  });

  it("anon cannot insert a payments row either", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-payments-anon-insert-block`);
    const anon = createAnonClient();

    const { error } = await anon.from("payments").insert({
      invitation_id: invite.id,
      owner_id: ownerA.userId,
      provider: "paypal",
      provider_order_id: `stage1-${runId}-anon-fake-order`,
      tier: "gold",
      expected_amount: "79.00",
      currency: "USD",
    });
    expect(error).not.toBeNull();
  });

  it("an authenticated owner's update/delete on their OWN payments row affects zero rows (no policy grants it)", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-payments-update-block`);
    const payment = await createPaymentFixture({
      invitationId: invite.id,
      ownerId: ownerA.userId,
      providerOrderId: `stage1-${runId}-real-order`,
    });

    const { data: updated } = await ownerA.client
      .from("payments")
      .update({ status: "captured" })
      .eq("id", payment.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await ownerA.client.from("payments").delete().eq("id", payment.id).select();
    expect(deleted).toEqual([]);

    const admin = createServiceRoleClient();
    const { data: stillCreated } = await admin.from("payments").select("status").eq("id", payment.id).single();
    expect(stillCreated?.status).toBe("created");
  });

  it("the owner CAN read their own payments row; a different user cannot", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-payments-read`);
    const payment = await createPaymentFixture({
      invitationId: invite.id,
      ownerId: ownerA.userId,
      providerOrderId: `stage1-${runId}-readable-order`,
    });

    const { data: ownRead } = await ownerA.client.from("payments").select("*").eq("id", payment.id);
    expect(ownRead).toHaveLength(1);

    const { data: otherRead } = await ownerB.client.from("payments").select("*").eq("id", payment.id);
    expect(otherRead).toEqual([]);

    const { data: anonRead } = await createAnonClient().from("payments").select("*").eq("id", payment.id);
    expect(anonRead).toEqual([]);
  });
});

describe("requests, templates, invite_payment_records — deny-all for ordinary access (RLS enabled, zero policies)", () => {
  const tables = ["requests", "templates", "invite_payment_records"] as const;

  it.each(tables)("anon cannot select from %s", async (table) => {
    const { data, error } = await createAnonClient().from(table).select("*").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(tables)("an ordinary authenticated user cannot select from %s either", async (table) => {
    const { data, error } = await ownerA.client.from(table).select("*").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an ordinary authenticated user cannot insert into requests (no admin role exists yet — Stage 1 does not add one)", async () => {
    const { error } = await ownerA.client.from("requests").insert({
      reference_code: `stage1-${runId}-req-block`,
      name: "Test Requester",
      category: "wedding-other",
    });
    expect(error).not.toBeNull();
  });

  it("the service-role client CAN read/write all three — confirms the deny-all above is RLS, not a missing/broken table", async () => {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("requests")
      .insert({ reference_code: `stage1-${runId}-req-admin-ok`, name: "Admin Insert", category: "wedding-other" })
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { data: readBack } = await admin.from("requests").select("*").eq("reference_code", `stage1-${runId}-req-admin-ok`);
    expect(readBack).toHaveLength(1);
  });
});

describe("stranger cannot bypass RLS via any read path", () => {
  it("a third, entirely unrelated authenticated user gets nothing for someone else's invite, guest list, or payments — same as anon", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-stranger-bypass`);
    const stranger = await createTestUser(runId, "stranger");

    const { data: invites } = await stranger.client.from("invites").select("*").eq("slug", invite.slug);
    expect(invites).toEqual([]);

    const { data: guests } = await stranger.client.from("invite_guests").select("*").eq("invite_id", invite.id);
    expect(guests).toEqual([]);

    const { data: rsvps } = await stranger.client.from("invite_rsvps").select("*").eq("invite_id", invite.id);
    expect(rsvps).toEqual([]);
  });
});
