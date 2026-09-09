import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnonClient, createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { grantAdmin, cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 2's admin identity and
 * authorization boundary (see PROJECT_STATUS.md's Stage 2 section and
 * supabase/migrations/20260909120000_admin_identity.sql). Every client
 * here is a genuine @supabase/supabase-js instance against the local
 * stack — anon, an ordinary signed-in user, and an admin are three
 * distinct, real PostgREST callers, not mocked roles.
 */

const runId = makeRunId();
let ordinaryUser: TestUser;
let admin: TestUser;

beforeAll(async () => {
  ordinaryUser = await createTestUser(runId, "ordinary");
  admin = await createTestUser(runId, "admin");
  await grantAdmin(admin.userId, `stage1-${runId}-admin-fixture`);
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
}, 30_000);

describe("is_admin() — who is and isn't an administrator", () => {
  it("1. an anonymous caller is not an administrator", async () => {
    const { data, error } = await createAnonClient().rpc("is_admin");
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("2. an ordinary authenticated user (no app_admins row) is not an administrator", async () => {
    const { data, error } = await ordinaryUser.client.rpc("is_admin");
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("3. a trusted service-role operation can assign an administrator — the user is then reported as one by is_admin()", async () => {
    const freshUser = await createTestUser(runId, "newly-granted");

    const before = await freshUser.client.rpc("is_admin");
    expect(before.data).toBe(false);

    await grantAdmin(freshUser.userId, `stage1-${runId}-fresh-grant`);

    const after = await freshUser.client.rpc("is_admin");
    expect(after.error).toBeNull();
    expect(after.data).toBe(true);
  });

  it("the fixture admin set up in beforeAll is correctly reported as an administrator", async () => {
    const { data } = await admin.client.rpc("is_admin");
    expect(data).toBe(true);
  });
});

describe("4/5/6. access to the three protected concierge tables", () => {
  const tables = ["requests", "templates", "invite_payment_records"] as const;

  it.each(tables)("4. an administrator CAN select from %s", async (table) => {
    const { data, error } = await admin.client.from(table).select("*").limit(5);
    expect(error).toBeNull();
    expect(data).not.toBeNull(); // empty is fine (nothing seeded yet in this table); an error is not
  });

  it.each(tables)("5. an ordinary authenticated user CANNOT select from %s", async (table) => {
    const { data, error } = await ordinaryUser.client.from(table).select("*").limit(5);
    expect(error).toBeNull(); // RLS silently filters to zero rows, not an error
    expect(data).toEqual([]);
  });

  it.each(tables)("6. an anonymous user CANNOT select from %s", async (table) => {
    const { data, error } = await createAnonClient().from(table).select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("7. an administrator can perform the intended insert/update/delete actions", () => {
  it("requests: admin can insert, update, and delete", async () => {
    const referenceCode = `stage1-${runId}-admin-req`;
    const { data: inserted, error: insertErr } = await admin.client
      .from("requests")
      .insert({ reference_code: referenceCode, name: "Admin-created request", category: "wedding-other" })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted?.reference_code).toBe(referenceCode);

    const { data: updated, error: updateErr } = await admin.client
      .from("requests")
      .update({ status: "contacted" })
      .eq("reference_code", referenceCode)
      .select()
      .single();
    expect(updateErr).toBeNull();
    expect(updated?.status).toBe("contacted");

    const { error: deleteErr } = await admin.client.from("requests").delete().eq("reference_code", referenceCode);
    expect(deleteErr).toBeNull();

    const { data: goneNow } = await createServiceRoleClient().from("requests").select("id").eq("reference_code", referenceCode);
    expect(goneNow).toEqual([]);
  });

  it("templates: admin can insert, update, and delete", async () => {
    const { data: inserted, error: insertErr } = await admin.client
      .from("templates")
      .insert({
        name: `stage1-${runId}-admin-template`,
        category: "wedding-other",
        layout_component: "TestLayout",
      })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).not.toBeNull();
    const id = inserted!.id as string;

    const { data: updated, error: updateErr } = await admin.client
      .from("templates")
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();
    expect(updateErr).toBeNull();
    expect(updated?.status).toBe("active");

    const { error: deleteErr } = await admin.client.from("templates").delete().eq("id", id);
    expect(deleteErr).toBeNull();
  });

  it("invite_payment_records: admin can insert, update, and delete (against a service-role-created invite)", async () => {
    const svc = createServiceRoleClient();
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-admin-payment-record`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    const { data: inserted, error: insertErr } = await admin.client
      .from("invite_payment_records")
      .insert({
        invite_id: invite!.id,
        method: "cash",
        reference_note: `stage1-${runId}-cash-record`,
        recorded_by: admin.userId,
      })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).not.toBeNull();
    const id = inserted!.id as string;

    const { data: updated, error: updateErr } = await admin.client
      .from("invite_payment_records")
      .update({ reference_note: `stage1-${runId}-cash-record-updated` })
      .eq("id", id)
      .select()
      .single();
    expect(updateErr).toBeNull();
    expect(updated?.reference_note).toBe(`stage1-${runId}-cash-record-updated`);

    const { error: deleteErr } = await admin.client.from("invite_payment_records").delete().eq("id", id);
    expect(deleteErr).toBeNull();
  });
});

describe("8/9. admin membership itself cannot be created, changed, or granted by any client — including an admin's own", () => {
  it("8a. an ordinary authenticated user cannot insert into app_admins (cannot make themselves an administrator)", async () => {
    const { error } = await ordinaryUser.client.from("app_admins").insert({ user_id: ordinaryUser.userId });
    expect(error).not.toBeNull();

    const { data: stillNotAdmin } = await ordinaryUser.client.rpc("is_admin");
    expect(stillNotAdmin).toBe(false);
  });

  it("8b. anon cannot insert into app_admins either", async () => {
    const { error } = await createAnonClient().from("app_admins").insert({ user_id: ordinaryUser.userId });
    expect(error).not.toBeNull();
  });

  it("8c. an ordinary authenticated user cannot update or delete an existing app_admins row (can't even see it to target it)", async () => {
    const { data: updated } = await ordinaryUser.client
      .from("app_admins")
      .update({ note: "hijacked" })
      .eq("user_id", admin.userId)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await ordinaryUser.client.from("app_admins").delete().eq("user_id", admin.userId).select();
    expect(deleted).toEqual([]);

    // Confirm the real admin's row is genuinely untouched.
    const { data: stillAdmin } = await admin.client.rpc("is_admin");
    expect(stillAdmin).toBe(true);
  });

  it("9. an administrator's OWN client cannot grant admin rights to anyone, including themselves again — no insert policy exists for any role, admin or not", async () => {
    const target = await createTestUser(runId, "would-be-second-admin");

    const { error } = await admin.client.from("app_admins").insert({ user_id: target.userId, note: "self-granted" });
    expect(error).not.toBeNull();

    const { data: targetIsAdmin } = await target.client.rpc("is_admin");
    expect(targetIsAdmin).toBe(false);

    // Also can't re-insert/duplicate their own row through the client
    // (irrelevant to privilege since they're already admin, but proves
    // the block is unconditional, not merely "can't grant to others").
    const { error: selfError } = await admin.client.from("app_admins").insert({ user_id: admin.userId, note: "re-grant self" });
    expect(selfError).not.toBeNull();
  });
});

describe("app_admins is never exposed through the public/guest-facing RPCs", () => {
  it("get_published_invite()'s response never contains an app_admins-shaped field, regardless of who is admin", async () => {
    const svc = createServiceRoleClient();
    const slug = `stage1-${runId}-admin-not-leaked`;
    await svc.from("invites").insert({
      slug,
      category: "wedding-other",
      tier: "gold",
      answers: {},
      content: { headline: "No admin leakage here" },
      paid: true,
    });

    const { data } = await createAnonClient().rpc("get_published_invite", { p_slug: slug }).maybeSingle();
    const keys = Object.keys((data as Record<string, unknown>) ?? {});
    for (const forbidden of ["is_admin", "admin", "app_admins", "user_id", "created_by"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
