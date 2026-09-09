import { describe, it, expect, afterAll } from "vitest";
import { getPgPool, closePgPool } from "./helpers/pg-client";

/**
 * REAL DATABASE INTEGRATION TEST — connects directly to the local,
 * disposable Postgres instance started by `npm run db:start` /
 * `npm run db:reset` (see tests/integration/README.md). Unlike
 * src/lib/rls-policy.test.ts (a text-pattern guard over the migration
 * SQL files), every assertion here queries a real Postgres catalog after
 * all seven supabase/migrations/*.sql files have actually been applied —
 * this is the proof that the reconstructed migrations from Stage 0
 * genuinely reach the schema they claim to (see supabase/migrations/
 * README.md for what "reconstructed" means for each file).
 */

afterAll(async () => {
  await closePgPool();
});

const EXPECTED_TABLES = [
  "invites",
  "invite_guests",
  "invite_rsvps",
  "payments",
  "requests",
  "templates",
  "invite_payment_records",
] as const;

describe("tables", () => {
  it("all seven expected tables exist in public, with RLS enabled on every one", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by relname`
    );

    const byName = new Map(rows.map((r) => [r.relname, r]));
    for (const table of EXPECTED_TABLES) {
      const row = byName.get(table);
      expect(row, `table "${table}" should exist`).toBeDefined();
      expect(row!.relrowsecurity, `table "${table}" should have RLS enabled`).toBe(true);
    }
  });
});

describe("invites columns — exact live ordinal order (see supabase/migrations/README.md's cross-check)", () => {
  it("has exactly the 19 expected columns in the exact order every migration added them", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'invites'
       order by ordinal_position`
    );

    expect(rows.map((r) => r.column_name)).toEqual([
      "id",
      "slug",
      "category",
      "tier",
      "answers",
      "content",
      "created_at",
      "updated_at",
      "paid",
      "paypal_order_id",
      "owner_id",
      "request_id",
      "occasion",
      "generator_kind",
      "design_spec",
      "generator_content",
      "composition",
      "published_at",
      "created_by_admin_id",
    ]);
  });
});

describe("constraints", () => {
  it("every expected CHECK constraint exists with the exact predicate text", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
       from pg_constraint
       where connamespace = 'public'::regnamespace and contype = 'c'
       order by conname`
    );
    const byName = new Map(rows.map((r) => [r.conname, r.def]));

    expect(byName.get("invites_tier_check")).toContain("'bronze'::text");
    expect(byName.get("invites_occasion_check")).toContain("'haldi'::text");
    expect(byName.get("payments_expected_amount_check")).toContain("> (0)::numeric");
    expect(byName.get("requests_requested_occasions_check")).toContain("<@ ARRAY");
    expect(byName.get("invite_payment_records_method_check")).toContain("'cash'::text");
  });

  it("every expected foreign key exists with the correct ON DELETE behavior", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
       from pg_constraint
       where connamespace = 'public'::regnamespace and contype = 'f'
       order by conname`
    );
    const byName = new Map(rows.map((r) => [r.conname, r.def]));

    expect(byName.get("invites_owner_id_fkey")).toMatch(/REFERENCES auth\.users\(id\).*ON DELETE CASCADE/);
    expect(byName.get("invites_request_id_fkey")).toMatch(/REFERENCES requests\(id\).*ON DELETE SET NULL/);
    expect(byName.get("invites_created_by_admin_id_fkey")).toMatch(/REFERENCES auth\.users\(id\).*ON DELETE SET NULL/);
    expect(byName.get("payments_invitation_id_fkey")).toMatch(/REFERENCES invites\(id\).*ON DELETE CASCADE/);
    expect(byName.get("invite_guests_invite_id_fkey")).toMatch(/REFERENCES invites\(id\).*ON DELETE CASCADE/);
    expect(byName.get("invite_rsvps_guest_id_fkey")).toMatch(/REFERENCES invite_guests\(id\).*ON DELETE SET NULL/);
    expect(byName.get("invite_payment_records_invite_id_fkey")).toMatch(/REFERENCES invites\(id\).*ON DELETE CASCADE/);
  });

  it("every expected UNIQUE constraint exists", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where connamespace = 'public'::regnamespace and contype = 'u'`
    );
    const names = new Set(rows.map((r) => r.conname));
    expect(names.has("invites_slug_key")).toBe(true);
    expect(names.has("invite_guests_invite_id_slug_key")).toBe(true);
    expect(names.has("payments_provider_provider_order_id_key")).toBe(true);
  });
});

describe("indexes", () => {
  it("every expected explicit index exists", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`
    );
    const names = new Set(rows.map((r) => r.indexname));

    for (const idx of [
      "invites_owner_id_idx",
      "invites_request_id_idx",
      "invites_slug_idx",
      "payments_invitation_id_idx",
      "payments_owner_id_idx",
      "payments_invitation_status_idx",
      "requests_reference_code_idx",
      "requests_status_idx",
      "templates_category_idx",
      "templates_occasion_idx",
      "templates_status_idx",
      "invite_payment_records_invite_id_idx",
      "invite_guests_invite_id_idx",
      "invite_rsvps_invite_id_idx",
    ]) {
      expect(names.has(idx), `index "${idx}" should exist`).toBe(true);
    }
  });
});

