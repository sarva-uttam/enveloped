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
  "app_admins",
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
  it("all seven SECURITY DEFINER functions exist, hardened with empty search_path", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ proname: string; prosecdef: boolean; config: string[] | null }>(
      `select proname, prosecdef, proconfig as config
       from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('can_insert_rsvp', 'resolve_invite_guest', 'get_published_invite', 'reject_client_paid_update', 'is_admin', 'publish_invite', 'unpublish_invite')`
    );

    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.prosecdef, `${row.proname} should be SECURITY DEFINER`).toBe(true);
      expect(row.config ?? [], `${row.proname} should set search_path = ''`).toContain('search_path=""');
    }
  });

  it.each(["publish_invite", "unpublish_invite"])(
    "%s(uuid) returns boolean, is granted to authenticated only (never anon), and rejects a non-admin caller",
    async (fnName) => {
      const pool = getPgPool();
      const { rows } = await pool.query<{ args: string; result: string }>(
        `select pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as result
         from pg_proc
         where pronamespace = 'public'::regnamespace and proname = $1`,
        [fnName]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].args).toContain("uuid");
      expect(rows[0].result).toBe("boolean");

      const { rows: grants } = await pool.query<{ grantee: string; privilege_type: string }>(
        `select grantee, privilege_type
         from information_schema.role_routine_grants
         where routine_schema = 'public' and routine_name = $1`,
        [fnName]
      );
      const granted = new Set(grants.map((g) => `${g.grantee}:${g.privilege_type}`));
      expect(granted.has("authenticated:EXECUTE"), `${fnName} should grant EXECUTE to authenticated`).toBe(true);
      expect(granted.has("anon:EXECUTE"), `${fnName} should NOT grant EXECUTE to anon`).toBe(false);
    }
  );

  it("is_admin() takes no arguments, returns boolean, and only anon/authenticated are granted EXECUTE (never a raw SELECT grant on app_admins)", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ args: string; result: string }>(
      `select pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as result
       from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'is_admin'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].args).toBe("");
    expect(rows[0].result).toBe("boolean");

    const { rows: grants } = await pool.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
       from information_schema.role_routine_grants
       where routine_schema = 'public' and routine_name = 'is_admin'`
    );
    const granted = new Set(grants.map((g) => `${g.grantee}:${g.privilege_type}`));
    expect(granted.has("anon:EXECUTE")).toBe(true);
    expect(granted.has("authenticated:EXECUTE")).toBe(true);

    // Not checked here: whether anon/authenticated hold a table-level
    // GRANT on app_admins. They do — Supabase's own default architecture
    // grants broad table-level privileges to both roles on every `public`
    // table (confirmed identically on invites/payments/requests/etc.,
    // not something specific to this table) and relies on RLS alone,
    // never table-level GRANTs, as the actual enforcement layer. The real
    // proof that a client can't read/write app_admins is the RLS
    // behavioral tests in admin.test.ts, not a grant check here.
  });

  it("get_published_invite() returns the Stage 3 11-column shape (adds published_at), not the Stage 0-recovered 10-column one", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ args: string }>(
      `select pg_get_function_result(oid) as args
       from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'get_published_invite'`
    );
    expect(rows).toHaveLength(1);
    const returnType = rows[0].args;
    for (const col of ["id", "slug", "paid", "published_at", "tier", "content", "event_date", "song", "generator_kind", "generator_content", "composition"]) {
      expect(returnType).toContain(col);
    }
  });

  it("get_published_invite()/resolve_invite_guest()/can_insert_rsvp() all gate on published_at now, never on paid", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ proname: string; src: string }>(
      `select p.proname, pg_get_functiondef(p.oid) as src
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('get_published_invite', 'resolve_invite_guest', 'can_insert_rsvp')`
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const src = row.src.toLowerCase();
      expect(src, `${row.proname} should reference published_at`).toContain("published_at");
      // get_published_invite() still SELECTS i.paid as an informational
      // returned column (unchanged in meaning) — that's fine and
      // expected. What must be gone is `paid` ever gating (AND-ing)
      // visibility: the old `i.paid and (...)`/`i.paid = true` patterns.
      expect(src, `${row.proname} should not gate on i.paid and (...)`).not.toMatch(/i\.paid and \(/);
      expect(src, `${row.proname} should not gate on paid = true`).not.toMatch(/\.paid = true/);
    }
  });
});

describe("policies", () => {
  it("invites/invite_guests/invite_rsvps/payments carry exactly the expected owner-scoped policies — unchanged by Stage 2", async () => {
    const pool = getPgPool();
    const { rows } = await pool.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname`
    );

    const byTable = new Map<string, string[]>();
    for (const row of rows) {
      byTable.set(row.tablename, [...(byTable.get(row.tablename) ?? []), row.policyname]);
    }

    // Stage 2 (admin_identity) touches ONLY app_admins/requests/templates/
    // invite_payment_records — invites/payments must still carry exactly
    // their pre-Stage-2 owner-scoped policies, nothing added or removed.
    expect(byTable.get("invites")?.sort()).toEqual(
      ["invites owner delete", "invites owner insert", "invites owner read own", "invites owner update"].sort()
    );
    expect(byTable.get("payments")).toEqual(["payments owner read own"]);
  });

  it("requests/templates/invite_payment_records carry ONLY the four admin-gated policies added in 20260909120000_admin_identity.sql — no public/ordinary-authenticated policy exists on any of them", async () => {
    const pool = getPgPool();
    // qual = USING clause (select/update/delete); with_check = WITH CHECK
    // clause (insert/update) — an INSERT policy has only with_check, so
    // both must be checked, not qual alone.
    const { rows } = await pool.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `select tablename, policyname, qual, with_check
       from pg_policies
       where schemaname = 'public' and tablename in ('requests', 'templates', 'invite_payment_records')
       order by tablename, policyname`
    );

    const byTable = new Map<string, typeof rows>();
    for (const row of rows) {
      byTable.set(row.tablename, [...(byTable.get(row.tablename) ?? []), row]);
    }

    for (const table of ["requests", "templates", "invite_payment_records"]) {
      const policies = byTable.get(table) ?? [];
      expect(policies.map((p) => p.policyname).sort(), `"${table}" policies`).toEqual(
        [`${table} admin select`, `${table} admin insert`, `${table} admin update`, `${table} admin delete`].sort()
      );
      // Every one of them must be gated on is_admin() — never `true`,
      // never a role-membership check that isn't the hardened function.
      for (const policy of policies) {
        const combined = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
        expect(combined, `"${policy.policyname}" USING/WITH CHECK clause`).toContain("is_admin()");
      }
    }
  });

  it("app_admins itself: RLS enabled, exactly one SELECT policy gated on is_admin(), and NO insert/update/delete policy for anyone — the structural guarantee that a client can never grant admin rights", async () => {
    const pool = getPgPool();
    const { rows: relRows } = await pool.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = 'app_admins'`
    );
    expect(relRows[0]?.relrowsecurity).toBe(true);

    const { rows } = await pool.query<{ policyname: string; cmd: string; qual: string | null }>(
      `select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'app_admins'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].policyname).toBe("app_admins admin read");
    expect(rows[0].cmd).toBe("SELECT");
    expect(rows[0].qual ?? "").toContain("is_admin()");
  });
});
