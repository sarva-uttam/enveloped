import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * IMPORTANT — what this test is and isn't:
 *
 * This is a TEXT-PATTERN regression guard over the migration SQL file,
 * not a real database test. It does not stand up Postgres, does not
 * execute the SQL, and cannot catch a logic error inside a policy or
 * function body that still contains the right-looking substrings. Its
 * only job is to fail loudly if someone edits the migration and
 * accidentally reverts one of the security-critical properties it checks
 * for — e.g. restoring a public read policy on `invites`, or letting
 * get_published_invite()/resolve_invite_guest() select something they
 * shouldn't. Treat a pass here as "the intent is still in the file", not
 * "the RLS/functions are proven correct" — see PROJECT_STATUS.md /
 * REVIEW_BRIEF.md for the standing recommendation to verify this against
 * a real (or local Docker) Postgres before fully trusting it in
 * production.
 */

// Stage 0 (2026-09-09) renamed this file from 20260828000000_auth_ownership.sql
// to 20260901114159_auth_ownership.sql to match the version Supabase's
// schema_migrations actually recorded for it — see
// supabase/migrations/README.md. The SQL body this test reads is
// otherwise unchanged.
const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260901114159_auth_ownership.sql"
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

function policyBlock(policyName: string): string {
  const idx = sql.indexOf(`create policy "${policyName.toLowerCase()}"`);
  if (idx === -1) throw new Error(`policy "${policyName}" not found in migration`);
  const end = sql.indexOf(";", idx);
  return sql.slice(idx, end === -1 ? undefined : end);
}

function functionBody(functionName: string): string {
  const startMarker = `create or replace function ${functionName.toLowerCase()}`;
  const start = sql.indexOf(startMarker);
  if (start === -1) throw new Error(`function "${functionName}" not found in migration`);
  // Function bodies in this file are all `as $$ ... $$;` — grab through
  // the closing "$$;" so we get the SQL body, not just the signature.
  const bodyEnd = sql.indexOf("$$;", start);
  if (bodyEnd === -1) throw new Error(`could not find end of function "${functionName}" body`);
  return sql.slice(start, bodyEnd + 3);
}

