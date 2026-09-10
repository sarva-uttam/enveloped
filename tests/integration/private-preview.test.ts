import { randomBytes, createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 5's private preview links (see
 * supabase/migrations/20260910120000_private_preview_links.sql and
 * PROJECT_STATUS.md's Stage 5 section). Every client here is a genuine
 * @supabase/supabase-js instance against the local stack — anon, an
 * ordinary signed-in user, and an administrator are three distinct, real
 * PostgREST/RPC callers, not mocked roles. See tests/integration/README.md.
 */

const runId = makeRunId();
let ordinaryUser: TestUser;
let admin: TestUser;

beforeAll(async () => {
  ordinaryUser = await createTestUser(runId, "preview-ordinary");
  admin = await createTestUser(runId, "preview-admin");
  await grantAdmin(admin.userId, `stage1-${runId}-preview-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

/** A real, 256-bit, base64url-encoded raw token — exactly the shape
 *  src/lib/preview-tokens.server.ts's generatePreviewToken() produces
 *  (not imported directly: that module is "server-only" and this suite
 *  runs as plain Node against a real Postgres, not inside Next.js — so
 *  the same primitive is reproduced inline here instead). */
function rawToken(): string {
  return randomBytes(32).toString("base64url");
}

function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Creates a preview link for `inviteId` via the intended trusted
 *  operation (the admin's own authenticated client calling
 *  admin_create_invite_preview directly — the real app's server-side
 *  equivalent is src/lib/preview-admin.server.ts, exercised separately
 *  by its own mocked unit tests) and returns the raw token. */
async function createPreviewViaAdmin(inviteId: string): Promise<string> {
  const token = rawToken();
  const { error } = await admin.client.rpc("admin_create_invite_preview", {
    p_invite_id: inviteId,
    p_token_hash: sha256hex(token),
  });
  if (error) throw new Error(`createPreviewViaAdmin failed: ${error.message}`);
  return token;
}

describe("token entropy, format, and one-way storage", () => {
  it("a real generated token has 256 bits of entropy and a base64url shape — and only its SHA-256 hex hash, never the raw token, is stored", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-entropy`, ownerId: ordinaryUser.userId });
    const token = rawToken();
    expect(token).toHaveLength(43); // base64url(32 bytes), no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const hash = sha256hex(token);
    const { error } = await admin.client.rpc("admin_create_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: hash,
    });
    expect(error).toBeNull();

    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invite_previews").select("*").eq("invite_id", invite.id).single();

    expect(row!.token_hash).toBe(hash);
    expect(row!.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("invite_previews — RLS denies everything except the trusted functions", () => {
  it("anonymous direct table reads are denied", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rls-anon-select`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { data, error } = await createAnonClient().from("invite_previews").select("*").eq("invite_id", invite.id);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS silently filters to zero rows
  });

  it("an ordinary authenticated user's direct table reads are also denied", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rls-user-select`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { data, error } = await ordinaryUser.client.from("invite_previews").select("*").eq("invite_id", invite.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an ordinary authenticated user cannot directly INSERT a row", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rls-user-insert`, ownerId: ordinaryUser.userId });

    const { error } = await ordinaryUser.client
      .from("invite_previews")
      .insert({ invite_id: invite.id, token_hash: sha256hex(rawToken()) });
    expect(error).not.toBeNull();
  });

  it("an ordinary authenticated user cannot directly UPDATE (e.g. self-revoke or rotate) a row", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rls-user-update`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { data: updated, error } = await ordinaryUser.client
      .from("invite_previews")
      .update({ revoked_at: new Date().toISOString() })
      .eq("invite_id", invite.id)
      .select();
    // RLS with no policy means the UPDATE matches (and changes) zero
    // rows rather than erroring — the same "zero rows affected, not an
    // error" shape already documented for app_admins' own update-block
    // test (tests/integration/admin.test.ts, "8c"). Confirmed via a
    // service-role read too, that nothing actually changed.
    expect(error).toBeNull();
    expect(updated).toEqual([]);
    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invite_previews").select("revoked_at").eq("invite_id", invite.id).single();
    expect(row!.revoked_at).toBeNull();
  });

  it("even an ADMINISTRATOR's own ordinary client cannot bypass RLS with a raw insert — every write must go through the SECURITY DEFINER functions", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rls-admin-raw-insert`, ownerId: ordinaryUser.userId });

    const { error } = await admin.client
      .from("invite_previews")
      .insert({ invite_id: invite.id, token_hash: sha256hex(rawToken()) });
    expect(error).not.toBeNull();
  });
});

