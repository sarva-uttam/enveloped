import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPgPool, closePgPool } from "./helpers/pg-client";
import { createServiceRoleClient, createTestUser, makeRunId, type TestUser } from "./helpers/supabase-clients";
import { cleanupRunFixtures } from "./helpers/fixtures";

/**
 * REAL DATABASE INTEGRATION TEST — Stage 3's legacy-row backfill rule
 * (supabase/migrations/20260909150000_publication_payment_split.sql,
 * "BEGIN LEGACY BACKFILL" / "END LEGACY BACKFILL"). Does NOT touch — and
 * per this stage's safety restrictions, must never touch — any live row;
 * everything here is seeded fresh on the disposable local stack.
 *
 * The backfill already ran once, against an empty database, when
 * `supabase db reset` applied this migration for the current test run
 * (it has nothing to do on an empty table). To actually exercise its
 * LOGIC, this file extracts the exact SQL between the BEGIN/END markers
 * from the real migration file — not a hand-copied re-implementation
 * that could silently drift from it — seeds rows shaped like each
 * documented legacy scenario, re-runs that extracted SQL against them
 * (a disable/update/enable sequence, self-contained by design — see the
 * migration file's own comment on why), and asserts the documented
 * compatibility principle holds for each one.
 */

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260909150000_publication_payment_split.sql"
);
const migrationSql = readFileSync(migrationPath, "utf8");
const backfillMatch = migrationSql.match(/-- BEGIN LEGACY BACKFILL[\s\S]*?-- END LEGACY BACKFILL/);
if (!backfillMatch) {
  throw new Error("Could not find the BEGIN/END LEGACY BACKFILL markers in the migration file");
}
const backfillSql = backfillMatch[0];

const runId = makeRunId();
let owner: TestUser;

async function runBackfill() {
  const pool = getPgPool();
  await pool.query(backfillSql);
}

// Postgres/PostgREST returns timestamptz values with a "+00:00" offset,
// not the "Z" suffix the ISO strings below are written with — same
// instant, different (both valid) text representation. Compare by
// parsed value, not raw string equality.
function sameInstant(a: string | null | undefined, b: string): boolean {
  return a != null && new Date(a).getTime() === new Date(b).getTime();
}

beforeAll(async () => {
  owner = await createTestUser(runId, "legacy-owner");
}, 30_000);

afterAll(async () => {
  await cleanupRunFixtures(runId);
  await closePgPool();
}, 30_000);

describe("legacy backfill — exact SQL extracted from the migration, re-run against seeded legacy-shaped rows", () => {
  it("scenario A — paid, non-generator, no matching captured payment row: falls back to the invite's own updated_at (never now(), never created_at)", async () => {
    const svc = createServiceRoleClient();
    const oldUpdatedAt = "2025-03-15T10:00:00Z";
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-a`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: true,
        generator_kind: null,
        published_at: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: oldUpdatedAt,
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    await runBackfill();

    const { data: after } = await svc.from("invites").select("published_at").eq("id", invite!.id).single();
    expect(sameInstant(after?.published_at, oldUpdatedAt)).toBe(true);
  });

  it("scenario B — paid, non-generator, WITH a matching captured payment: uses the payment's updated_at, not the invite's own (the more reliable, specific signal)", async () => {
    const svc = createServiceRoleClient();
    const inviteUpdatedAt = "2025-03-15T10:00:00Z";
    const paymentUpdatedAt = "2025-03-20T14:30:00Z"; // later, more specific — must win
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-b`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: true,
        generator_kind: null,
        published_at: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: inviteUpdatedAt,
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    await svc.from("payments").insert({
      invitation_id: invite!.id,
      owner_id: owner.userId,
      provider: "paypal",
      provider_order_id: `stage1-${runId}-legacy-b-order`,
      tier: "gold",
      expected_amount: "79.00",
      captured_amount: "79.00",
      currency: "USD",
      status: "captured",
      updated_at: paymentUpdatedAt,
    });

    await runBackfill();

    const { data: after } = await svc.from("invites").select("published_at").eq("id", invite!.id).single();
    expect(sameInstant(after?.published_at, paymentUpdatedAt)).toBe(true);
    expect(sameInstant(after?.published_at, inviteUpdatedAt)).toBe(false);
  });

  it("scenario C — paid GENERATOR invite, no published_at: remains private (backfill never touches generator rows)", async () => {
    const svc = createServiceRoleClient();
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-c`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: true,
        generator_kind: "test-generator",
        published_at: null,
        updated_at: "2025-03-15T10:00:00Z",
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    await runBackfill();

    const { data: after } = await svc.from("invites").select("published_at").eq("id", invite!.id).single();
    expect(after?.published_at).toBeNull();
  });

  it("scenario D — generator invite that ALREADY has published_at: keeps it exactly as-is, untouched", async () => {
    const svc = createServiceRoleClient();
    const existingPublishedAt = "2025-02-01T09:00:00Z";
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-d`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: true,
        generator_kind: "test-generator",
        published_at: existingPublishedAt,
        updated_at: "2025-03-15T10:00:00Z",
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    await runBackfill();

    const { data: after } = await svc.from("invites").select("published_at").eq("id", invite!.id).single();
    expect(sameInstant(after?.published_at, existingPublishedAt)).toBe(true);
  });

  it("scenario E — unpaid invite: never automatically published, regardless of generator_kind or updated_at", async () => {
    const svc = createServiceRoleClient();
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-e`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: false,
        generator_kind: null,
        published_at: null,
        updated_at: "2025-03-15T10:00:00Z",
      })
      .select()
      .single();
    expect(invite).not.toBeNull();

    await runBackfill();

    const { data: after } = await svc.from("invites").select("published_at").eq("id", invite!.id).single();
    expect(after?.published_at).toBeNull();
  });

  it("the trigger protecting published_at is left ENABLED after the backfill runs — a raw client update is still rejected afterward", async () => {
    const svc = createServiceRoleClient();
    const { data: invite } = await svc
      .from("invites")
      .insert({
        slug: `stage1-${runId}-legacy-trigger-restored`,
        category: "wedding-other",
        tier: "gold",
        answers: {},
        content: {},
        owner_id: owner.userId,
        paid: false,
      })
      .select()
      .single();

    await runBackfill(); // no-op for this unpaid row, but exercises the disable/enable cycle once more

    const { error } = await owner.client
      .from("invites")
      .update({ published_at: new Date().toISOString() })
      .eq("id", invite!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("published_at can only be set by an administrator");
  });
});
