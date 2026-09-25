-- Stage 3 — separate publication from payment.
--
-- Corrects the payment/publication coupling defect documented in Stage 0
-- (see PROJECT_STATUS.md and 20260905091530_generator_payment_publish_split.sql's
-- own header): `published_at` becomes the SOLE public-access gate for an
-- invitation. `paid` continues to record payment status only and no
-- longer influences what a guest or anonymous visitor can see, resolve,
-- or RSVP against. This is a forward-only migration — none of the eight
-- historical migrations are rewritten.
--
-- Owner business rule this migration implements exactly:
--   - published_at determines whether guests can access an invitation.
--   - paid records payment status only.
--   - An administrator may publish an unpaid invitation.
--   - A paid invitation must remain private until an administrator
--     publishes it.
--   - Payment must never automatically publish an invitation.
--   - Publication must never automatically mark an invitation paid.
--
-- NOT applied to the live project as of this writing — verified only
-- against the local Supabase stack, same as 20260909120000_admin_identity.sql.
-- See PROJECT_STATUS.md's Stage 3 section for the full account, including
-- what applying this to the live project will require and the resulting
-- behavior change to the self-service flow (payment no longer
-- auto-publishes — this is the owner's explicit rule, not a regression).

-- ---------------------------------------------------------------------
-- 1. Extend the payment-field trigger to also protect published_at.
--
-- The existing invites_reject_client_paid_update trigger (defined in
-- 20260901114212_payment_integrity.sql) already rejects any client
-- change to paid/paypal_order_id unless the connection is service_role.
-- This section adds the exact same protection for published_at.
--
-- published_at may be changed ONLY by service_role, or by a call that
-- passed through publish_invite()/unpublish_invite() below — NOT simply
-- by "being an administrator". This is a deliberately narrower guarantee
-- than "is_admin() may bypass this trigger", and the distinction matters
-- in one concrete, verified case: an administrator who ALSO happens to
-- own the invite in question can reach this trigger via a perfectly
-- ordinary raw `.update()` call (invites' owner-scoped RLS lets an
-- owner's own client update their own row regardless of admin status —
-- Stage 2 deliberately added no "admin may update any invite" policy).
-- An `is_admin()`-only check in this trigger would let that raw update
-- through and accept whatever timestamp the client sent — including a
-- backdated one — silently breaking the "set published_at to exactly
-- now()/null, never a client-supplied value" guarantee the functions
-- below are supposed to provide. Verified directly against this local
-- stack before landing on the design below: an admin who owns an invite
-- COULD set published_at to an arbitrary past timestamp via a plain
-- `.update()`, bypassing both functions entirely, under the simpler
-- `is_admin()`-only version of this trigger.
--
-- The fix: publish_invite()/unpublish_invite() set a TRANSACTION-LOCAL
-- flag (set_config(..., is_local => true), reset automatically at
-- transaction end — never visible to, or settable by, any other
-- request) immediately before their own UPDATE, and this trigger checks
-- for that flag instead of re-deriving "is this caller an admin" on its
-- own. The practical effect: published_at can now be changed ONLY by
-- code that runs INSIDE publish_invite()/unpublish_invite() — never by
-- any raw client update, regardless of who the caller is or what RLS
-- would otherwise let them touch.
--
-- paid/paypal_order_id remain service_role-ONLY, with no admin exception
-- of any kind — publishing/unpublishing must never touch payment
-- fields, and an administrator must never be able to set `paid` directly
-- either (payment status stays exclusively under the verified
-- PayPal-capture path, or a future equally server-authoritative
-- offline-payment path — see invite_payment_records, still
-- record-keeping only as of this stage, not wired to any write path
-- here).
-- ---------------------------------------------------------------------

create or replace function public.reject_client_paid_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.paid is distinct from old.paid or new.paypal_order_id is distinct from old.paypal_order_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'paid and paypal_order_id can only be set by the payment system';
  end if;

  if (new.published_at is distinct from old.published_at)
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('enveloped.publish_action', true), '') <> 'granted' then
    raise exception 'published_at can only be set by an administrator, through publish_invite() or unpublish_invite()';
  end if;

  return new;
