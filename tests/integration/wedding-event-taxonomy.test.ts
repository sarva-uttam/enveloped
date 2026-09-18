import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { createInviteFixture, cleanupRunFixtures } from "./helpers/fixtures";
import { EVENT_TYPES } from "../../src/lib/composition/event-types";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 6, Part C: the culturally
 * extensible event/wedding model (see
 * supabase/migrations/20260910130000_wedding_event_taxonomy.sql and
 * PROJECT_STATUS.md's Stage 6 section). Every client here is a genuine
 * @supabase/supabase-js instance against the local stack.
 */

const runId = makeRunId();
let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser(runId, "taxonomy-owner");
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("event_types — the lookup table this project's own TS source of truth must match", () => {
  it("has a live row for every id in src/lib/composition/event-types.ts, with a matching label and is_legacy flag", async () => {
    const service = createServiceRoleClient();
    const { data: rows, error } = await service.from("event_types").select("id, label, is_legacy");
    expect(error).toBeNull();

    const byId = Object.fromEntries((rows ?? []).map((r: { id: string; label: string; is_legacy: boolean }) => [r.id, r]));
    for (const expected of EVENT_TYPES) {
      const row = byId[expected.id];
      expect(row, `missing live event_types row for "${expected.id}"`).toBeDefined();
      expect(row.label).toBe(expected.label);
      expect(row.is_legacy).toBe(expected.isLegacy);
    }
  });

  it("has no EXTRA rows beyond what event-types.ts declares — the two stay in lockstep in both directions", async () => {
    const service = createServiceRoleClient();
    const { data: rows } = await service.from("event_types").select("id");
    const liveIds = new Set((rows ?? []).map((r: { id: string }) => r.id));
    const expectedIds = new Set(EVENT_TYPES.map((e) => e.id));
    expect(liveIds).toEqual(expectedIds);
  });

  it("is publicly readable — anon can select from it (it's vocabulary, not sensitive data)", async () => {
    const { data, error } = await createAnonClient().from("event_types").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("anon cannot write to it — no insert/update/delete policy exists", async () => {
    const { error } = await createAnonClient().from("event_types").insert({ id: "hacked", label: "Hacked" });
    expect(error).not.toBeNull();
  });
});

describe("invites.occasion — legacy values preserved, new vocabulary supported", () => {
  it.each(["haldi", "sangeet_mehendi", "wedding_day", "reception"])(
    "the original legacy value %s is still a valid occasion — preserved verbatim, not reinterpreted",
    async (legacyOccasion) => {
      const invite = await createInviteFixture({ slug: `stage1-${runId}-legacy-${legacyOccasion}`, ownerId: owner.userId });
      const service = createServiceRoleClient();
      const { error } = await service.from("invites").update({ occasion: legacyOccasion }).eq("id", invite.id);
      expect(error).toBeNull();
    }
  );

  it.each(["engagement", "mehendi", "sangeet", "civil_ceremony", "religious_ceremony", "nikah", "wedding_ceremony", "dinner", "custom"])(
    "the new vocabulary entry %s is a valid occasion",
    async (newOccasion) => {
      const invite = await createInviteFixture({ slug: `stage1-${runId}-new-${newOccasion}`, ownerId: owner.userId });
      const service = createServiceRoleClient();
      const { error } = await service.from("invites").update({ occasion: newOccasion }).eq("id", invite.id);
      expect(error).toBeNull();
    }
  );

  it("rejects an occasion value that isn't a registered event type — the FK constraint is real, not decorative", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-invalid-occasion`, ownerId: owner.userId });
    const service = createServiceRoleClient();
    const { error } = await service.from("invites").update({ occasion: "not-a-real-event-type" }).eq("id", invite.id);
    expect(error).not.toBeNull();
  });

  it("occasion_custom_label is only allowed when occasion = 'custom'", async () => {
    const invite = await createInviteFixture({ slug: `stage1-${runId}-custom-label`, ownerId: owner.userId });
    const service = createServiceRoleClient();

    const badAttempt = await service
      .from("invites")
      .update({ occasion: "reception", occasion_custom_label: "Should not be allowed" })
      .eq("id", invite.id);
    expect(badAttempt.error).not.toBeNull();

    const goodAttempt = await service
      .from("invites")
      .update({ occasion: "custom", occasion_custom_label: "Ganesh Puja" })
      .eq("id", invite.id);
    expect(goodAttempt.error).toBeNull();
  });
});

describe("a wedding may contain multiple events — the new model supports it without a schema redesign", () => {
  it("different invites for the SAME conceptual wedding can each carry a different occasion, all simultaneously valid", async () => {
    const service = createServiceRoleClient();
    const occasions = ["mehendi", "sangeet", "wedding_ceremony", "reception"];
    const invites = await Promise.all(
      occasions.map((occasion, i) => createInviteFixture({ slug: `stage1-${runId}-multi-event-${i}`, ownerId: owner.userId }))
    );

    for (let i = 0; i < invites.length; i++) {
      const { error } = await service.from("invites").update({ occasion: occasions[i] }).eq("id", invites[i].id);
      expect(error).toBeNull();
    }

    const { data: rows } = await service
      .from("invites")
      .select("occasion")
      .in(
        "id",
        invites.map((inv) => inv.id)
      );
    expect((rows ?? []).map((r: { occasion: string }) => r.occasion).sort()).toEqual([...occasions].sort());
  });
});

describe("templates.occasion — same extensible vocabulary", () => {
  it("accepts a new-vocabulary occasion value", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("templates").insert({
      name: `stage1-${runId}-template`,
      category: "wedding-muslim",
      occasion: "nikah",
      layout_component: "classic",
    });
    expect(error).toBeNull();
    await service.from("templates").delete().eq("name", `stage1-${runId}-template`);
  });

  it("rejects an unregistered occasion value", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("templates").insert({
      name: `stage1-${runId}-template-bad`,
      category: "wedding-other",
      occasion: "not-a-real-event-type",
      layout_component: "classic",
    });
    expect(error).not.toBeNull();
  });
});

describe("requests.requested_occasions — array validated against the same vocabulary", () => {
  it("accepts an array of valid, mixed legacy and new occasion ids", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("requests").insert({
      reference_code: `stage1-${runId}-req-valid`,
      name: "Test Client",
      category: "wedding-hindu",
      requested_occasions: ["haldi", "mehendi", "wedding_ceremony"],
    });
    expect(error).toBeNull();
  });

  it("rejects an array containing even one unregistered occasion id", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("requests").insert({
      reference_code: `stage1-${runId}-req-invalid`,
      name: "Test Client",
      category: "wedding-hindu",
      requested_occasions: ["haldi", "not-a-real-event-type"],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("unknown event type");
  });

  it("accepts an empty array (no occasions requested yet)", async () => {
    const service = createServiceRoleClient();
    const { error } = await service.from("requests").insert({
      reference_code: `stage1-${runId}-req-empty`,
      name: "Test Client",
      category: "wedding-other",
      requested_occasions: [],
    });
    expect(error).toBeNull();
  });
});