describe("auth_ownership migration — security property regression guard", () => {
  it("the raw invites table has NO public read policy at all (property: anonymous users cannot retrieve unpublished — or any raw — content)", () => {
    // Two things this guards against reverting to:
    //   1. The original bug: "invites public read" using (true) —
    //      readable by anyone regardless of paid status.
    //   2. An intermediate, still-wrong fix this migration itself went
    //      through: "invites public read published" using (paid = true)
    //      — better, but still `select("*")`-shaped, so it still shipped
    //      the raw `answers` column (guestNames, partnerNames, venue,
    //      city, colorMood, extraDetails) to any guest. Neither policy
    //      name should exist on the raw table at all, in any form —
    //      every non-owner read must go through get_published_invite().
    expect(sql).not.toMatch(/create policy "invites public read"/);
    expect(sql).not.toMatch(/create policy "invites public read published"/);

    const ownerRead = policyBlock("invites owner read own");
    expect(ownerRead).toContain("for select using (auth.uid() = owner_id)");
  });

  it("invite_guests has no public/unconditional read policy (property: guests cannot retrieve the full guest list)", () => {
    expect(sql).not.toMatch(/create policy "invite_guests public read"/);

    const ownerRead = policyBlock("invite_guests owner read");
    expect(ownerRead).toContain("auth.uid() = (select owner_id from invites");
  });

  it("resolve_invite_guest only resolves for a PAID invite, returns exactly one minimal row, cannot expose the full guest table, and is hardened against search_path hijacking", () => {
    const body = functionBody("resolve_invite_guest");
    expect(body).toContain("security definer");
    expect(body).toContain("limit 1");
    // The bug this specific check guards: an earlier version of this
    // function had no paid condition at all, so a guest link to an
    // UNPUBLISHED invite could still resolve a real name/teaser.
    expect(body).toContain("and i.paid = true");
    // Never a bare "select *" or a full-list shape — only the three
    // named, minimal columns.
    expect(body).toMatch(/select g\.id, g\.name, g\.click_teaser/);
    expect(sql).toContain("grant execute on function resolve_invite_guest(text, text) to anon, authenticated");

    // Hardening: an empty search_path plus schema-qualified table
    // references closes off "search_path hijacking" (a caller creating
    // a same-named object earlier in the path so the function silently
    // operates on their table instead of the real one). `public` alone
    // is NOT safe — that's the schema every ordinary role can typically
    // create objects in.
    expect(body).toContain("set search_path = ''");
    expect(body).not.toMatch(/set search_path = public\b/);
    expect(body).toContain("public.invite_guests");
    expect(body).toContain("public.invites");
    // Every bare (unqualified) reference to these tables should be gone
    // from the FROM/JOIN clauses — "from invite_guests"/"join invites"
    // without the "public." prefix would mean this check regressed.
    expect(body).not.toMatch(/from invite_guests\b/);
    expect(body).not.toMatch(/join invites\b/);
  });

  it("get_published_invite() exists, is locked down (security definer, empty search_path, qualified tables, explicit grants), and cannot leak answers/owner_id/paypal_order_id/guestNames", () => {
    const body = functionBody("get_published_invite");

    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).not.toMatch(/set search_path = public\b/);
    expect(body).toContain("public.invites");
    expect(body).not.toMatch(/from invites\b/); // must be "from public.invites", not bare

    // The exact leak this function exists to close: guestNames lives
    // inside `answers`, along with partnerNames/venue/city/colorMood/
    // extraDetails. None of that may appear anywhere in this function.
    expect(body).not.toContain("guestnames");
    expect(body).not.toContain("partnernames");
    expect(body).not.toContain("extradetails");
    expect(body).not.toContain("colormood");

    // owner_id and paypal_order_id must never be selected here — this is
    // the ONLY read path a non-owner has, so if either leaked in, it
    // would leak to every guest/anonymous visitor.
    expect(body).not.toContain("owner_id");
    expect(body).not.toContain("paypal_order_id");

    // The only two raw `answers` keys this function is allowed to touch
    // are eventDate and song (what the UI actually renders for a guest)
    // — and only via the ->> text-extraction operator, never the whole
    // `answers` object/column.
    expect(body).not.toMatch(/select\s+\*/);
    expect(body).not.toMatch(/i\.answers(?!\s*->>)/); // "i.answers" not immediately followed by ->>
    expect(body).toContain(`i.answers ->> 'eventdate'`);
    expect(body).toContain(`i.answers ->> 'song'`);

    // Content/tier/eventDate/song must be conditioned on paid — not
    // unconditionally selected.
    expect(body).toMatch(/case when i\.paid then i\.tier end/);
    expect(body).toMatch(/case when i\.paid then i\.content end/);

    expect(sql).toContain("grant execute on function get_published_invite(text) to anon, authenticated");
  });

  it("write policies (insert/update/delete) on invites are owner-scoped, not public (property: only the authenticated owner can access owner controls)", () => {
    for (const name of ["invites owner insert", "invites owner update", "invites owner delete"]) {
      expect(policyBlock(name)).toContain("auth.uid() = owner_id");
    }
    expect(sql).not.toMatch(/create policy "invites public insert"/);
    expect(sql).not.toMatch(/create policy "invites public update"/);
  });

  it("invite_rsvps insert is NOT unconditional — it delegates to can_insert_rsvp(), never inline exists(...) subqueries in the policy itself", () => {
    // Regression #1: the ORIGINAL policy was `with check (true)` —
    // anyone (the anon key is public) could insert an RSVP against ANY
    // invite_id, published or not, citing ANY guest_id.
    expect(sql).not.toMatch(/create policy "invite_rsvps public insert" on invite_rsvps for insert with check \(true\)/);

    const insert = policyBlock("invite_rsvps insert on published invite");

    // Regression #2 — the one this specific test exists for: an
    // intermediate draft "fixed" #1 by writing `exists (select 1 from
    // invites ...)` / `exists (select 1 from invite_guests ...)`
    // DIRECTLY in this policy's with-check expression. That's broken —
    // an RLS policy's own subqueries are themselves subject to RLS on
    // whatever they touch, and invites/invite_guests are owner-only for
    // SELECT, so an anonymous caller's inline subquery sees zero rows
    // and the check fails REGARDLESS of the real data — rejecting every
    // legitimate anonymous RSVP, not just illegitimate ones. The policy
    // must call the SECURITY DEFINER can_insert_rsvp() instead, which
    // bypasses that recursion the same way resolve_invite_guest()/
    // get_published_invite() already do.
    expect(insert).not.toMatch(/exists\s*\(\s*select 1 from invites/);
    expect(insert).not.toMatch(/exists\s*\(\s*select 1 from invite_guests/);
    expect(insert).toContain("with check (can_insert_rsvp(invite_rsvps.invite_id, invite_rsvps.guest_id))");
  });

  it("can_insert_rsvp() is a minimal boolean check, hardened against search_path hijacking, that verifies paid status and (when supplied) guest_id/invite_id ownership", () => {
    const body = functionBody("can_insert_rsvp");

    expect(body).toContain("returns boolean");
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).not.toMatch(/set search_path = public\b/);

    // Fully-qualified table references — same hijacking rationale as
    // the other two functions.
    expect(body).toContain("public.invites");
    expect(body).toContain("public.invite_guests");
    expect(body).not.toMatch(/from invites\b/); // must be "from public.invites"
    expect(body).not.toMatch(/from invite_guests\b/); // must be "from public.invite_guests"

    // Condition 1: the invite must be paid.
    expect(body).toMatch(/exists\s*\(\s*select 1 from public\.invites i\s*where i\.id = p_invite_id and i\.paid = true\s*\)/);

    // Condition 2: null guest_id is explicitly allowed (non-Platinum
    // tiers have no named guest list); a NON-null guest_id must belong
    // to the SAME invite_id — prevents citing a real guest_id that
    // actually belongs to a different invite.
    expect(body).toContain("p_guest_id is null");
    expect(body).toMatch(
      /exists\s*\(\s*select 1 from public\.invite_guests g\s*where g\.id = p_guest_id and g\.invite_id = p_invite_id\s*\)/
    );

    expect(sql).toContain("revoke all on function can_insert_rsvp(uuid, uuid) from public");
    expect(sql).toContain("grant execute on function can_insert_rsvp(uuid, uuid) to anon, authenticated");
  });
});

