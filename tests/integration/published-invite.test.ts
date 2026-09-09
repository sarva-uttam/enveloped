import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, createGuestFixture, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — the guest-facing read/write surface:
 * get_published_invite(), resolve_invite_guest(), and RSVP insertion via
 * can_insert_rsvp(). All three are SECURITY DEFINER functions called
 * exactly as the real anon client calls them (src/lib/storage-queries.ts).
 * See tests/integration/README.md.
 *
 * Stage 3 (2026-09-09) rewrote every test in this file: `published_at`,
 * not `paid`, is now the sole public-access gate — see
 * supabase/migrations/20260909150000_publication_payment_split.sql and
 * PROJECT_STATUS.md's Stage 3 section. This file previously contained
 * three tests that intentionally asserted the Stage-0-documented
 * payment/publication coupling DEFECT as current behavior; per the
 * project's own convention (rewrite, don't silently delete, when a
 * tracked defect is actually fixed), those three scenarios are replaced
 * below by "payment/publication independence — the corrected behavior",
 * covering all four paid × published combinations explicitly.
 */

const runId = makeRunId();
let owner: TestUser;

function isoNow() {
  return new Date().toISOString();
}

beforeAll(async () => {
  owner = await createTestUser(runId, "guest-owner");
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("get_published_invite() — published_at is the sole gate", () => {
  it("a PUBLISHED invite returns tier/content/event_date/song/published_at, and the row structurally cannot carry answers/owner_id/paypal_order_id", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-published`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: isoNow(),
      tier: "gold",
      content: { headline: "Real Headline" },
      answers: { eventDate: "2027-06-01T18:00:00Z", song: "Our Song", guestNames: "Should Never Appear" },
    });

    const anon = createAnonClient();
    const { data, error } = await anon.rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const row = data as Record<string, unknown>;

    expect(row.published_at).not.toBeNull();
    expect(row.tier).toBe("gold");
    expect((row.content as { headline: string }).headline).toBe("Real Headline");
    expect(row.event_date).toBe("2027-06-01T18:00:00Z");
    expect(row.song).toBe("Our Song");

    const keys = Object.keys(row);
    expect(keys).not.toContain("answers");
    expect(keys).not.toContain("owner_id");
    expect(keys).not.toContain("paypal_order_id");
    // Private payment records / preview tokens / administrator
    // information have no representation in this row at all — asserted
    // structurally (these keys can never appear, there is no code path
    // that would add them) rather than by value.
    expect(keys).not.toContain("invite_payment_records");
    expect(keys).not.toContain("preview_token");
    expect(keys).not.toContain("created_by_admin_id");
    expect(keys).not.toContain("app_admins");
    expect(JSON.stringify(row)).not.toContain("Should Never Appear");
  });

  it("an UNPUBLISHED invite returns published_at:null with tier/content/event_date/song all null — not a partial payload — regardless of paid status", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-unpublished`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: null,
    });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
    const row = data as Record<string, unknown>;

    expect(row.published_at).toBeNull();
    expect(row.tier).toBeNull();
    expect(row.content).toBeNull();
    expect(row.event_date).toBeNull();
    expect(row.song).toBeNull();
  });

  it("a slug that doesn't exist at all returns no row", async () => {
    const { data, error } = await createAnonClient()
      .rpc("get_published_invite", { p_slug: `stage1-${runId}-does-not-exist` })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  describe("payment/publication independence — the corrected behavior (all four combinations)", () => {
    it("unpaid + unpublished → inaccessible (nulled content)", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-unpaid-unpublished`,
        ownerId: owner.userId,
        paid: false,
        publishedAt: null,
        content: { headline: "Must stay hidden" },
      });
      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      expect((data as Record<string, unknown>).content).toBeNull();
    });

    it("paid + unpublished → inaccessible (nulled content) — payment alone never unlocks visibility", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-paid-unpublished`,
        ownerId: owner.userId,
        paid: true,
        publishedAt: null,
        content: { headline: "Must stay hidden despite payment" },
      });
      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect(row.paid).toBe(true);
      expect(row.content).toBeNull();
    });

    it("unpaid + published → publicly accessible — an administrator may publish an unpaid invitation", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-unpaid-published`,
        ownerId: owner.userId,
        paid: false,
        publishedAt: isoNow(),
        content: { headline: "Visible though unpaid" },
      });
      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect(row.paid).toBe(false);
      expect((row.content as { headline: string })?.headline).toBe("Visible though unpaid");
    });

    it("paid + published → publicly accessible", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-paid-published`,
        ownerId: owner.userId,
        paid: true,
        publishedAt: isoNow(),
        content: { headline: "Visible and paid" },
      });
      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect(row.paid).toBe(true);
      expect((row.content as { headline: string })?.headline).toBe("Visible and paid");
    });

    it("a generator invite behaves identically — published_at alone gates it, generator_kind no longer participates in the visibility decision at all", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-generator-unpaid-published`,
        ownerId: owner.userId,
        paid: false,
        generatorKind: "test-generator",
        publishedAt: isoNow(),
        content: { headline: "Generator invite, unpaid, published" },
      });
      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect((row.content as { headline: string })?.headline).toBe("Generator invite, unpaid, published");
      expect(row.generator_kind).toBe("test-generator");
    });
  });
});

describe("resolve_invite_guest() — gated on published_at, not paid", () => {
  it("valid guest token on an UNPAID + PUBLISHED invite resolves", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-guest-unpaid-published`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: isoNow(),
    });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-guest-slug-a`, "Priya Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: guest.slug })
      .maybeSingle();

    expect(data).not.toBeNull();
    const row = data as { id: string; name: string; click_teaser: string };
    expect(row.name).toBe("Priya Guest");
    expect(row.id).toBe(guest.id);
  });

  it("guest token on a PAID + UNPUBLISHED invite does NOT resolve, even with a real guest row present", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-guest-paid-unpublished`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: null,
    });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-guest-slug-b`, "Rohan Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: guest.slug })
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a wrong guest slug on a published invite resolves to nothing — never a fuzzy or partial match", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-guest-wrong-slug`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: isoNow(),
    });
    await createGuestFixture(invite.id, `stage1-${runId}-real-guest-slug`, "Real Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: `stage1-${runId}-wrong-slug` })
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe("RSVP insertion — can_insert_rsvp() gated on published_at, not paid", () => {
  it("RSVP on an UNPAID + PUBLISHED invite is allowed, with no guest_id (non-Platinum tiers have no named guest list)", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-unpaid-published`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: isoNow(),
    });

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Anon RSVP", status: "yes" });
    expect(error).toBeNull();
  });

  it("RSVP citing a guest_id that belongs to the SAME published invite is allowed", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-published-own-guest`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: isoNow(),
    });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-guest-own`);

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: guest.id, name: guest.slug, status: "yes" });
    expect(error).toBeNull();
  });

  it("RSVP citing a guest_id from a DIFFERENT invite is rejected, even when both invites are published", async () => {
    const inviteA = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-invite-a`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: isoNow(),
    });
    const inviteB = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-invite-b`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: isoNow(),
    });
    const guestOfA = await createGuestFixture(inviteA.id, `stage1-${runId}-rsvp-guest-cross`);

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: inviteB.id, guest_id: guestOfA.id, name: "Mismatched", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("RSVP on a PAID + UNPUBLISHED invite is rejected — payment alone never unlocks RSVP either", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-paid-unpublished`,
      ownerId: owner.userId,
      paid: true,
      publishedAt: null,
    });

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Should Fail", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("RSVP on an unpaid + unpublished invite is rejected too", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-unpaid-unpublished`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: null,
    });

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Should Fail Too", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("RSVPs are write-only from anon's perspective — anon cannot read back the list it just wrote to", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-rsvp-write-only`,
      ownerId: owner.userId,
      paid: false,
      publishedAt: isoNow(),
    });
    const anon = createAnonClient();
    await anon.from("invite_rsvps").insert({ invite_id: invite.id, guest_id: null, name: "Write Only", status: "yes" });

    const { data } = await anon.from("invite_rsvps").select("*").eq("invite_id", invite.id);
    expect(data).toEqual([]);

    const admin = createServiceRoleClient();
    const { data: viaAdmin } = await admin.from("invite_rsvps").select("*").eq("invite_id", invite.id);
    expect(viaAdmin!.length).toBeGreaterThan(0); // confirms the row really was written, just not readable by anon
  });
});
