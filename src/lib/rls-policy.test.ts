import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260828000000_auth_ownership.sql"
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

  it("invite_rsvps insert is NOT unconditional — it requires the invite to be paid, and any supplied guest_id to belong to that same invite", () => {
    // The exact regression this guards: the original policy was
    // `with check (true)` — anyone (the anon key is public) could insert
    // an RSVP against ANY invite_id, published or not, and cite ANY
    // guest_id regardless of which invite it actually belongs to.
    expect(sql).not.toMatch(/create policy "invite_rsvps public insert" on invite_rsvps for insert with check \(true\)/);

    const insert = policyBlock("invite_rsvps insert on published invite");

    // Condition 1: the referenced invite must be paid — closes "anonymous
    // users cannot insert against unpublished invitations" at the DB
    // level, not just via the app's submitRsvp() check.
    expect(insert).toMatch(/exists\s*\(\s*select 1 from invites i\s*where i\.id = invite_rsvps\.invite_id and i\.paid = true\s*\)/);

    // Condition 2: a supplied guest_id must belong to the SAME invite —
    // prevents citing a real guest_id that actually belongs to a
    // different invite (cross-invite misattribution). null guest_id
    // stays allowed (non-Platinum tiers have no named guest list).
    expect(insert).toContain("invite_rsvps.guest_id is null");
    expect(insert).toMatch(
      /exists\s*\(\s*select 1 from invite_guests g\s*where g\.id = invite_rsvps\.guest_id and g\.invite_id = invite_rsvps\.invite_id\s*\)/
    );
  });
});