end;
$$;

-- Trigger itself is unchanged (still BEFORE UPDATE, still this same
-- function by name) — re-creating it here is unnecessary since
-- `create or replace function` above already updates its behavior in
-- place; no `drop trigger`/`create trigger` needed.

-- ---------------------------------------------------------------------
-- 2. publish_invite() / unpublish_invite() — the two sanctioned,
--    administrator-only ways published_at is ever set by an interactive
--    session. Both:
--      - require public.is_admin() internally (never trust the GRANT
--        alone — same defense-in-depth already used by can_insert_rsvp(),
--        which re-checks its own conditions rather than assuming RLS
--        already filtered correctly);
--      - are SECURITY DEFINER (necessary: the invites table's own RLS
--        has no "administrator may update any invite" policy — Stage 2
--        deliberately did not add one, see its migration's closing note
--        — so a SECURITY INVOKER version would be blocked by RLS for
--        every caller except the invite's own owner, defeating the
--        entire point of an admin-only operation);
--      - use `set search_path = ''` with the fully-qualified
--        `public.invites` reference — same search_path-hijacking
--        rationale as every other SECURITY DEFINER function in this
--        project;
--      - touch ONLY published_at — never paid, never paypal_order_id,
--        never any other column — so publishing/unpublishing can never,
--        even accidentally, change payment state;
--      - set published_at to exactly now() (publish) or exactly null
--        (unpublish) — never a client-supplied timestamp. Genuinely
--        enforced, not just a comment: see section 1 above for why an
--        `is_admin()`-only trigger exception wasn't actually sufficient
--        to guarantee this, and how the transaction-local
--        `enveloped.publish_action` flag set immediately below closes
--        that gap;
--      - return a plain boolean: true if a matching invitation was
--        found and updated, false if p_invite_id matched no row (a
--        normal, expected outcome — e.g. a stale id — handled as a
--        clean return value, not an exception) — "fail safely for
--        missing invitations". A caller who is NOT an administrator gets
--        a thrown exception instead (an authorization failure, not a
--        data condition — PostgREST surfaces this as an error response,
--        matching how other admin-gated writes in this project behave
--        when RLS denies them).
--      - grant EXECUTE to `authenticated` only, never `anon` — an
--        anonymous caller has no legitimate reason to attempt this at
--        all, so it is not merely rejected by the internal check, it is
--        unreachable for that role in the first place.
-- ---------------------------------------------------------------------

create or replace function public.publish_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may publish an invitation';
  end if;

  perform set_config('enveloped.publish_action', 'granted', true);

  update public.invites
  set published_at = now()
  where id = p_invite_id;

  return found;
end;
$$;

revoke all on function public.publish_invite(uuid) from public;
grant execute on function public.publish_invite(uuid) to authenticated;
-- Supabase grants EXECUTE on every newly-created public.* function to
-- anon/authenticated/service_role by default (ALTER DEFAULT PRIVILEGES,
-- separate from — and not undone by — the `revoke ... from public`
-- above, which only removes the implicit "every role" grant, not this
-- additional, role-specific one) — confirmed directly against this
-- local stack while writing this migration, the exact same platform
-- behavior already documented for table-level grants in
-- tests/integration/schema.test.ts's is_admin() test (Stage 2). An
-- explicit revoke closes it here so "unavailable to anonymous users" is
-- literally true (unreachable), not merely "reachable but always
-- rejected by the internal is_admin() check" — belt AND braces.
revoke execute on function public.publish_invite(uuid) from anon;

create or replace function public.unpublish_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may unpublish an invitation';
  end if;

  perform set_config('enveloped.publish_action', 'granted', true);

  update public.invites
  set published_at = null
  where id = p_invite_id;

  return found;
end;
$$;

revoke all on function public.unpublish_invite(uuid) from public;
grant execute on function public.unpublish_invite(uuid) to authenticated;
-- Same platform-default correction as publish_invite() above.
revoke execute on function public.unpublish_invite(uuid) from anon;

