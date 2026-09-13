import { randomBytes, createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TESTS — Stage 9's client review workflow
 * (see PROJECT_STATUS.md's Stage 9 section and
 * supabase/migrations/20260913120000_client_review_workflow.sql). Every
 * client here is a genuine @supabase/supabase-js instance against the
 * local stack — anon, an ordinary signed-in user, and an administrator
 * are three distinct, real PostgREST/RPC callers, not mocked roles.
 */

const runId = makeRunId();
const prefix = `stage1-${runId}`;
let ordinaryUser: TestUser;
let admin: TestUser;

beforeAll(async () => {
  ordinaryUser = await createTestUser(runId, "review-ordinary");
  admin = await createTestUser(runId, "review-admin");
  await grantAdmin(admin.userId, `${prefix}-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

function rawToken(): string {
  return randomBytes(32).toString("base64url");
}
function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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

/** Full setup: a concierge invite with a saved composition, a preview
 *  link, and a review round already sent (awaiting_client) — the
 *  starting state most decision-path tests need. Returns the invite id,
 *  the raw preview token, and the review round id. */
async function setUpAwaitingClientInvite(slugSuffix: string) {
  const invite = await createInviteFixture({ slug: `${prefix}-${slugSuffix}`, generatorKind: "concierge" });
  await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: validComposition(), p_expected_revision: 0 });
  const { data: roundId } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
  await admin.client.rpc("admin_mark_review_round_ready", { p_review_round_id: roundId });
  await admin.client.rpc("admin_send_review_round", { p_review_round_id: roundId });
  const token = rawToken();
  await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(token) });
  return { inviteId: invite.id as string, token, roundId: roundId as string };
}

describe("table access — no client role can read review tables directly", () => {
  it("anonymous cannot read review_rounds through the ordinary table endpoint", async () => {
    const { data, error } = await createAnonClient().from("review_rounds").select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an ordinary authenticated user cannot read review_rounds", async () => {
    const { data, error } = await ordinaryUser.client.from("review_rounds").select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anonymous cannot read review_feedback_items", async () => {
    const { data, error } = await createAnonClient().from("review_feedback_items").select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an administrator CAN read review_rounds (read-only admin policy)", async () => {
    const { inviteId } = await setUpAwaitingClientInvite("read-admin");
    const { data, error } = await admin.client.from("review_rounds").select("*").eq("invite_id", inviteId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("an administrator's own ordinary client cannot directly INSERT/UPDATE review_rounds (no write policy exists — every write goes through a function)", async () => {
    const { data } = await admin.client.from("review_rounds").update({ status: "resolved" }).eq("id", "00000000-0000-0000-0000-000000000000").select();
    expect(data).toEqual([]); // RLS has no admin UPDATE policy — matches zero rows, not an error
  });
});

describe("admin round lifecycle — authorization and transitions", () => {
  it("only an administrator can create a review round", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-create-nonadmin`, generatorKind: "concierge" });
    const { error } = await ordinaryUser.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
  });

  it("a new round binds to the invitation's CURRENT composition revision", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-bind-rev`, generatorKind: "concierge" });
    await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: validComposition(), p_expected_revision: 0 });
    const { data: roundId } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    const { data: row } = await admin.client.from("review_rounds").select("composition_revision, round_number, status").eq("id", roundId).single();
    expect(row!.composition_revision).toBe(1);
    expect(row!.round_number).toBe(1);
    expect(row!.status).toBe("draft");
  });

  it("only one active round exists per invitation — a second create attempt is rejected", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-one-active`, generatorKind: "concierge" });
    await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    const { error } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("active review round already exists");
  });

  it("the full ready -> send -> (client decides) lifecycle updates status and timestamps correctly", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-lifecycle`, generatorKind: "concierge" });
    const { data: roundId } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });

    const { data: readyOk } = await admin.client.rpc("admin_mark_review_round_ready", { p_review_round_id: roundId });
    expect(readyOk).toBe(true);

    const { data: sentOk } = await admin.client.rpc("admin_send_review_round", { p_review_round_id: roundId });
    expect(sentOk).toBe(true);

    const { data: row } = await admin.client.from("review_rounds").select("status, sent_at").eq("id", roundId).single();
    expect(row!.status).toBe("awaiting_client");
    expect(row!.sent_at).not.toBeNull();
  });

  it("a round can be cancelled from any non-terminal status, freeing the invitation for a new round", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-cancel`, generatorKind: "concierge" });
    const { data: roundId } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    const { data: cancelOk } = await admin.client.rpc("admin_cancel_review_round", { p_review_round_id: roundId });
    expect(cancelOk).toBe(true);

    const { data: newRoundId, error } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(typeof newRoundId).toBe("string");
  });

  it("every admin round action records an admin_audit_log entry", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-audit-lifecycle`, generatorKind: "concierge" });
    const { data: roundId } = await admin.client.rpc("admin_create_review_round", { p_invite_id: invite.id });
    await admin.client.rpc("admin_mark_review_round_ready", { p_review_round_id: roundId });
    await admin.client.rpc("admin_send_review_round", { p_review_round_id: roundId });

    const { data: events } = await admin.client.from("admin_audit_log").select("action").eq("target_table", "review_rounds").eq("target_id", roundId);
    const actions = (events ?? []).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["review_round_created", "review_round_ready", "review_round_sent"]));
  });
});

describe("token-based review context — get_invite_review_context()", () => {
  it("a valid token loads sanitized review context", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("ctx-valid");
    const { data } = await createAnonClient().rpc("get_invite_review_context", { p_token: token }).maybeSingle();
    expect(data).toMatchObject({ invite_id: inviteId, status: "awaiting_client", is_current: true });
  });

  it("an invalid (well-formed but wrong) token returns no row", async () => {
    const { data } = await createAnonClient().rpc("get_invite_review_context", { p_token: rawToken() }).maybeSingle();
    expect(data).toBeNull();
  });

  it("a malformed token returns no row, not an error", async () => {
    const { data, error } = await createAnonClient().rpc("get_invite_review_context", { p_token: "not-a-real-token!!" }).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("a rotated token can no longer load review context", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("ctx-rotated");
    const newToken = rawToken();
    await admin.client.rpc("admin_rotate_invite_preview", { p_invite_id: inviteId, p_token_hash: sha256hex(newToken) });

    const { data: oldResult } = await createAnonClient().rpc("get_invite_review_context", { p_token: token }).maybeSingle();
    expect(oldResult).toBeNull();

    const { data: newResult } = await createAnonClient().rpc("get_invite_review_context", { p_token: newToken }).maybeSingle();
    expect(newResult).toMatchObject({ invite_id: inviteId });
  });

  it("a revoked token can no longer load review context", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("ctx-revoked");
    await admin.client.rpc("admin_revoke_invite_preview", { p_invite_id: inviteId });
    const { data } = await createAnonClient().rpc("get_invite_review_context", { p_token: token }).maybeSingle();
    expect(data).toBeNull();
  });

  it("one invitation's token cannot see or decide another invitation's review", async () => {
    const a = await setUpAwaitingClientInvite("cross-a");
    const b = await setUpAwaitingClientInvite("cross-b");
    const { data } = await createAnonClient().rpc("get_invite_review_context", { p_token: a.token }).maybeSingle();
    const row = data as { invite_id: string };
    expect(row.invite_id).toBe(a.inviteId);
    expect(row.invite_id).not.toBe(b.inviteId);
  });

  it("mark_review_round_opened records opened_at exactly once", async () => {
    const { roundId, token } = await setUpAwaitingClientInvite("opened-once");
    const first = await createAnonClient().rpc("mark_review_round_opened", { p_token: token });
    expect(first.data).toBe(true);
    const { data: row } = await admin.client.from("review_rounds").select("opened_at").eq("id", roundId).single();
    const firstOpenedAt = row!.opened_at;
    expect(firstOpenedAt).not.toBeNull();

    const second = await createAnonClient().rpc("mark_review_round_opened", { p_token: token });
    expect(second.data).toBe(false);
    const { data: row2 } = await admin.client.from("review_rounds").select("opened_at").eq("id", roundId).single();
    expect(row2!.opened_at).toBe(firstOpenedAt);
  });
});

describe("client approval — submit_review_approval()", () => {
  it("approval succeeds once for the active, current round", async () => {
    const { roundId, token } = await setUpAwaitingClientInvite("approve-once");
    const { data } = await createAnonClient().rpc("submit_review_approval", { p_token: token, p_display_name: "Priya" });
    expect(data).toBe("ok");

    const { data: row } = await admin.client.from("review_rounds").select("status, decision_display_name, decided_at").eq("id", roundId).single();
    expect(row!.status).toBe("client_approved");
    expect(row!.decision_display_name).toBe("Priya");
    expect(row!.decided_at).not.toBeNull();
  });

  it("a duplicate/conflicting approval attempt fails safely with a generic result", async () => {
    const { token } = await setUpAwaitingClientInvite("approve-dup");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });
    const { data } = await createAnonClient().rpc("submit_review_approval", { p_token: token });
    expect(data).toBe("unavailable");
  });

  it("an invalid token returns the same generic 'unavailable' result, never an error revealing existence", async () => {
    const { data, error } = await createAnonClient().rpc("submit_review_approval", { p_token: rawToken() });
    expect(error).toBeNull();
    expect(data).toBe("unavailable");
  });

  it("approval of an invitation with no active round fails generically", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-no-round`, generatorKind: "concierge" });
    const token = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(token) });
    const { data } = await createAnonClient().rpc("submit_review_approval", { p_token: token });
    expect(data).toBe("unavailable");
  });

  it("a successful approval records an admin_audit_log entry with no raw token or hash", async () => {
    const { roundId, token } = await setUpAwaitingClientInvite("approve-audit");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });

    const { data } = await admin.client.from("admin_audit_log").select("*").eq("target_table", "review_rounds").eq("target_id", roundId).eq("action", "review_decision_received");
    expect(data!.length).toBeGreaterThan(0);
    const detail = JSON.stringify(data![0].detail);
    expect(detail).not.toContain(token);
    expect(detail).not.toContain(sha256hex(token));
    expect(data![0].detail).toMatchObject({ decision: "approved", source: "preview_link" });
  });
});

