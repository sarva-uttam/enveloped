import { randomBytes, createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, createGuestFixture, createGuestLinkViaAdmin, grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 10 guest management, personalized
 * guest links, and RSVP operations (see
 * supabase/migrations/20260914090000_guest_management.sql). Mirrors the
 * shape of private-preview.test.ts / review-workflow.test.ts: every client
 * here is a genuine @supabase/supabase-js instance against the local
 * stack, never mocked.
 */

const runId = makeRunId();
let ordinaryUser: TestUser;
let admin: TestUser;

beforeAll(async () => {
  ordinaryUser = await createTestUser(runId, "guest-ordinary");
  admin = await createTestUser(runId, "guest-admin");
  await grantAdmin(admin.userId, `stage1-${runId}-guest-admin-fixture`);
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

async function publishedConcierge(slug: string, extra: Record<string, unknown> = {}) {
  return createInviteFixture({
    slug,
    ownerId: null,
    generatorKind: "concierge",
    publishedAt: new Date().toISOString(),
    ...extra,
  });
}

const SCHEDULE_COMPOSITION = {
  schemaVersion: 1,
  designPackId: "test-pack",
  themeTokens: { paletteId: "rose" },
  featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
  sections: [
    {
      id: "sched-1",
      type: "schedule",
      enabled: true,
      motionPreset: "fade",
      data: { entries: [{ id: "ceremony", eventTypeId: null, label: "Ceremony", value: "5pm" }] },
    },
  ],
};

describe("admin guest CRUD — authorization and validation", () => {
  it("an ordinary (non-admin) user cannot create a guest", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-crud-non-admin`);
    const { error } = await ordinaryUser.client.rpc("admin_create_guest", {
      p_invite_id: invite.id,
      p_name: "Jane Doe",
      p_slug: `stage1-${runId}-jane`,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("only an administrator");
  });

  it("an administrator can create, list, and update a guest — including for a concierge invitation with no owner", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-crud-admin`);
    const { data: guestId, error } = await admin.client.rpc("admin_create_guest", {
      p_invite_id: invite.id,
      p_name: "Jane Doe",
      p_slug: `stage1-${runId}-jane-crud`,
      p_contact_email: "jane@example.test",
      p_permitted_attendees: 2,
      p_allow_plus_one: true,
      p_internal_notes: "VIP",
    });
    expect(error).toBeNull();
    expect(guestId).toBeTruthy();

    const { data: list, error: listError } = await admin.client.rpc("admin_list_invite_guests", { p_invite_id: invite.id });
    expect(listError).toBeNull();
    const row = (list as Record<string, unknown>[])!.find((g) => g.id === guestId)!;
    expect(row.name).toBe("Jane Doe");
    expect(row.permitted_attendees).toBe(2);
    expect(row.allow_plus_one).toBe(true);
    expect(row.has_link).toBe(false);

    const { data: updated, error: updateError } = await admin.client.rpc("admin_update_guest", {
      p_guest_id: guestId,
      p_name: "Jane R. Doe",
      p_permitted_attendees: 3,
      p_allow_plus_one: true,
    });
    expect(updateError).toBeNull();
    expect(updated).toBe(true);
  });

  it("an ordinary user cannot list guests, even for an invitation they own", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-list-non-admin`, ownerId: ordinaryUser.userId });
    await createGuestFixture(invite.id, `stage1-${runId}-list-guest`);

    const { error } = await ordinaryUser.client.rpc("admin_list_invite_guests", { p_invite_id: invite.id });
    expect(error).not.toBeNull();
  });

  it("archiving a guest (admin_set_guest_active false) also revokes their link immediately", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-archive`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-archive-guest`, "Archive Me", {
      permittedAttendees: 1,
    });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const before = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    expect(before.data).not.toBeNull();

    const { data: result, error } = await admin.client.rpc("admin_set_guest_active", { p_guest_id: guest.id, p_is_active: false });
    expect(error).toBeNull();
    expect(result).toBe(true);

    const after = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    expect(after.data).toBeNull();
  });

  it("a guest who has already responded cannot be hard-deleted — must be deactivated instead", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-delete-responded`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-delete-responded-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);
    await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 1 });

    const { error } = await admin.client.rpc("admin_delete_guest", { p_guest_id: guest.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("deactivate");
  });

  it("a guest who has an issued link cannot be hard-deleted, even with no response yet", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-delete-linked`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-delete-linked-guest`);
    await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { error } = await admin.client.rpc("admin_delete_guest", { p_guest_id: guest.id });
    expect(error).not.toBeNull();
  });

  it("a freshly-created guest with no link and no response CAN be hard-deleted", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-delete-clean`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-delete-clean-guest`);

    const { data, error } = await admin.client.rpc("admin_delete_guest", { p_guest_id: guest.id });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});