-- ---------------------------------------------------------------------
-- 3. get_published_invite() — published_at becomes the SOLE gate.
--
-- Replaces the version from 20260905091530_generator_payment_publish_split.sql,
-- which despite that migration's name still hard-ANDed on `paid`
-- (`i.paid and (i.generator_kind is null or i.published_at is not
-- null)`) — see that file's own header and PROJECT_STATUS.md's Stage 0
-- section for the full account of that defect. Every generator-aware
-- column below is now gated on `i.published_at is not null` alone;
-- `paid`/`generator_kind` no longer participate in the visibility
-- decision at all.
--
-- Adds one new returned column, `published_at` itself — the app needs an
-- explicit, unambiguous signal for "is this published" that is NOT
-- `paid` (that was exactly the bug: inferring publication from payment).
-- `paid` is still returned, unchanged in meaning (payment status only,
-- informational) — removing it would be a larger, non-additive API
-- change than this correction requires.
--
-- Adding a column to `returns table (...)` requires `drop function`
-- first — `create or replace function` cannot change an existing
-- function's return-row shape (the exact SQLSTATE 42P13 lesson from
-- Stage 1's own local-database replay; see
-- supabase/migrations/README.md).
-- ---------------------------------------------------------------------

drop function if exists get_published_invite(text);