describe("client change requests — submit_review_changes()", () => {
  it("a valid change request is stored as plain text and moves the round to changes_requested", async () => {
    const { roundId, token } = await setUpAwaitingClientInvite("changes-valid");
    const { data } = await createAnonClient().rpc("submit_review_changes", {
      p_token: token,
      p_items: [{ category: "wording", sectionId: "opening", message: "Please change the headline to something warmer." }],
      p_display_name: "Arjun",
    });
    expect(data).toBe("ok");

    const { data: round } = await admin.client.from("review_rounds").select("status").eq("id", roundId).single();
    expect(round!.status).toBe("changes_requested");

    const { data: items } = await admin.client.from("review_feedback_items").select("*").eq("review_round_id", roundId);
    expect(items!.length).toBe(1);
    expect(items![0].message).toBe("Please change the headline to something warmer.");
    expect(items![0].category).toBe("wording");
    expect(typeof items![0].message).toBe("string");
  });

  it("multiple structured items in one submission are all stored, sharing the same round", async () => {
    const { roundId, token } = await setUpAwaitingClientInvite("changes-multi");
    const { data } = await createAnonClient().rpc("submit_review_changes", {
      p_token: token,
      p_items: [
        { category: "wording", sectionId: null, message: "Change the headline." },
        { category: "venue", sectionId: null, message: "The venue name is misspelled." },
      ],
    });
    expect(data).toBe("ok");
    const { data: items } = await admin.client.from("review_feedback_items").select("*").eq("review_round_id", roundId);
    expect(items!.length).toBe(2);
  });

  it("an empty items array is rejected", async () => {
    const { token } = await setUpAwaitingClientInvite("changes-empty");
    const { data } = await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: [] });
    expect(data).toBe("unavailable");
  });

  it("more than 10 items is rejected", async () => {
    const { token } = await setUpAwaitingClientInvite("changes-toomany");
    const items = Array.from({ length: 11 }, (_, i) => ({ message: `item ${i}` }));
    const { data } = await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: items });
    expect(data).toBe("unavailable");
  });

  it("an empty message is rejected by the database CHECK constraint (backstop behind app-layer Zod validation)", async () => {
    const { roundId } = await setUpAwaitingClientInvite("changes-empty-msg");
    const { error } = await admin.client.from("review_feedback_items").insert({ review_round_id: roundId, invite_id: (await admin.client.from("review_rounds").select("invite_id").eq("id", roundId).single()).data!.invite_id, message: "" });
    expect(error).not.toBeNull();
  });

  it("feedback never alters the invitation's composition", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("changes-no-mutate");
    const { data: before } = await admin.client.from("invites").select("composition, composition_revision").eq("id", inviteId).single();

    await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: [{ message: "Please change everything." }] });

    const { data: after } = await admin.client.from("invites").select("composition, composition_revision").eq("id", inviteId).single();
    expect(after!.composition_revision).toBe(before!.composition_revision);
    expect(after!.composition).toEqual(before!.composition);
  });

  it("duplicate/conflicting change-request submissions on an already-decided round fail generically", async () => {
    const { token } = await setUpAwaitingClientInvite("changes-dup");
    await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: [{ message: "First." }] });
    const { data } = await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: [{ message: "Second." }] });
    expect(data).toBe("unavailable");
  });
});