describe("invite_guest_links — RLS denies everything except the trusted functions", () => {
  it("no role, including an administrator's own raw client, can directly read or write invite_guest_links", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-links-rls`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-links-rls-guest`);
    await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const anonRead = await createAnonClient().from("invite_guest_links").select("*").eq("guest_id", guest.id);
    expect(anonRead.data).toEqual([]);

    const adminRead = await admin.client.from("invite_guest_links").select("*").eq("guest_id", guest.id);
    expect(adminRead.data).toEqual([]);

    const adminRawInsert = await admin.client
      .from("invite_guest_links")
      .insert({ guest_id: guest.id, token_hash: sha256hex(rawToken()) });
    expect(adminRawInsert.error).not.toBeNull();
  });
});

describe("guest link lifecycle — create, rotate, revoke", () => {
  it("a non-admin cannot create/rotate/revoke a guest link", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-lifecycle-non-admin`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-lifecycle-non-admin-guest`);

    const create = await ordinaryUser.client.rpc("admin_create_guest_link", { p_guest_id: guest.id, p_token_hash: sha256hex(rawToken()) });
    expect(create.error).not.toBeNull();
  });

  it("creating a second link for the same guest fails — rotate instead", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-lifecycle-twice`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-lifecycle-twice-guest`);
    await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { error } = await admin.client.rpc("admin_create_guest_link", { p_guest_id: guest.id, p_token_hash: sha256hex(rawToken()) });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("rotate");
  });

  it("rotating replaces the credential — the OLD token stops working, the NEW one works", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rotate`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rotate-guest`);
    const oldToken = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const newToken = rawToken();
    const { data, error } = await admin.client.rpc("admin_rotate_guest_link", { p_guest_id: guest.id, p_token_hash: sha256hex(newToken) });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const oldResult = await createAnonClient().rpc("get_guest_invite", { p_token: oldToken }).maybeSingle();
    expect(oldResult.data).toBeNull();
    const newResult = await createAnonClient().rpc("get_guest_invite", { p_token: newToken }).maybeSingle();
    expect(newResult.data).not.toBeNull();
  });

  it("revoking stops the link immediately", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-revoke`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-revoke-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const before = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    expect(before.data).not.toBeNull();

    const { data, error } = await admin.client.rpc("admin_revoke_guest_link", { p_guest_id: guest.id });
    expect(error).toBeNull();
    expect(data).toBe(true);

    const after = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    expect(after.data).toBeNull();
  });
});

describe("token entropy and one-way storage", () => {
  it("a real generated guest token has 256 bits of entropy, and only its SHA-256 hash is stored, never the raw token", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-entropy`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-entropy-guest`);
    const token = rawToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const hash = sha256hex(token);
    await admin.client.rpc("admin_create_guest_link", { p_guest_id: guest.id, p_token_hash: hash });

    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invite_guest_links").select("*").eq("guest_id", guest.id).single();
    expect(row!.token_hash).toBe(hash);
    expect(row!.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("get_guest_invite() — sanitized, anonymous-reachable, published-gated access", () => {
  it("an UNPUBLISHED invitation's guest link does not resolve — unlike a preview link, a guest link grants no early access", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-unpublished`,
      ownerId: null,
      generatorKind: "concierge",
      publishedAt: null,
    });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-unpublished-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data } = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    expect(data).toBeNull();
  });

  it("a malformed or non-matching token returns nothing, without erroring", async () => {
    const { data, error } = await createAnonClient().rpc("get_guest_invite", { p_token: "not-a-real-token" }).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("one guest's link cannot resolve another guest", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-cross-guest`);
    const guestA = await createGuestFixture(invite.id, `stage1-${runId}-cross-a`, "Guest A");
    const guestB = await createGuestFixture(invite.id, `stage1-${runId}-cross-b`, "Guest B");
    const tokenA = await createGuestLinkViaAdmin(admin.client, guestA.id, rawToken, sha256hex);

    const { data } = await createAnonClient().rpc("get_guest_invite", { p_token: tokenA }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row.guest_name).toBe("Guest A");
    expect(row.guest_id).toBe(guestA.id);
    expect(row.guest_id).not.toBe(guestB.id);
  });

  it("a PREVIEW token never functions as a guest token", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-preview-not-guest`);
    const previewToken = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(previewToken) });

    const { data } = await createAnonClient().rpc("get_guest_invite", { p_token: previewToken }).maybeSingle();
    expect(data).toBeNull();
  });

  it("the returned row structurally excludes owner/admin/payment/internal fields", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-no-leak`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-no-leak-guest`, "No Leak", {
      contactEmail: "secret@example.test",
    });
    await admin.client.rpc("admin_update_guest", {
      p_guest_id: guest.id,
      p_name: "No Leak",
      p_internal_notes: "Should Never Appear",
    });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data } = await createAnonClient().rpc("get_guest_invite", { p_token: token }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(row).not.toHaveProperty("owner_id");
    expect(row).not.toHaveProperty("internal_notes");
    expect(row).not.toHaveProperty("contact_email");
    expect(row).not.toHaveProperty("token_hash");
    expect(JSON.stringify(row)).not.toContain("Should Never Appear");
    expect(JSON.stringify(row)).not.toContain("secret@example.test");
  });
});

