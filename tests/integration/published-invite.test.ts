import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, createGuestFixture, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — the guest-facing read/write surface:
 * get_published_invite(), resolve_invite_guest(), and RSVP insertion via
 * can_insert_rsvp(). All three are SECURITY DEFINER functions called
 * exactly as the real anon client calls them (src/lib/storage-queries.ts).
 * See tests/integration/README.md.
 */

const runId = makeRunId();
let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser(runId, "guest-owner");
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("get_published_invite() — the sanitized public payload", () => {
  it("a PAID invite returns tier/content/event_date/song, and the row structurally cannot carry answers/owner_id/paypal_order_id", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-published`,
      ownerId: owner.userId,
      paid: true,
      tier: "gold",
      content: { headline: "Real Headline" },
      answers: { eventDate: "2027-06-01T18:00:00Z", song: "Our Song", guestNames: "Should Never Appear" },
    });

    const anon = createAnonClient();
    const { data, error } = await anon.rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const row = data as Record<string, unknown>;

    expect(row.paid).toBe(true);
    expect(row.tier).toBe("gold");
    expect((row.content as { headline: string }).headline).toBe("Real Headline");
    expect(row.event_date).toBe("2027-06-01T18:00:00Z");
    expect(row.song).toBe("Our Song");

    const keys = Object.keys(row);
    expect(keys).not.toContain("answers");
    expect(keys).not.toContain("owner_id");
    expect(keys).not.toContain("paypal_order_id");
    expect(JSON.stringify(row)).not.toContain("Should Never Appear");
  });

  it("an UNPAID invite returns paid:false with tier/content/event_date/song all null — not a partial payload", async () => {
    const invite = await createInviteFixture({
      slug: `stage1-${runId}-unpaid`,
      ownerId: owner.userId,
      paid: false,
    });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
    const row = data as Record<string, unknown>;

    expect(row.paid).toBe(false);
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

  /**
   * KNOWN, TRACKED DEFECT — these three tests intentionally assert
   * CURRENT (defective) database behavior, not desired behavior. See
   * PROJECT_STATUS.md's Stage 0 section and
   * supabase/migrations/20260905091530_generator_payment_publish_split.sql's
   * header for the full account: despite that migration's name, `paid`
   * remains a hard, unconditional AND — `published_at` only ever narrows
   * visibility further for a generator invite, it never substitutes for
   * `paid`. When this is eventually fixed (a real, explicitly-scoped
   * migration — NOT part of Stage 1), update these three assertions to
   * match the corrected behavior; do not delete them silently, since
   * they are the regression guard for whichever fix lands.
   */
  describe("payment/publication coupling — captured as existing behavior, not desired behavior", () => {
    it("published (published_at set) but UNPAID: still returns nulled content — publication alone does not unlock visibility", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-published-not-paid`,
        ownerId: owner.userId,
        paid: false,
        generatorKind: "test-generator",
        publishedAt: new Date().toISOString(),
        content: { headline: "Should stay hidden" },
      });

      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect(row.paid).toBe(false);
      expect(row.content).toBeNull(); // the defect: published_at is ignored when paid is false
    });

    it("paid but a generator invite NOT YET published (published_at null): still returns nulled content", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-paid-not-published`,
        ownerId: owner.userId,
        paid: true,
        generatorKind: "test-generator",
        publishedAt: null,
        content: { headline: "Should also stay hidden" },
      });

      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect(row.paid).toBe(true);
      expect(row.content).toBeNull(); // paid alone isn't enough for a generator invite either
    });

    it("paid AND published (both set) on a generator invite: content finally visible — the only combination that works today", async () => {
      const invite = await createInviteFixture({
        slug: `stage1-${runId}-paid-and-published`,
        ownerId: owner.userId,
        paid: true,
        generatorKind: "test-generator",
        publishedAt: new Date().toISOString(),
        content: { headline: "Finally visible" },
      });

      const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: invite.slug }).maybeSingle();
      const row = data as Record<string, unknown>;
      expect((row.content as { headline: string })?.headline).toBe("Finally visible");
    });
  });
});

describe("resolve_invite_guest() — guest resolution follows the live rules", () => {
  it("resolves a guest's name/teaser on a PAID invite by exact (invite slug, guest slug) match", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-guest-paid`, ownerId: owner.userId, paid: true });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-guest-slug-a`, "Priya Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: guest.slug })
      .maybeSingle();

    expect(data).not.toBeNull();
    const row = data as { id: string; name: string; click_teaser: string };
    expect(row.name).toBe("Priya Guest");
    expect(row.id).toBe(guest.id);
  });

  it("a guest link on an UNPAID invite resolves to nothing, even with a real guest row present", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-guest-unpaid`, ownerId: owner.userId, paid: false });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-guest-slug-b`, "Rohan Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: guest.slug })
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a wrong guest slug on a paid invite resolves to nothing — never a fuzzy or partial match", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-guest-wrong-slug`, ownerId: owner.userId, paid: true });
    await createGuestFixture(invite.id, `stage1-${runId}-real-guest-slug`, "Real Guest");

    const { data } = await createAnonClient()
      .rpc("resolve_invite_guest", { p_invite_slug: invite.slug, p_guest_slug: `stage1-${runId}-wrong-slug` })
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe("RSVP insertion — can_insert_rsvp() follows the live rules", () => {
  it("anon can RSVP on a paid invite with no guest_id (non-Platinum tiers have no named guest list)", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rsvp-paid-no-guest`, ownerId: owner.userId, paid: true });

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Anon RSVP", status: "yes" });
    expect(error).toBeNull();
  });

  it("anon can RSVP on a paid invite citing a guest_id that belongs to that SAME invite", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rsvp-paid-own-guest`, ownerId: owner.userId, paid: true });
    const guest = await createGuestFixture(invite.id, `stage1-${runId}-rsvp-guest-own`);

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: guest.id, name: guest.slug, status: "yes" });
    expect(error).toBeNull();
  });

  it("anon RSVP citing a guest_id from a DIFFERENT invite is rejected", async () => {
    const inviteA = await createInviteFixture({ slug: `stage1-${runId}-rsvp-invite-a`, ownerId: owner.userId, paid: true });
    const inviteB = await createInviteFixture({ slug: `stage1-${runId}-rsvp-invite-b`, ownerId: owner.userId, paid: true });
    const guestOfA = await createGuestFixture(inviteA.id, `stage1-${runId}-rsvp-guest-cross`);

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: inviteB.id, guest_id: guestOfA.id, name: "Mismatched", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("anon RSVP against an UNPAID invite is rejected outright", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rsvp-unpaid`, ownerId: owner.userId, paid: false });

    const { error } = await createAnonClient()
      .from("invite_rsvps")
      .insert({ invite_id: invite.id, guest_id: null, name: "Should Fail", status: "yes" });
    expect(error).not.toBeNull();
  });

  it("RSVPs are write-only from anon's perspective — anon cannot read back the list it just wrote to", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-rsvp-write-only`, ownerId: owner.userId, paid: true });
    const anon = createAnonClient();
    await anon.from("invite_rsvps").insert({ invite_id: invite.id, guest_id: null, name: "Write Only", status: "yes" });

    const { data } = await anon.from("invite_rsvps").select("*").eq("invite_id", invite.id);
    expect(data).toEqual([]);

    const admin = createServiceRoleClient();
    const { data: viaAdmin } = await admin.from("invite_rsvps").select("*").eq("invite_id", invite.id);
    expect(viaAdmin!.length).toBeGreaterThan(0); // confirms the row really was written, just not readable by anon
  });
});