describe("meaningful composition edits invalidate/supersede review state", () => {
  it("saving identical normalized composition content does not create a false revision", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-noop-save`, generatorKind: "concierge" });
    const first = await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: validComposition(), p_expected_revision: 0 });
    expect(first.data).toEqual({ result: "ok", revision: 1 });
    const second = await admin.client.rpc("admin_save_invite_composition", { p_invite_id: invite.id, p_composition: validComposition(), p_expected_revision: 1 });
    expect(second.data).toEqual({ result: "ok", revision: 1 });
  });

  it("a meaningful save supersedes an active (awaiting_client) round", async () => {
    const { inviteId, roundId } = await setUpAwaitingClientInvite("supersede-awaiting");
    await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: inviteId,
      p_composition: validComposition({ sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Changed" } }] }),
      p_expected_revision: 1,
    });
    const { data: round } = await admin.client.from("review_rounds").select("status, superseded_at").eq("id", roundId).single();
    expect(round!.status).toBe("superseded");
    expect(round!.superseded_at).not.toBeNull();
  });

  it("a meaningful save invalidates a client_approved round for the current revision, and this is auditable", async () => {
    const { inviteId, roundId, token } = await setUpAwaitingClientInvite("supersede-approved");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });

    await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: inviteId,
      p_composition: validComposition({ sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Changed after approval" } }] }),
      p_expected_revision: 1,
    });

    const { data: round } = await admin.client.from("review_rounds").select("status").eq("id", roundId).single();
    expect(round!.status).toBe("superseded");

    const { data: auditEvents } = await admin.client.from("admin_audit_log").select("action").eq("target_table", "review_rounds").eq("target_id", roundId);
    const actions = (auditEvents ?? []).map((e) => e.action);
    expect(actions).toContain("review_approval_invalidated");
  });

  it("a stale (invalidated) approval cannot authorize publication", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("stale-blocks-publish");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });
    await admin.client.rpc("admin_save_invite_composition", {
      p_invite_id: inviteId,
      p_composition: validComposition({ sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Edited" } }] }),
      p_expected_revision: 1,
    });

    const { error } = await admin.client.rpc("publish_invite", { p_invite_id: inviteId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("no client approval");
  });
});

describe("publication guard — concierge vs self-service", () => {
  it("an unresolved change request blocks publication", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("publish-blocked-changes");
    await createAnonClient().rpc("submit_review_changes", { p_token: token, p_items: [{ message: "Please fix this." }] });

    const { error } = await admin.client.rpc("publish_invite", { p_invite_id: inviteId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("unresolved change request");
  });

  it("current-revision approval permits deliberate admin publication", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("publish-allowed");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });

    const { data, error } = await admin.client.rpc("publish_invite", { p_invite_id: inviteId });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: row } = await admin.client.from("invites").select("published_at, paid").eq("id", inviteId).single();
    expect(row!.published_at).not.toBeNull();
    expect(row!.paid).toBe(false); // approval/publication never changes payment state
  });

  it("approval alone does not publish — published_at stays null until the separate publish action", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("approve-no-autopublish");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });
    const { data: row } = await admin.client.from("invites").select("published_at").eq("id", inviteId).single();
    expect(row!.published_at).toBeNull();
  });

  it("self-service publication (generator_kind null) is completely unaffected by review state", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-selfservice-publish`, paid: true });
    const { data, error } = await admin.client.rpc("publish_invite", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("unpublishing preserves historical review records", async () => {
    const { inviteId, roundId, token } = await setUpAwaitingClientInvite("unpublish-preserves");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });
    await admin.client.rpc("publish_invite", { p_invite_id: inviteId });
    await admin.client.rpc("unpublish_invite", { p_invite_id: inviteId });

    const { data: round } = await admin.client.from("review_rounds").select("status").eq("id", roundId).single();
    expect(round!.status).toBe("client_approved");
  });
});