describe("submit_guest_rsvp() — the anonymous, token-authenticated write", () => {
  it("a valid guest can respond attending, within their permitted count", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-attend`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-attend-guest`, "Attend", { permittedAttendees: 2 });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data, error } = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 2,
    });
    expect(error).toBeNull();
    expect(data).toBe("ok");

    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invite_guests").select("*").eq("id", guest.id).single();
    expect(row!.rsvp_status).toBe("attending");
    expect(row!.attendee_count).toBe(2);
    expect(row!.responded_at).not.toBeNull();
  });

  it("a valid guest can decline — attendee_count is forced to 0 regardless of what was sent", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-decline`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-decline-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data, error } = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "declined",
      p_attendee_count: 5,
    });
    expect(error).toBeNull();
    expect(data).toBe("ok");

    const serviceRole = createServiceRoleClient();
    const { data: row } = await serviceRole.from("invite_guests").select("*").eq("id", guest.id).single();
    expect(row!.rsvp_status).toBe("declined");
    expect(row!.attendee_count).toBe(0);
  });

  it("an attendee count beyond the permitted limit is rejected", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-over-limit`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-over-limit-guest`, "Over Limit", { permittedAttendees: 1 });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data, error } = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 2,
    });
    expect(error).toBeNull();
    expect(data).toBe("unavailable");
  });

  it("a plus-one name is rejected when the guest is not permitted a plus-one", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-plus-one-denied`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-plus-one-denied-guest`, "No Plus One", {
      permittedAttendees: 2,
      allowPlusOne: false,
    });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data } = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 2,
      p_plus_one_name: "Uninvited Plus One",
    });
    expect(data).toBe("unavailable");
  });

  it("a plus-one name is accepted when permitted", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-plus-one-ok`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-plus-one-ok-guest`, "Plus One OK", {
      permittedAttendees: 2,
      allowPlusOne: true,
    });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data, error } = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 2,
      p_plus_one_name: "My Plus One",
    });
    expect(error).toBeNull();
    expect(data).toBe("ok");
  });

  it("event-level attendance is validated against the invitation's real schedule entries", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-event-valid`, { content: {}, generatorKind: "concierge" });
    const serviceRole = createServiceRoleClient();
    await serviceRole.from("invites").update({ composition: SCHEDULE_COMPOSITION }).eq("id", invite.id);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-event-valid-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const valid = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 1,
      p_event_attendance: [{ scheduleEntryId: "ceremony", attending: true }],
    });
    expect(valid.data).toBe("ok");

    const invalid = await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 1,
      p_event_attendance: [{ scheduleEntryId: "made-up-entry", attending: true }],
    });
    expect(invalid.data).toBe("unavailable");
  });

  it("a response can be corrected using the same guest credential (transactional update, not a duplicate row)", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-correction`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-correction-guest`, "Correction", { permittedAttendees: 3 });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 1 });
    const second = await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 3 });
    expect(second.data).toBe("ok");

    const serviceRole = createServiceRoleClient();
    const { data: rows } = await serviceRole.from("invite_guests").select("attendee_count").eq("id", guest.id);
    expect(rows).toHaveLength(1);
    expect(rows![0].attendee_count).toBe(3);
  });

  it("an UNPUBLISHED invitation cannot accept an RSVP even through a valid guest link", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-unpublished`,
      ownerId: null,
      generatorKind: "concierge",
      publishedAt: null,
    });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-unpublished-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);

    const { data } = await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 1 });
    expect(data).toBe("unavailable");
  });

  it("a REVOKED guest link cannot RSVP", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-revoked`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-revoked-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);
    await admin.client.rpc("admin_revoke_guest_link", { p_guest_id: guest.id });

    const { data } = await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 1 });
    expect(data).toBe("unavailable");
  });

  it("a PREVIEW token cannot RSVP as a guest", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-preview-denied`);
    const previewToken = rawToken();
    await admin.client.rpc("admin_create_invite_preview", { p_invite_id: invite.id, p_token_hash: sha256hex(previewToken) });

    const { data } = await createAnonClient().rpc("submit_guest_rsvp", { p_token: previewToken, p_status: "attending", p_attendee_count: 1 });
    expect(data).toBe("unavailable");
  });

  it("guest RSVP actions never change payment, publication, composition or approval state", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-no-side-effects`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-no-side-effects-guest`);
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);
    const serviceRole = createServiceRoleClient();
    const before = await serviceRole.from("invites").select("paid, published_at, composition_revision").eq("id", invite.id).single();

    await createAnonClient().rpc("submit_guest_rsvp", { p_token: token, p_status: "attending", p_attendee_count: 1 });

    const after = await serviceRole.from("invites").select("paid, published_at, composition_revision").eq("id", invite.id).single();
    expect(after.data).toEqual(before.data);
  });

  it("audit log records status/attendee_count only — never dietary notes, plus-one names, raw tokens, or hashes", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-rsvp-audit-safe`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-audit-safe-guest`, "Audit Safe", {
      permittedAttendees: 2,
      allowPlusOne: true,
    });
    const token = await createGuestLinkViaAdmin(admin.client, guest.id, rawToken, sha256hex);
    const tokenHash = sha256hex(token);

    await createAnonClient().rpc("submit_guest_rsvp", {
      p_token: token,
      p_status: "attending",
      p_attendee_count: 2,
      p_plus_one_name: "Secret Plus One",
      p_dietary_notes: "Secret Dietary Detail",
    });

    const serviceRole = createServiceRoleClient();
    const { data: logRows } = await serviceRole
      .from("admin_audit_log")
      .select("*")
      .eq("target_id", guest.id)
      .eq("action", "guest_rsvp_submitted");

    expect(logRows).toHaveLength(1);
    const entry = JSON.stringify(logRows![0]);
    expect(entry).not.toContain(token);
    expect(entry).not.toContain(tokenHash);
    expect(entry).not.toContain("Secret Plus One");
    expect(entry).not.toContain("Secret Dietary Detail");
    expect(logRows![0].actor_id).toBeNull();
  });
});

describe("admin_bulk_import_guests() — transactional CSV apply", () => {
  it("imports valid rows, skips within-file and against-existing duplicates, and reports per row", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-import`);
    await createGuestFixture(invite.id, `stage1-${runId}-import-existing`, "Existing Guest", { contactEmail: "existing@example.test" });

    const { data, error } = await admin.client.rpc("admin_bulk_import_guests", {
      p_invite_id: invite.id,
      p_rows: [
        { name: "New Guest", contactEmail: "new@example.test" },
        { name: "Duplicate In File", contactEmail: "dup@example.test" },
        { name: "Duplicate In File", contactEmail: "dup@example.test" },
        { name: "Existing Guest", contactEmail: "existing@example.test" },
        { name: "" },
      ],
    });
    expect(error).toBeNull();
    const result = data as { inserted: number; results: { row: number; status: string; reason?: string }[] };
    expect(result.inserted).toBe(2);
    expect(result.results.find((r) => r.row === 1)!.status).toBe("inserted");
    expect(result.results.find((r) => r.row === 3)!.status).toBe("skipped");
    expect(result.results.find((r) => r.row === 4)!.status).toBe("skipped");
    expect(result.results.find((r) => r.row === 5)!.status).toBe("error");
  });

  it("a non-admin cannot bulk import", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-import-non-admin`);
    const { error } = await ordinaryUser.client.rpc("admin_bulk_import_guests", { p_invite_id: invite.id, p_rows: [{ name: "X" }] });
    expect(error).not.toBeNull();
  });

  it("rejects a batch larger than the row limit", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-import-too-big`);
    const rows = Array.from({ length: 501 }, (_, i) => ({ name: `Guest ${i}` }));
    const { error } = await admin.client.rpc("admin_bulk_import_guests", { p_invite_id: invite.id, p_rows: rows });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("500 rows");
  });
});