// ---------------------------------------------------------------------
// 2026-09-05 migrations — added during Stage 0 (2026-09-09) reconciliation.
// These three files are RECONSTRUCTED from live database introspection,
// not sourced from an original script — see
// supabase/migrations/README.md and each file's own header for exactly
// what "reconstructed" means and its confidence level. The regression
// guard below is scoped to what Stage 0 can actually assert with
// confidence: the function that superseded the one covered above, and
// that the three new tables carry no policy anywhere in the migration
// set. It deliberately does NOT assert the publish/payment coupling is
// fixed — it isn't; see the next test.
// ---------------------------------------------------------------------

const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");
const allMigrationsSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8").toLowerCase())
  .join("\n");

const publishSplitSql = readFileSync(
  path.resolve(migrationsDir, "20260905091530_generator_payment_publish_split.sql"),
  "utf8"
).toLowerCase();

function publishSplitFunctionBody(functionName: string): string {
  const startMarker = `create or replace function ${functionName.toLowerCase()}`;
  const start = publishSplitSql.indexOf(startMarker);
  if (start === -1) throw new Error(`function "${functionName}" not found in 20260905091530`);
  const bodyEnd = publishSplitSql.indexOf("$$;", start);
  if (bodyEnd === -1) throw new Error(`could not find end of function "${functionName}" body`);
  return publishSplitSql.slice(start, bodyEnd + 3);
}

describe("20260905091530_generator_payment_publish_split — the get_published_invite() actually live today", () => {
  it("still cannot leak answers/owner_id/paypal_order_id/guestNames, still security definer + empty search_path + qualified tables, same properties as the version it replaces", () => {
    const body = publishSplitFunctionBody("get_published_invite");

    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).not.toMatch(/set search_path = public\b/);
    expect(body).toContain("public.invites");
    expect(body).not.toMatch(/from invites\b/);

    expect(body).not.toContain("guestnames");
    expect(body).not.toContain("partnernames");
    expect(body).not.toContain("extradetails");
    expect(body).not.toContain("colormood");
    expect(body).not.toContain("owner_id");
    expect(body).not.toContain("paypal_order_id");

    expect(body).not.toMatch(/select\s+\*/);
    expect(body).not.toMatch(/i\.answers(?!\s*->>)/);
    expect(body).toContain(`i.answers ->> 'eventdate'`);
    expect(body).toContain(`i.answers ->> 'song'`);

    expect(sql).toContain("grant execute on function get_published_invite(text) to anon, authenticated");
  });

  it("KNOWN, TRACKED DEFECT — despite this migration's name, publication is still hard-coupled to payment: i.paid is an unconditional AND, published_at only ever narrows further. This test intentionally documents CURRENT live behavior, not desired behavior — see PROJECT_STATUS.md's Stage 0 section. A future migration that actually separates the two should update this assertion, not delete it silently.", () => {
    const body = publishSplitFunctionBody("get_published_invite");

    expect(body).toMatch(
      /i\.paid and \(i\.generator_kind is null or i\.published_at is not null\)/
    );
    // resolve_invite_guest() and can_insert_rsvp() (defined in
    // 20260901114159_auth_ownership.sql, unchanged since) have no
    // awareness of published_at at all — still gate on paid alone.
    const guestFnStart = sql.indexOf("create or replace function resolve_invite_guest");
    const guestFnEnd = sql.indexOf("$$;", guestFnStart);
    expect(sql.slice(guestFnStart, guestFnEnd)).not.toContain("published_at");
    const rsvpFnStart = sql.indexOf("create or replace function can_insert_rsvp");
    const rsvpFnEnd = sql.indexOf("$$;", rsvpFnStart);
    expect(sql.slice(rsvpFnStart, rsvpFnEnd)).not.toContain("published_at");
  });
});