describe("admin_invite_has_preview_link() — existence without the hash (Stage 9 correction to a Stage 8 gap)", () => {
  it("returns true once a preview link exists, without ever exposing token_hash", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-haslink-true`, generatorKind: "concierge" });
    const token = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(token) });
    const { data } = await admin.client.rpc("admin_invite_has_preview_link", { p_invite_id: invite.id });
    expect(data).toBe(true);
  });

  it("returns false when no link has ever been created", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-haslink-false`, generatorKind: "concierge" });
    const { data } = await admin.client.rpc("admin_invite_has_preview_link", { p_invite_id: invite.id });
    expect(data).toBe(false);
  });

  it("returns false once the link is revoked", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-haslink-revoked`, generatorKind: "concierge" });
    const token = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(token) });
    await admin.client.rpc("admin_revoke_invite_preview", { p_invite_id: invite.id });
    const { data } = await admin.client.rpc("admin_invite_has_preview_link", { p_invite_id: invite.id });
    expect(data).toBe(false);
  });

  it("an ordinary (non-admin) authenticated user gets false, never an error revealing the true state", async () => {
    const invite = await createInviteFixture({ slug: `${prefix}-haslink-nonadmin`, generatorKind: "concierge" });
    const token = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(token) });
    const { data, error } = await ordinaryUser.client.rpc("admin_invite_has_preview_link", { p_invite_id: invite.id });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

describe("privacy — no raw tokens or hashes anywhere review-related", () => {
  it("review_rounds and review_feedback_items have no token or token_hash column at all", async () => {
    const { roundId } = await setUpAwaitingClientInvite("no-token-column");
    const { data: round } = await admin.client.from("review_rounds").select("*").eq("id", roundId).single();
    expect(Object.keys(round!)).not.toContain("token");
    expect(Object.keys(round!)).not.toContain("token_hash");
  });

  it("get_invite_review_context() never returns a token or hash field", async () => {
    const { token } = await setUpAwaitingClientInvite("no-token-in-context");
    const { data } = await createAnonClient().rpc("get_invite_review_context", { p_token: token }).maybeSingle();
    expect(Object.keys(data as object)).not.toContain("token_hash");
    expect(Object.keys(data as object)).not.toContain("token");
  });

  it("public get_published_invite() output contains no review-round data at all", async () => {
    const { inviteId, token } = await setUpAwaitingClientInvite("public-no-review-leak");
    await createAnonClient().rpc("submit_review_approval", { p_token: token });
    const service = createServiceRoleClient();
    const { data: invite } = await service.from("invites").select("slug").eq("id", inviteId).single();
    await admin.client.rpc("publish_invite", { p_invite_id: inviteId });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite!.slug }).maybeSingle();
    const keys = Object.keys(data as object);
    expect(keys).not.toContain("review_round_id");
    expect(keys).not.toContain("status");
    expect(keys).not.toContain("composition_revision");
  });
});