describe("admin_create/rotate/revoke_invite_preview() — the trusted operations", () => {
  it("an ordinary (non-admin) authenticated user cannot create a preview link", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-create-non-admin`, ownerId: ordinaryUser.userId });

    const { error } = await ordinaryUser.client.rpc("admin_create_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: sha256hex(rawToken()),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("only an administrator");
  });

  it("an administrator CAN create a preview link", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-create-admin`, ownerId: ordinaryUser.userId });
    const token = await createPreviewViaAdmin(invite.id);
    expect(token).toHaveLength(43);
  });

  it("creating a SECOND link for the same invitation fails — rotate instead (one active preview link per invitation)", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-create-twice`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { error } = await admin.client.rpc("admin_create_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: sha256hex(rawToken()),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("already exists");
  });

  it("an ordinary user cannot rotate", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rotate-non-admin`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { error } = await ordinaryUser.client.rpc("admin_rotate_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: sha256hex(rawToken()),
    });
    expect(error).not.toBeNull();
  });

  it("an administrator CAN rotate — the OLD token stops working, the NEW one works", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rotate-admin`, ownerId: ordinaryUser.userId });
    const oldToken = await createPreviewViaAdmin(invite.id);

    const newToken = rawToken();
    const { data, error } = await admin.client.rpc("admin_rotate_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: sha256hex(newToken),
    });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const oldResult = await createAnonClient().rpc("get_invite_preview", { p_token: oldToken }).maybeSingle();
    expect(oldResult.data).toBeNull();

    const newResult = await createAnonClient().rpc("get_invite_preview", { p_token: newToken }).maybeSingle();
    expect(newResult.data).not.toBeNull();
  });

  it("rotating a non-existent link returns false, not an error, for an administrator", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rotate-nonexistent`, ownerId: ordinaryUser.userId });

    const { data, error } = await admin.client.rpc("admin_rotate_invite_preview", {
      p_invite_id: invite.id,
      p_token_hash: sha256hex(rawToken()),
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("an ordinary user cannot revoke", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-revoke-non-admin`, ownerId: ordinaryUser.userId });
    await createPreviewViaAdmin(invite.id);

    const { error } = await ordinaryUser.client.rpc("admin_revoke_invite_preview", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
  });

  it("an administrator CAN revoke — the token immediately stops working", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-revoke-admin`, ownerId: ordinaryUser.userId });
    const token = await createPreviewViaAdmin(invite.id);

    const { data: workedBefore } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    expect(workedBefore).not.toBeNull();

    const { data: revoked, error } = await admin.client.rpc("admin_revoke_invite_preview", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(revoked).toBe(true);

    const { data: afterRevoke } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    expect(afterRevoke).toBeNull();
  });

  it("revoking an already-revoked (or never-created) link returns false, not an error", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-revoke-twice`, ownerId: ordinaryUser.userId });

    const { data, error } = await admin.client.rpc("admin_revoke_invite_preview", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

describe("get_invite_preview() — the sanitized, anonymous-reachable access function", () => {
  it("an UNPUBLISHED invitation is accessible through a valid preview token", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-preview-unpublished`,
      ownerId: ordinaryUser.userId,
      publishedAt: null,
      content: { headline: "Private Preview Headline" },
    });
    const token = await createPreviewViaAdmin(invite.id);

    const { data, error } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row.published_at).toBeNull();
    expect((row.content as { headline: string }).headline).toBe("Private Preview Headline");
  });

  it("a PUBLISHED invitation is also previewable with a valid token", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-preview-published`,
      ownerId: ordinaryUser.userId,
      publishedAt: new Date().toISOString(),
      content: { headline: "Published Preview Headline" },
    });
    const token = await createPreviewViaAdmin(invite.id);

    const { data } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.published_at).not.toBeNull();
    expect((row.content as { headline: string }).headline).toBe("Published Preview Headline");
  });

  it("an invalid (well-formed but non-matching) token returns nothing", async () => {
    const { data, error } = await createAnonClient().rpc("get_invite_preview", { p_token: rawToken() }).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("a malformed token (wrong shape entirely) returns nothing, without erroring", async () => {
    const { data, error } = await createAnonClient().rpc("get_invite_preview", { p_token: "not-a-real-token" }).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("an empty-string token returns nothing, without erroring (the coalesce(..., '') guard)", async () => {
    const { data, error } = await createAnonClient().rpc("get_invite_preview", { p_token: "" }).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("one invitation's token cannot preview another invitation", async () => {
    const inviteA = await createInviteFixture({
      slug: `stage1-${runId}-cross-a`,
      ownerId: ordinaryUser.userId,
      content: { headline: "Invite A" },
    });
    const inviteB = await createInviteFixture({
      slug: `stage1-${runId}-cross-b`,
      ownerId: ordinaryUser.userId,
      content: { headline: "Invite B" },
    });
    const tokenA = await createPreviewViaAdmin(inviteA.id);

    const { data } = await createAnonClient().rpc("get_invite_preview", { p_token: tokenA }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.slug).toBe(inviteA.slug);
    expect((row.content as { headline: string }).headline).toBe("Invite A");
    expect(row.slug).not.toBe(inviteB.slug);
  });

  it("preview access does not change paid or published_at on the underlying invitation", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-no-side-effects`,
      ownerId: ordinaryUser.userId,
      paid: false,
      publishedAt: null,
    });
    const token = await createPreviewViaAdmin(invite.id);

    await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    // Redeem it more than once too — still purely a read.
    await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();

    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invites").select("paid, published_at").eq("id", invite.id).single();
    expect(row!.paid).toBe(false);
    expect(row!.published_at).toBeNull();
  });

  it("the returned row structurally excludes every private field — only id/slug/paid/published_at/tier/content/event_date/song", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-no-leak`,
      ownerId: ordinaryUser.userId,
      answers: { eventDate: "2027-06-01T18:00:00Z", song: "Our Song", guestNames: "Should Never Appear" },
    });
    const token = await createPreviewViaAdmin(invite.id);

    const { data } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    const row = data as Record<string, unknown>;

    expect(Object.keys(row).sort()).toEqual(
      ["id", "slug", "paid", "published_at", "tier", "content", "event_date", "song"].sort()
    );
    expect(JSON.stringify(row)).not.toContain("Should Never Appear");
    expect(row).not.toHaveProperty("answers");
    expect(row).not.toHaveProperty("owner_id");
    expect(row).not.toHaveProperty("token_hash");
  });

  it("public invitation access remains controlled ONLY by published_at — a preview token's existence has no effect on get_published_invite()", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-no-cross-contamination`,
      ownerId: ordinaryUser.userId,
      publishedAt: null,
    });
    await createPreviewViaAdmin(invite.id); // a valid preview token now exists

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.published_at).toBeNull();
    expect(row.tier).toBeNull();
    expect(row.content).toBeNull();
  });

  it("preview access cannot be used for RSVP — can_insert_rsvp() still gates on published_at alone, unaffected by a preview token existing", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-preview-no-rsvp`,
      ownerId: ordinaryUser.userId,
      publishedAt: null,
    });
    await createPreviewViaAdmin(invite.id);

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Should Fail", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("preview access cannot resolve a guest — resolve_invite_guest() still gates on published_at alone, unaffected by a preview token existing", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-preview-no-guest`,
      ownerId: ordinaryUser.userId,
      publishedAt: null,
    });
    await createPreviewViaAdmin(invite.id);

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: "anything" })
      .maybeSingle();
    expect(data).toBeNull();
  });
});
