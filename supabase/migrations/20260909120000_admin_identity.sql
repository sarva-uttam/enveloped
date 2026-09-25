-- Stage 2 — single-admin identity and security boundary.
--
-- Adds a database-backed administrator membership model and the minimum
-- RLS needed for an administrator to read and manage `requests`,
-- `templates`, and `invite_payment_records` — the three tables Stage 0
-- recovered with RLS enabled and zero policies (deny-all to anon and
-- authenticated). This migration is forward-only and purely additive: it
-- does not alter any of the seven historical migrations, does not touch
-- `invites`/`invite_guests`/`invite_rsvps`/`payments` or their existing
-- policies/trigger, and does not add any generator, request-management,
-- template-editor, invitation-editor, payment, or publication behavior.
-- See PROJECT_STATUS.md's Stage 2 section for the full design rationale.

-- ---------------------------------------------------------------------
-- 1. app_admins — the membership table.
--
-- One row per administrator, keyed directly to auth.users.id. There is
-- exactly one administrator today, but nothing about this shape assumes
-- that: granting a second (or Nth) administrator is "insert one more
-- row", never a schema change. `created_by` records which admin (if any)
-- granted this row — null for the very first, bootstrapped admin, who by
-- definition wasn't granted by anyone through this table. `note` is a
-- free-text audit trail (e.g. "initial bootstrap via SQL editor,
-- 2026-09-09" or "granted by <email> on <date>") — optional, never
-- machine-read.
--
-- Deliberately NOT keyed off email or any other user-supplied identifier
-- — `user_id` is a foreign key into `auth.users`, the one identifier a
-- client can never forge (it's Supabase Auth's own primary key, set only
-- by GoTrue on sign-up/sign-in, never writable by the browser).
--
-- RLS is enabled here with no policy at all yet — the admin-only SELECT
-- policy is added in section 3 below, after is_admin() exists to power
-- it (a policy referencing a not-yet-created function fails to apply;
-- ask this migration's own first attempt, which got exactly that error
-- against a real local Postgres — see supabase/migrations/README.md).
-- ---------------------------------------------------------------------

create table if not exists app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  note text
);

alter table app_admins enable row level security;

-- ---------------------------------------------------------------------
-- 2. is_admin() — the one hardened authorization check every future
--    concierge-facing policy (and this project's own server code) should
--    call, rather than re-deriving admin status ad hoc.
--
-- SECURITY DEFINER is necessary here, not optional — the same reasoning
-- already documented for can_insert_rsvp() in
-- 20260901114159_auth_ownership.sql applies again: app_admins has no
-- SELECT policy usable by an ordinary caller (only the is_admin()-gated
-- one added in section 3, which would be circular for is_admin() itself
-- to depend on), so a SECURITY INVOKER version of this function would
-- see zero rows for literally everyone, admin or not, and always return
-- false. Running as the function owner (who created app_admins in this
-- same migration and is therefore unaffected by its RLS) is what lets
-- this correctly see the real row when one exists.
--
-- `auth.uid()` returns NULL for an anonymous caller, and `null =
-- user_id` is never true under SQL's three-valued logic — so anonymous
-- callers get `false` with no special-casing needed. An ordinary
-- authenticated user with no app_admins row also gets `false` — the
-- `exists(...)` simply finds nothing.
--
-- `set search_path = ''` plus the fully-qualified `public.app_admins`
-- reference: same search_path-hijacking rationale as every other
-- SECURITY DEFINER function in this project (see
-- 20260901114159_auth_ownership.sql's comment on resolve_invite_guest()
-- for the full explanation) — an empty search_path with every table
-- reference schema-qualified leaves no unqualified name for a malicious
-- same-named object elsewhere in the path to hijack.
--
-- Not client-editable: only EXECUTE is granted below, never anything
-- that could redefine the function itself — altering a function's own
-- definition requires being its owner (a Postgres server role no
-- Supabase Data API caller — anon, authenticated, or otherwise — ever
-- is), independent of any RLS policy.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.app_admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. app_admins — admin-only read, and nothing else for anyone.
--
-- No INSERT/UPDATE/DELETE policy for anon or authenticated — not even
-- for an existing administrator. This is deliberate, not an oversight:
-- with RLS enabled and no policy granting a given operation, that
-- operation is denied outright for every ordinary role, so "a client can
-- make themselves (or anyone) an administrator" is structurally
-- impossible through the anon/authenticated Supabase client, full stop —
-- not a convention, not something an app-layer check happens to also
-- enforce. Assigning the first (or any future) administrator is a
-- trusted, service-role-only operation — see "Bootstrapping the first
-- administrator" in PROJECT_STATUS.md/README.md for the exact procedure.
-- This intentionally means even a genuine administrator's own signed-in
-- client cannot grant admin rights to anyone, including themselves again
-- — see the migration's own regression-test companion,
-- tests/integration/admin.test.ts, "an administrator's own client cannot
-- grant admin rights to anyone, including themselves", for the proof.
--
-- The SELECT policy below, gated on is_admin(), lets a future
-- admin-management UI list existing administrators without a schema
-- change, while still returning nothing at all to anon/authenticated (no
-- policy = deny, same as every other operation on this table). Never
-- exposed through any public/guest-facing RPC — get_published_invite(),
-- resolve_invite_guest(), and can_insert_rsvp() (all defined in
-- 20260901114159_auth_ownership.sql, untouched by this migration) select
-- nothing from this table at all.
create policy "app_admins admin read" on app_admins for select using (is_admin());

-- ---------------------------------------------------------------------
-- 4. requests / templates / invite_payment_records — the minimum admin
--    policies. Each table already has RLS enabled with zero policies
--    (verified live in Stage 0, verified against a fresh local database
--    in Stage 1) — that deny-all state for anon/authenticated is
--    UNCHANGED by adding these; a caller for whom is_admin() is false
--    still matches no policy on any of these tables, on any operation.
-- ---------------------------------------------------------------------

create policy "requests admin select" on requests for select using (is_admin());
create policy "requests admin insert" on requests for insert with check (is_admin());
create policy "requests admin update" on requests for update using (is_admin()) with check (is_admin());
create policy "requests admin delete" on requests for delete using (is_admin());

create policy "templates admin select" on templates for select using (is_admin());
create policy "templates admin insert" on templates for insert with check (is_admin());
create policy "templates admin update" on templates for update using (is_admin()) with check (is_admin());
create policy "templates admin delete" on templates for delete using (is_admin());

create policy "invite_payment_records admin select" on invite_payment_records for select using (is_admin());
create policy "invite_payment_records admin insert" on invite_payment_records for insert with check (is_admin());
create policy "invite_payment_records admin update" on invite_payment_records for update using (is_admin()) with check (is_admin());
create policy "invite_payment_records admin delete" on invite_payment_records for delete using (is_admin());

-- Note: `invites`/`invite_guests`/`invite_rsvps`/`payments` and their
-- existing owner-scoped policies, and the invites_reject_client_paid_update
-- trigger (both from 20260901114159_auth_ownership.sql and
-- 20260901114212_payment_integrity.sql), are entirely untouched by this
-- migration — administrators are NOT granted any special access to them
-- here. Concierge tooling that needs an admin to read/manage a specific
-- client's invitation is explicitly out of this stage's scope (see
-- PROJECT_STATUS.md's Stage 2 section) and belongs to a later, purpose-
-- built migration once that tooling is actually designed.