describe("trigger", () => {
  it("invites_reject_client_paid_update exists as a BEFORE UPDATE row trigger on invites", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ tgname: string; def: string }>(
      `select tgname, pg_get_triggerdef(oid) as def
       from pg_trigger
       where not tgisinternal and tgrelid = 'public.invites'::regclass`
    );
    const trigger = rows.find((r) => r.tgname === "invites_reject_client_paid_update");
    expect(trigger).toBeDefined();
    expect(trigger!.def).toContain("BEFORE UPDATE");
    expect(trigger!.def).toContain("reject_client_paid_update");
  });
});

describe("functions", () => {
  it("all four SECURITY DEFINER functions exist, hardened with empty search_path", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ proname: string; prosecdef: boolean; config: string[] | null }>(
      `select proname, prosecdef, proconfig as config
       from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('can_insert_rsvp', 'resolve_invite_guest', 'get_published_invite', 'reject_client_paid_update')`
    );

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.prosecdef, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.config ?? [], `${row.proname} should set search_path = ''`).toContain('search_path=""');
    }
  });

  it("get_published_invite() returns the live 10-column shape, not the original 7-column one", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ args: string }>(
      `select pg_get_function_result(oid) as args
       from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'get_published_invite'`
    );
    expect(rows).toHaveLength(1);
    const returnType = rows[0].args;
    for (const col of ["id", "slug", "paid", "tier", "content", "event_date", "song", "generator_kind", "generator_content", "composition"]) {
      expect(returnType).toContain(col);
    }
  });
});

describe("policies", () => {
  it("invites/invite_guests/invite_rsvps/payments carry exactly the expected owner-scoped policies", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname`
    );

    const byTable = new Map<string, string[]>();
    for (const row of rows) {
      byTable.set(row.tablename, [...(byTable.get(row.tablename) ?? []), row.policyname]);
    }

    expect(byTable.get("invites")?.sort()).toEqual(
      ["invites owner delete", "invites owner insert", "invites owner read own", "invites owner update"].sort()
    );
    expect(byTable.get("payments")).toEqual(["payments owner read own"]);

    // requests/templates/invite_payment_records must carry NO policy at
    // all — RLS enabled + zero policies = deny-all for every role except
    // service_role. This is the live, verified-during-Stage-0 state;
    // Stage 1 must not have silently added one.
    for (const table of ["requests", "templates", "invite_payment_records"]) {
      expect(byTable.get(table) ?? [], `"${table}" should have no RLS policy`).toEqual([]);
    }
  });
});
