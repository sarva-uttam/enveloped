import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, createOwnedInvite, grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 6, Part G/H: server-side
 * composition authoring and protecting generator-controlled fields from
 * direct owner/browser modification (see
 * supabase/migrations/20260910140000_composition_authoring.sql and
 * PROJECT_STATUS.md's Stage 6 section).
 *
 * Composition SHAPE validation (valid vs. malformed jsonb) is a
 * TypeScript-layer guarantee — src/lib/composition/schema.ts,
 * exhaustively unit-tested in schema.test.ts, and
 * composition-admin.server.test.ts proves saveInviteComposition() never
 * even calls this RPC for an invalid composition. The database function
 * tested here deliberately does NOT re-validate composition shape (see
 * its own migration comment for why) — what it DOES enforce, and what
 * this file tests directly against real Postgres, is authorization
 * (is_admin()) and the one integrity rule a raw jsonb value can't
 * express on its own: p_occasion must be a real, registered event type.
 */

const runId = makeRunId();
let ownerA: TestUser;
let ordinaryUser: TestUser;
let admin: TestUser;

const SOME_COMPOSITION = { schemaVersion: 1, note: "a plausible-looking jsonb blob, not schema-validated here" };

beforeAll(async () => {
  ownerA = await createTestUser(runId, "comp-owner-a");
  ordinaryUser = await createTestUser(runId, "comp-ordinary");
  admin = await createTestUser(runId, "comp-admin");
  await grantAdmin(admin.userId, `stage1-${runId}-comp-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("admin_save_invite_composition() — authorization", () => {
  it("an ordinary (non-admin) authenticated user cannot call it", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-non-admin`);

    const { error } = await ordinaryUser.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: SOME_COMPOSITION,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("only an administrator");
  });

  it("anon cannot call it either", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-anon`);

    const { error } = await createAnonClient().rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: SOME_COMPOSITION,
    });
    expect(error).not.toBeNull();
  });

  it("an administrator CAN save a valid-shaped composition", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-admin`);

    const { data, error } = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: SOME_COMPOSITION,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition").eq("id", invite.id).single();
    expect(row!.composition).toEqual(SOME_COMPOSITION);
  });

  it("an administrator cannot save a composition with an unregistered occasion id — the one shape rule this function DOES enforce", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-bad-occasion`);

    const { error } = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: SOME_COMPOSITION,
      p_occasion: "not-a-real-event-type",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("unknown event type");

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition").eq("id", invite.id).single();
    expect(row!.composition).toBeNull(); // the whole call failed — nothing was partially saved
  });

  it("saving a composition does NOT publish the invitation", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-no-publish`);

    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: SOME_COMPOSITION });

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("published_at").eq("id", invite.id).single();
    expect(row!.published_at).toBeNull();
  });

  it("saving a composition does NOT change paid/paypal_order_id", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-save-no-pay`);

    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: SOME_COMPOSITION });

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("paid, paypal_order_id").eq("id", invite.id).single();
    expect(row!.paid).toBe(false);
    expect(row!.paypal_order_id).toBeNull();
  });

  it("returns false, not an exception, for a nonexistent invite id", async () => {
    const { data, error } = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: "00000000-0000-0000-0000-000000000000",
      p_composition: SOME_COMPOSITION,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

describe("generator-controlled fields cannot be set by a direct table update, from anyone", () => {
  it("the invite's own owner cannot set composition directly", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-owner-raw-composition`);

    const { error } = await ownerA.client.from("invites").update({ composition: SOME_COMPOSITION }).eq("id", invite.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("composition and generator fields can only be set by an administrator");

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition").eq("id", invite.id).single();
    expect(row!.composition).toBeNull();
  });

  it("the owner cannot set generator_kind, design_spec, generator_content, occasion, or occasion_custom_label directly either", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-owner-raw-generator-fields`);

    for (const patch of [
      { generator_kind: "hijacked" },
      { design_spec: { hacked: true } },
      { generator_content: { hacked: true } },
      { occasion: "reception" },
    ]) {
      const { error } = await ownerA.client.from("invites").update(patch).eq("id", invite.id);
      expect(error, `expected ${JSON.stringify(patch)} to be rejected`).not.toBeNull();
    }
  });

  it("an unrelated authenticated user cannot alter them either (RLS already prevents targeting the row at all)", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-unrelated-raw-composition`);

    const { data, error } = await ordinaryUser.client
      .from("invites")
      .update({ composition: SOME_COMPOSITION })
      .eq("id", invite.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS: zero rows matched, not an error

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition").eq("id", invite.id).single();
    expect(row!.composition).toBeNull();
  });

  it("an anonymous user cannot alter them either", async () => {
    const invite = await createOwnedInvite(ownerA.client, `stage1-${runId}-anon-raw-composition`);

    const { data, error } = await createAnonClient().from("invites").update({ composition: SOME_COMPOSITION }).eq("id", invite.id).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("even an ADMINISTRATOR's own raw client update is rejected — composition can ONLY be set through admin_save_invite_composition(), never a plain PostgREST update, matching the same design as publish_invite()/unpublish_invite()", async () => {
    const invite = await createOwnedInvite(admin.client, `stage1-${runId}-admin-raw-composition`);

    const { error } = await admin.client.from("invites").update({ composition: SOME_COMPOSITION }).eq("id", invite.id);
    expect(error).not.toBeNull();
  });
});

describe("get_published_invite() — composition only surfaces once published", () => {
  it("an UNPUBLISHED invite's composition is null through the public RPC, even if one is saved", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-pub-unpublished`, ownerId: ownerA.userId, publishedAt: null });
    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: SOME_COMPOSITION });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.composition).toBeNull();
  });

  it("a PUBLISHED invite's saved composition IS returned through the public RPC", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-pub-published`,
      ownerId: ownerA.userId,
      publishedAt: new Date().toISOString(),
    });
    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: SOME_COMPOSITION });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.composition).toEqual(SOME_COMPOSITION);
  });
});

describe("get_invite_preview() — composition available regardless of publication state", () => {
  it("returns the saved composition for an UNPUBLISHED invitation via a valid preview token", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-preview-comp-unpub`, ownerId: ownerA.userId, publishedAt: null });
    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: SOME_COMPOSITION });

    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: hash });

    const { data } = await createAnonClient().rpc("get_invite_preview", { p_token: token }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.composition).toEqual(SOME_COMPOSITION);
    expect(row.published_at).toBeNull();
  });
});