describe("requests, templates, invite_payment_records — deny-all to ordinary roles, admin-gated since Stage 2", () => {
  it("all three have RLS enabled, and every policy on them is gated on is_admin() — never a bare `using (true)` or a role-membership check bypassing the hardened function", () => {
    for (const table of ["requests", "templates", "invite_payment_records"]) {
      expect(allMigrationsSql).toContain(`alter table ${table} enable row level security`);

      const policyMatches = [...allMigrationsSql.matchAll(new RegExp(`create policy "[^"]*" on ${table}[^;]*;`, "g"))];
      // Stage 0/1 asserted zero policies here; Stage 2 deliberately added
      // exactly four (select/insert/update/delete), all admin-gated —
      // see 20260909120000_admin_identity.sql. This regression guard now
      // protects THAT property instead: every policy that exists on
      // these tables calls is_admin(), and none is a bare `using (true)`.
      expect(policyMatches.length, `"${table}" should have exactly 4 admin policies`).toBe(4);
      for (const match of policyMatches) {
        expect(match[0]).toContain("is_admin()");
        expect(match[0]).not.toMatch(/using \(true\)/);
      }
    }
  });
});

describe("app_admins — the admin membership table itself", () => {
  it("has RLS enabled, and no create-policy statement anywhere grants INSERT/UPDATE/DELETE to anyone — the structural guarantee that no client, admin included, can grant admin rights", () => {
    expect(allMigrationsSql).toContain("alter table app_admins enable row level security");

    const policyMatches = [...allMigrationsSql.matchAll(/create policy "[^"]*" on app_admins[^;]*;/g)];
    expect(policyMatches).toHaveLength(1);
    expect(policyMatches[0][0]).toContain("app_admins admin read");
    expect(policyMatches[0][0]).toContain("for select");
    expect(policyMatches[0][0]).toContain("is_admin()");

    // Belt and braces: no "for insert"/"for update"/"for delete" policy
    // text exists anywhere against app_admins in the whole migration set.
    expect(allMigrationsSql).not.toMatch(/create policy "[^"]*" on app_admins for insert/);
    expect(allMigrationsSql).not.toMatch(/create policy "[^"]*" on app_admins for update/);
    expect(allMigrationsSql).not.toMatch(/create policy "[^"]*" on app_admins for delete/);
  });

  it("is_admin() is SECURITY DEFINER, hardened with empty search_path and a fully-qualified table reference, and only EXECUTE is granted — never a raw SELECT grant that would let a client bypass the function", () => {
    const startMarker = "create or replace function public.is_admin()";
    const start = allMigrationsSql.indexOf(startMarker);
    expect(start, "is_admin() definition should exist").toBeGreaterThan(-1);
    const bodyEnd = allMigrationsSql.indexOf("$$;", start);
    const body = allMigrationsSql.slice(start, bodyEnd + 3);

    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).not.toMatch(/set search_path = public\b/);
    expect(body).toContain("public.app_admins");
    expect(body).not.toMatch(/from app_admins\b/); // must be "from public.app_admins", not bare

    expect(allMigrationsSql).toContain("revoke all on function public.is_admin() from public");
    expect(allMigrationsSql).toContain("grant execute on function public.is_admin() to anon, authenticated");
  });
});

// ---------------------------------------------------------------------
// 20260909150000_publication_payment_split.sql — Stage 3, added
// 2026-09-09. Corrects the payment/publication coupling defect the
// tests above (and PROJECT_STATUS.md's Stage 0 section) document as a
// known, tracked issue: published_at becomes the sole public-access
// gate, paid no longer participates in it at all.
// ---------------------------------------------------------------------