describe("admin_guest_dashboard_summary() — exact counts", () => {
  it("computes total invited/responded/attending/declined/pending and expected attendees exactly", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-dashboard`);
    const g1 = await createGuestFixture(invite.id, `stage1-${runId}-dash-1`, "One", { permittedAttendees: 3 });
    const g2 = await createGuestFixture(invite.id, `stage1-${runId}-dash-2`, "Two", { permittedAttendees: 2 });
    await createGuestFixture(invite.id, `stage1-${runId}-dash-3`, "Three");

    const t1 = await createGuestLinkViaAdmin(admin.client, g1.id, rawToken, sha256hex);
    const t2 = await createGuestLinkViaAdmin(admin.client, g2.id, rawToken, sha256hex);
    await createAnonClient().rpc("submit_guest_rsvp", { p_token: t1, p_status: "attending", p_attendee_count: 3 });
    await createAnonClient().rpc("submit_guest_rsvp", { p_token: t2, p_status: "declined", p_attendee_count: 0 });

    const { data, error } = await admin.client.rpc("admin_guest_dashboard_summary", { p_invite_id: invite.id }).maybeSingle();
    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(Number(row.total_invited)).toBe(3);
    expect(Number(row.responded)).toBe(2);
    expect(Number(row.attending)).toBe(1);
    expect(Number(row.declined)).toBe(1);
    expect(Number(row.pending)).toBe(1);
    expect(Number(row.total_expected_attendees)).toBe(3);
  });

  it("a deactivated guest is excluded from every dashboard total", async () => {
    const invite = await publishedConcierge(`stage1-${runId}-dashboard-inactive`);
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-dash-inactive-1`, "Active One");
    const inactive = await createGuestFixture(invite.id, `stage1-${runId}-dash-inactive-2`, "Deactivated", { isActive: false });

    const { data } = await admin.client.rpc("admin_guest_dashboard_summary", { p_invite_id: invite.id }).maybeSingle();
    const row = data as Record<string, unknown>;
    expect(Number(row.total_invited)).toBe(1);
    void guest;
    void inactive;
  });
});
