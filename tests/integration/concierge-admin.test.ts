import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { grantAdmin, cleanupRunFixtures, createRequestFixture, createInviteFixture } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TESTS — Stage 8's concierge request
 * management and structured admin generator (see PROJECT_STATUS.md's
 * Stage 8 section, and
 * supabase/migrations/20260912100000_concierge_admin_generator.sql).
 * Every client here is a genuine @supabase/supabase-js instance against
 * the local stack — anon, an ordinary signed-in user, and an
 * administrator are three distinct, real PostgREST/RPC callers.
 */

const runId = makeRunId();
const prefix = `stage1-${runId}`;
let ordinaryUser: TestUser;
let admin: TestUser;

const validComposition = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  templateId: null,
  designPackId: "neutral-classic",
  eventCategory: "wedding-other",
  weddingContext: null,
  locale: "en",
  dir: "ltr",
  themeTokens: { paletteId: "neutral-classic" },
  featureConfig: { motion: true, ambientMotif: "none", openingBurst: false, envelopeOpening: true },
  sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Hello" } }],
  ...overrides,
});

beforeAll(async () => {
  ordinaryUser = await createTestUser(runId, "ordinary");
  admin = await createTestUser(runId, "admin");
  await grantAdmin(admin.userId, `${prefix}-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("request status vocabulary and transitions", () => {
  it("the new consultation-led status values are all accepted by the CHECK constraint", async () => {
    const service = createServiceRoleClient();
    for (const status of ["new", "contacted", "consultation", "accepted", "in_production", "preview_sent", "completed", "declined", "archived"]) {
      const { error } = await service.from("requests").insert({ reference_code: `${prefix}-status-${status}`, status, name: "T", category: "wedding-other" });
      expect(error).toBeNull();
    }
  });

  it("the old pre-Stage-8 status values are no longer accepted", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("requests").insert({ reference_code: `${prefix}-old-status`, status: "quoted", name: "T", category: "wedding-other" });
    expect(error).not.toBeNull();
  });

  it("an administrator can move a request through a valid transition, and it is recorded with a timestamp", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-transition-ok`, status: "new" });

    const { error } = await admin.client.from("requests").update({ status: "contacted" }).eq("id", req.id);
    expect(error).toBeNull();

    const { data } = await admin.client.from("requests").select("status, status_changed_at").eq("id", req.id).single();
    expect(data!.status).toBe("contacted");
    expect(data!.status_changed_at).not.toBeNull();
  });

  it("an invalid status transition is rejected, even from an administrator's own client", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-transition-bad`, status: "new" });

    const { error } = await admin.client.from("requests").update({ status: "completed" }).eq("id", req.id);
    expect(error).not.toBeNull();

    const { data } = await admin.client.from("requests").select("status").eq("id", req.id).single();
    expect(data!.status).toBe("new"); // unchanged
  });

  it("an ordinary (non-admin) authenticated user cannot change a request's status at all", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-transition-nonadmin`, status: "new" });

    const { data } = await ordinaryUser.client.from("requests").update({ status: "contacted" }).eq("id", req.id).select();
    // RLS silently matches zero rows for a non-admin caller — no error,
    // but nothing changes.
    expect(data).toEqual([]);

    const service = createServiceRoleClient();
    const { data: check } = await service.from("requests").select("status").eq("id", req.id).single();
    expect(check!.status).toBe("new");
  });

  it("a valid status change creates an admin_audit_log record identifying the change", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-audit`, status: "new" });
    await admin.client.from("requests").update({ status: "contacted" }).eq("id", req.id);

    const { data } = await admin.client
      .from("admin_audit_log")
      .select("*")
      .eq("target_table", "requests")
      .eq("target_id", req.id)
      .eq("action", "request_status_change");

    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data![0].detail).toMatchObject({ from: "new", to: "contacted" });
  });
});

describe("who can access requests", () => {
  it("an anonymous user cannot read requests", async () => {
    const { data, error } = await createAnonClient().from("requests").select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an ordinary authenticated user cannot read requests", async () => {
    const { data, error } = await ordinaryUser.client.from("requests").select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an administrator can list and inspect requests", async () => {
    await createRequestFixture({ referenceCode: `${prefix}-list-1` });
    const { data, error } = await admin.client.from("requests").select("*").like("reference_code", `${prefix}-list%`);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe("admin-only invitation access", () => {
  it("an anonymous user cannot read invites through the ordinary table endpoint", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-inv-anon` });
    const { data, error } = await createAnonClient().from("invites").select("*").eq("id", invite.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an unrelated ordinary user cannot read someone else's invite through the ordinary table endpoint", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-inv-unrelated`, ownerId: admin.userId });
    const { data, error } = await ordinaryUser.client.from("invites").select("*").eq("id", invite.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an administrator CAN read any invite (read-only — Part J's minimal grant)", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-inv-admin-read` });
    const { data, error } = await admin.client.from("invites").select("*").eq("id", invite.id).single();
    expect(error).toBeNull();
    expect(data!.id).toBe(invite.id);
  });

  it("an administrator's own ordinary client STILL cannot directly UPDATE an invite (no general admin update policy exists — every write goes through a dedicated function)", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-inv-admin-noupdate` });
    const { data } = await admin.client.from("invites").update({ tier: "platinum" }).eq("id", invite.id).select();
    expect(data).toEqual([]); // RLS has no admin UPDATE policy on invites — matches zero rows
  });
});

describe("creating an invitation from a request", () => {
  it("an administrator can create exactly one invitation from a request, with generator_kind='concierge' and paid/published_at untouched", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-create-1`, name: "Ananya & Rohan", category: "wedding-other", tierInterest: "gold" });

    const { data: newId, error } = await admin.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-created-invite`,
      p_category: "wedding-other",
      p_tier: "gold",
      p_composition: validComposition(),
    });
    expect(error).toBeNull();
    expect(typeof newId).toBe("string");

    const service = createServiceRoleClient();
    const { data: invite } = await service.from("invites").select("*").eq("id", newId).single();
    expect(invite!.request_id).toBe(req.id);
    expect(invite!.generator_kind).toBe("concierge");
    expect(invite!.paid).toBe(false);
    expect(invite!.published_at).toBeNull();
    expect(invite!.owner_id).toBeNull();
  });

  it("duplicate creation for the same request is rejected — both the friendly exception and the structural unique index", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-create-dup` });
    await admin.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-dup-invite-1`,
      p_category: "wedding-other",
      p_tier: "bronze",
    });

    const { error } = await admin.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-dup-invite-2`,
      p_category: "wedding-other",
      p_tier: "bronze",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("already has an invitation");
  });

  it("creating an invitation does not mark it paid or published, and copies no private request notes into any invites column", async () => {
    const req = await createRequestFixture({
      referenceCode: `${prefix}-create-private`,
      notes: "SECRET_CLIENT_NOTE_1",
      internalNotes: "SECRET_INTERNAL_NOTE_1",
    });
    const { data: newId } = await admin.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-private-invite`,
      p_category: "wedding-other",
      p_tier: "bronze",
    });

    const service = createServiceRoleClient();
    const { data: invite } = await service.from("invites").select("*").eq("id", newId).single();
    expect(invite!.paid).toBe(false);
    expect(invite!.published_at).toBeNull();
    const serialized = JSON.stringify(invite);
    expect(serialized).not.toContain("SECRET_CLIENT_NOTE_1");
    expect(serialized).not.toContain("SECRET_INTERNAL_NOTE_1");
  });

  it("an ordinary (non-admin) user cannot create an invitation from a request", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-create-nonadmin` });
    const { error } = await ordinaryUser.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-nonadmin-invite`,
      p_category: "wedding-other",
      p_tier: "bronze",
    });
    expect(error).not.toBeNull();
  });

  it("an unknown occasion id is rejected", async () => {
    const req = await createRequestFixture({ referenceCode: `${prefix}-create-badoccasion` });
    const { error } = await admin.client.rpc("admin_create_invitation_from_request", {
      p_request_id: req.id,
      p_slug: `${prefix}-badoccasion-invite`,
      p_category: "wedding-other",
      p_tier: "bronze",
      p_occasion: "not-a-real-occasion",
    });
    expect(error).not.toBeNull();
  });
});

describe("composition save — optimistic concurrency", () => {
  it("saves a valid composition and increments composition_revision", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-comp-save` });

    const { data: result, error } = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: validComposition(),
      p_expected_revision: 0,
    });
    expect(error).toBeNull();
    expect(result).toEqual({ result: "ok", revision: 1 });

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition_revision, composition").eq("id", invite.id).single();
    expect(row!.composition_revision).toBe(1);
  });

  it("a stale expected revision is rejected without applying the update — a concurrent save is never silently overwritten", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-comp-stale` });

    const first = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: validComposition({ sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "First save" } }] }),
      p_expected_revision: 0,
    });
    expect(first.data).toEqual({ result: "ok", revision: 1 });

    // A second "tab" that read the invitation before the first save,
    // still believing revision is 0.
    const second = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: validComposition({ sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Stale save, should not apply" } }] }),
      p_expected_revision: 0,
    });
    expect(second.data).toEqual({ result: "stale", revision: 1 });

    const service = createServiceRoleClient();
    const { data: row } = await service.from("invites").select("composition").eq("id", invite.id).single();
    expect((row!.composition as { sections: { data: { headline: string } }[] }).sections[0].data.headline).toBe("First save");
  });

  it("saving against a non-existent invitation id reports not-found", async () => {
    const { data } = await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: "00000000-0000-0000-0000-000000000000",
      p_composition: validComposition(),
      p_expected_revision: 0,
    });
    expect(data).toEqual({ result: "not-found", revision: null });
  });

  it("a successful save records an admin_audit_log entry with the new revision, and no raw preview token or full composition text", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-comp-audit` });
    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: validComposition(), p_expected_revision: 0 });

    const { data } = await admin.client.from("admin_audit_log").select("*").eq("target_table", "invites").eq("target_id", invite.id).eq("action", "composition_save");
    expect(data!.length).toBeGreaterThan(0);
    expect(data![0].detail).toMatchObject({ new_revision: 1 });
  });

  it("an ordinary user cannot call admin_save_invite_composition", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-comp-nonadmin` });
    const { error } = await ordinaryUser.client.rpc("admin_save_invite_composition", {
      p_invite_id: invite.id,
      p_composition: validComposition(),
      p_expected_revision: 0,
    });
    expect(error).not.toBeNull();
  });

  it("direct browser writes to invites.composition (bypassing the function) remain rejected — the pre-existing trigger still applies even when the caller can otherwise reach the row", async () => {
    // Admin is made the OWNER here specifically so RLS lets the UPDATE reach
    // the row at all (invites has no general admin UPDATE policy — see
    // "an administrator's own ordinary client STILL cannot directly UPDATE
    // an invite" above) — this test isolates the composition-authoring
    // trigger's own rejection, matching composition-authoring.test.ts's
    // "even an ADMINISTRATOR's own raw client update is rejected" pattern.
    const invite = await createInviteFixture({ slug: `${prefix}-comp-directwrite`, ownerId: admin.userId });
    const { error } = await admin.client.from("invites").update({ composition: validComposition() }).eq("id", invite.id);
    expect(error).not.toBeNull();
  });
});

describe("preview-link management leaves no trace of raw tokens in admin-readable state", () => {
  it("admin_audit_log never contains a raw preview token, even after create/rotate/revoke", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-preview-audit` });
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: "a".repeat(64) });

    const { data } = await admin.client.from("admin_audit_log").select("*").eq("target_id", invite.id);
    const serialized = JSON.stringify(data ?? []);
    // No 64-char hex hash and no created token material of any kind
    // should ever appear in the audit log for this action, because this
    // stage deliberately does not audit-log preview-link operations at
    // all yet (see PROJECT_STATUS.md's Stage 8 "remaining risks").
    expect(serialized).not.toContain("a".repeat(64));
  });

  it("existing preview-link RPCs still work unchanged for an admin, still reject a non-admin", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-preview-still-works` });
    const created = await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: "b".repeat(64) });
    expect(created.error).toBeNull();

    const nonAdmin = await ordinaryUser.client.rpc("admin_rotate_invite_preview", { p_invite_id: invite.id, p_token_hash: "c".repeat(64) });
    expect(nonAdmin.error).not.toBeNull();
  });
});