const publicationSplitSql = readFileSync(
  path.resolve(migrationsDir, "20260909150000_publication_payment_split.sql"),
  "utf8"
).toLowerCase();

function publicationSplitFunctionBody(functionName: string): string {
  const startMarker = `create or replace function ${functionName.toLowerCase()}`;
  const start = publicationSplitSql.indexOf(startMarker);
  if (start === -1) throw new Error(`function "${functionName}" not found in 20260909150000`);
  const bodyEnd = publicationSplitSql.indexOf("$$;", start);
  if (bodyEnd === -1) throw new Error(`could not find end of function "${functionName}" body`);
  return publicationSplitSql.slice(start, bodyEnd + 3);
}

describe("20260909150000_publication_payment_split — published_at is the sole public-access gate", () => {
  it("get_published_invite()/resolve_invite_guest()/can_insert_rsvp() all gate on published_at, and the old i.paid-based gate is gone", () => {
    for (const fn of ["get_published_invite", "resolve_invite_guest", "can_insert_rsvp"]) {
      const body = publicationSplitFunctionBody(fn);
      expect(body, `${fn} should reference published_at`).toContain("published_at");
      expect(body, `${fn} should not gate on i.paid and (...)`).not.toMatch(/i\.paid and \(/);
      expect(body, `${fn} should not gate on paid = true`).not.toMatch(/\.paid = true/);
    }
  });

  it("get_published_invite() still cannot leak answers/owner_id/paypal_order_id/guestNames — the sanitization property survives the gate correction", () => {
    const body = publicationSplitFunctionBody("get_published_invite");
    expect(body).not.toContain("guestnames");
    expect(body).not.toContain("partnernames");
    expect(body).not.toContain("extradetails");
    expect(body).not.toContain("colormood");
    expect(body).not.toContain("owner_id");
    expect(body).not.toContain("paypal_order_id");
  });

  it("publish_invite()/unpublish_invite() both require is_admin(), are security definer with empty search_path, touch ONLY published_at, and are granted to authenticated only (anon explicitly revoked, countering Supabase's default-privilege auto-grant)", () => {
    for (const fn of ["public.publish_invite", "public.unpublish_invite"]) {
      const body = publicationSplitFunctionBody(fn);
      expect(body, `${fn} should check is_admin()`).toContain("public.is_admin()");
      expect(body, `${fn} should be security definer`).toContain("security definer");
      expect(body, `${fn} should set search_path = ''`).toContain("set search_path = ''");
      expect(body, `${fn} should never touch paid`).not.toContain("paid =");
      expect(body, `${fn} should never touch paypal_order_id`).not.toContain("paypal_order_id");
    }

    for (const fn of ["public.publish_invite(uuid)", "public.unpublish_invite(uuid)"]) {
      expect(publicationSplitSql).toContain(`grant execute on function ${fn} to authenticated`);
      expect(publicationSplitSql).toContain(`revoke execute on function ${fn} from anon`);
    }
  });

  it("reject_client_paid_update() protects published_at via the transaction-local publish_action flag, not a bare is_admin() check — closes the admin-owns-their-own-invite backdating gap found while writing this migration", () => {
    const body = publicationSplitFunctionBody("public.reject_client_paid_update");
    expect(body).toContain("new.published_at is distinct from old.published_at");
    expect(body).toContain("enveloped.publish_action");
    // The old, insufficient guard (is_admin() alone, with no
    // transaction-local flag) must not have crept back in.
    expect(body).not.toMatch(/and not public\.is_admin\(\)\s*then/);
    // paid/paypal_order_id keep their original service_role-only guard —
    // no is_admin() exception was ever added for those.
    expect(body).toContain("'paid and paypal_order_id can only be set by the payment system'");
  });

  it("the legacy backfill only ever targets paid, non-generator, not-yet-published rows — never an unpaid or already-published/generator row", () => {
    const backfillMatch = publicationSplitSql.match(/-- begin legacy backfill[\s\S]*?-- end legacy backfill/);
    expect(backfillMatch, "BEGIN/END LEGACY BACKFILL markers should exist").not.toBeNull();
    const block = backfillMatch![0];

    expect(block).toContain("i.paid = true");
    expect(block).toContain("i.generator_kind is null");
    expect(block).toContain("i.published_at is null");
    // Never a fabricated timestamp — must prefer a real, existing signal.
    expect(block).not.toMatch(/published_at\s*=\s*now\(\)/);
    expect(block).toContain("i.updated_at");
    expect(block).toContain("p.status = 'captured'");
  });
});