create or replace function get_published_invite(p_slug text)
returns table (
  id uuid,
  slug text,
  paid boolean,
  published_at timestamptz,
  tier text,
  content jsonb,
  event_date text,
  song text,
  generator_kind text,
  generator_content jsonb,
  composition jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id,
    i.slug,
    i.paid,
    i.published_at,
    case when i.published_at is not null then i.tier end as tier,
    case when i.published_at is not null then i.content end as content,
    case when i.published_at is not null then i.answers ->> 'eventDate' end as event_date,
    case when i.published_at is not null then i.answers ->> 'song' end as song,
    case when i.published_at is not null then i.generator_kind end as generator_kind,
    case when i.published_at is not null then i.generator_content end as generator_content,
    case when i.published_at is not null then i.composition end as composition
  from public.invites i
  where i.slug = p_slug
  limit 1;
$$;

revoke all on function get_published_invite(text) from public;
grant execute on function get_published_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. resolve_invite_guest() — gate on published_at, not paid. Return
--    shape unchanged (id, name, click_teaser), so a plain
--    `create or replace function` is sufficient — no drop needed.
-- ---------------------------------------------------------------------

create or replace function resolve_invite_guest(p_invite_slug text, p_guest_slug text)
returns table (id uuid, name text, click_teaser text)
language sql
security definer
set search_path = ''
stable
as $$
  select g.id, g.name, g.click_teaser
  from public.invite_guests g
  join public.invites i on i.id = g.invite_id
  where i.slug = p_invite_slug and g.slug = p_guest_slug and i.published_at is not null
  limit 1;
$$;

revoke all on function resolve_invite_guest(text, text) from public;
grant execute on function resolve_invite_guest(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. can_insert_rsvp() — gate on published_at, not paid. Return shape
--    unchanged (boolean) — no drop needed.
-- ---------------------------------------------------------------------

create or replace function can_insert_rsvp(p_invite_id uuid, p_guest_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.invites i
    where i.id = p_invite_id and i.published_at is not null
  )
  and (
    p_guest_id is null
    or exists (
      select 1 from public.invite_guests g
      where g.id = p_guest_id and g.invite_id = p_invite_id
    )
  );
$$;

revoke all on function can_insert_rsvp(uuid, uuid) from public;
grant execute on function can_insert_rsvp(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Legacy compatibility backfill.
--
-- Sets published_at on EXISTING rows so an already-shared guest link
-- does not silently go offline the moment this migration is applied —
-- without granting new visibility to anything that was never publicly
-- reachable before. The four rules below, in order, implement the
-- compatibility principle exactly:
--
--   a. Existing paid, NON-generator invitations (generator_kind is null
--      — i.e. every self-service invite, the only kind that existed
--      before the Stage 0-recovered generator columns) that were
--      publicly visible under the pre-Stage-3 rule receive a backfilled
--      published_at. Under the OLD get_published_invite() guard —
--      `i.paid and (i.generator_kind is null or i.published_at is not
--      null)` — a non-generator row's visibility reduced to simply
--      `i.paid`, so "paid = true and generator_kind is null" is exactly
--      the set of rows that were already guest-visible a moment before
--      this migration ran. Backfilling published_at for them preserves
--      that visibility instead of silently taking already-shared links
--      offline.
--
--      The backfilled VALUE prefers the most reliable available signal
--      for "when did this actually become paid", never a guess:
--        1. The matching captured PayPal payment's own updated_at
--           (payments.status = 'captured' for this invitation_id) — the
--           real, verified moment the payment integrity migration
--           recorded success. If more than one exists (shouldn't happen
--           given the unique (provider, provider_order_id) constraint,
--           but defensively), the most recent.
--        2. Otherwise, the invite's own updated_at — the best remaining
--           signal for a row that predates the payments table, or whose
--           payments row is for some reason not present.
--      Never `now()` (that's a fabricated "just now" moment for
--      something that may have been paid and shared long ago) and never
--      `created_at` (that's invite CREATION time, not payment time —
--      using it would understate how long the invite was actually
--      public and is available as a real, distinct column, so there is
--      no reason to conflate the two).
--
--   b. Existing GENERATOR invitations that already have published_at
--      set keep it EXACTLY as it is — this backfill's WHERE clause only
--      ever targets rows where published_at IS NULL, so an
--      already-published generator invite is never touched at all, by
--      construction.
--
--   c. Paid generator invitations WITHOUT published_at remain private —
--      also by construction: the backfill's WHERE clause requires
--      generator_kind IS NULL, so no generator-produced row (paid or
--      not) is ever touched by it. Under the pre-Stage-3 rule these were
--      already private unless published_at was already set (the guard
--      required generator_kind IS NULL OR published_at IS NOT NULL), so
--      there is no pre-existing public-visibility guarantee to preserve
--      for them — auto-publishing them now would be a NEW grant of
--      visibility this migration must not make unilaterally.
--
--   d. Unpaid invitations are never touched, published or not — the
--      WHERE clause requires paid = true. No unpaid invitation was ever
--      publicly visible before Stage 3; this backfill does not change
--      that.
--
-- The trigger from section 1 is temporarily disabled around this single
-- UPDATE statement — by the time this statement runs, the trigger
-- already enforces the NEW published_at protection added above, and a
-- raw migration-context connection has neither service_role standing
-- nor the transaction-local `enveloped.publish_action` flag
-- publish_invite()/unpublish_invite() set (auth.role() itself also
-- resolves to null outside of a real PostgREST/JWT request), so the
-- update would otherwise be rejected by the very protection this
-- migration just added. This does not weaken that protection going
-- forward: it is re-enabled immediately after, and only ever bypassed
-- here, once, by a migration script itself (already maximally trusted —
-- a migration can do anything to the schema regardless of triggers).
-- ---------------------------------------------------------------------

-- BEGIN LEGACY BACKFILL — self-contained (disable/update/enable
-- together): tests/integration/legacy-backfill.test.ts extracts and
-- re-runs exactly this block, verbatim, against freshly-seeded
-- legacy-shaped rows on the local stack, so it must work standalone —
-- including the trigger disable/enable, since a re-run happens over a
-- raw (non-PostgREST) connection with no service_role/publish_action
-- standing of its own, same as the migration's own original run.
alter table invites disable trigger invites_reject_client_paid_update;

update invites i
set published_at = coalesce(
  (
    select p.updated_at
    from payments p
    where p.invitation_id = i.id and p.status = 'captured'
    order by p.updated_at desc
    limit 1
  ),
  i.updated_at
)
where i.paid = true
  and i.generator_kind is null
  and i.published_at is null;

alter table invites enable trigger invites_reject_client_paid_update;
-- END LEGACY BACKFILL
