-- Stage 10 — guest management, personalized guest links, and RSVP
-- operations.
--
-- Forward-only, purely additive. Extends invite_guests with new,
-- defaulted/nullable columns (existing self-service rows migrate safely
-- with no reinterpretation: household_id null, permitted_attendees 1,
-- allow_plus_one false, is_active true, rsvp_status backfilled from any
-- existing invite_rsvps row). The legacy invite_guests/invite_rsvps owner
-- RLS policies (20260825050021, 20260901114159, 20260909150000) are
-- entirely untouched — the self-service flow keeps working exactly as it
-- does today.
--
-- The gap this migration closes: concierge invitations (owner_id is
-- null, generator_kind = 'concierge' — the entire Stage 8/9 focus) have
-- NO reachable guest-list mechanism today, because invite_guests' only
-- write policies are owner-scoped. This migration adds an
-- administrator-authorized path that works regardless of owner_id,
-- mirroring the two proven patterns already in this codebase:
--   - invite_previews (Stage 5) for the personalized guest LINK token —
--     invite_guest_links below is structurally identical: one row per
--     guest, token_hash only, zero RLS policy, reachable only through
--     SECURITY DEFINER functions, none of which ever return token_hash.
--   - review_rounds/admin_audit_log (Stage 8/9) for admin-visible,
--     function-mediated writes with an audit trail.
--
-- A guest link is deliberately a SEPARATE credential from a preview
-- link — separate table, separate token module (src/lib/guest-tokens.
-- server.ts), separate redemption function (get_guest_invite(), never
-- get_invite_preview()) — "private preview tokens must never function as
-- guest tokens" is structural here, not conventional: a preview token
-- hashed and looked up against invite_guest_links.token_hash matches
-- nothing, by construction, regardless of format similarity.
--
-- NOT applied to the live project — verified only against the local
-- Supabase stack, same as every migration since Stage 2.

-- =======================================================================
-- 1. invite_guest_households — simple grouping, no security-sensitive
--    invariant of its own (a household name is not private, and grouping
--    guests has no state machine to protect) — admin CRUD via direct RLS
--    policy, the same shape as requests/templates (Stage 2), not a
--    function-mediated table.
-- =======================================================================

create table if not exists invite_guest_households (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists invite_guest_households_invite_id_idx on invite_guest_households (invite_id);

alter table invite_guest_households enable row level security;

create policy "invite_guest_households admin select" on invite_guest_households for select using (public.is_admin());
create policy "invite_guest_households admin insert" on invite_guest_households for insert with check (public.is_admin());
create policy "invite_guest_households admin update" on invite_guest_households for update using (public.is_admin()) with check (public.is_admin());
create policy "invite_guest_households admin delete" on invite_guest_households for delete using (public.is_admin());

-- =======================================================================
-- 2. invite_guests — extend, never replace. Every new column is
--    nullable or defaulted so `select * from invite_guests` on an
--    existing (pre-Stage-10) row remains fully valid.
--
--    rsvp_status/attendee_count/plus_one_name/dietary_notes/
--    event_attendance/responded_at hold the CURRENT response for a guest
--    reached through a personalized link (submit_guest_rsvp() below) —
--    deliberately NOT routed through invite_rsvps (the legacy
--    self-service ledger, append-only, no unique constraint on
--    (invite_id, guest_id), untouched by this migration): a guest
--    correcting their RSVP via the same link updates this ONE row in
--    place, rather than requiring a new unique constraint on a table
--    whose existing self-service behavior (repeated plain inserts) must
--    not change.
--
--    Constraints encode the business rules structurally, not just in
--    application code: attendee_count can never exceed
--    permitted_attendees; a plus-one name can only be set when
--    allow_plus_one is true; a declined guest always has attendee_count
--    0 (no contradictory attendance state).
-- =======================================================================

alter table invite_guests add column if not exists household_id uuid references invite_guest_households (id) on delete set null;
alter table invite_guests add column if not exists contact_email text check (contact_email is null or char_length(contact_email) <= 254);
alter table invite_guests add column if not exists contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30);
alter table invite_guests add column if not exists permitted_attendees integer not null default 1 check (permitted_attendees between 1 and 10);
alter table invite_guests add column if not exists allow_plus_one boolean not null default false;
alter table invite_guests add column if not exists internal_notes text check (internal_notes is null or char_length(internal_notes) <= 2000);
alter table invite_guests add column if not exists is_active boolean not null default true;
alter table invite_guests add column if not exists rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'attending', 'declined'));
alter table invite_guests add column if not exists attendee_count integer not null default 0 check (attendee_count >= 0);
alter table invite_guests add column if not exists plus_one_name text check (plus_one_name is null or char_length(plus_one_name) <= 120);
alter table invite_guests add column if not exists dietary_notes text check (dietary_notes is null or char_length(dietary_notes) <= 500);
alter table invite_guests add column if not exists event_attendance jsonb not null default '[]'::jsonb;
alter table invite_guests add column if not exists responded_at timestamptz;
alter table invite_guests add column if not exists updated_at timestamptz not null default now();

alter table invite_guests add constraint invite_guests_attendee_within_permitted check (attendee_count <= permitted_attendees);
alter table invite_guests add constraint invite_guests_plus_one_requires_permission check (plus_one_name is null or allow_plus_one);
alter table invite_guests add constraint invite_guests_declined_has_no_attendees check (rsvp_status <> 'declined' or attendee_count = 0);
alter table invite_guests add constraint invite_guests_event_attendance_bounded check (jsonb_array_length(event_attendance) <= 12);

create index if not exists invite_guests_household_id_idx on invite_guests (household_id);

-- Backfill: reflect any EXISTING legacy invite_rsvps response on the
-- guest row it belongs to, so a guest who already responded through the
-- self-service form does not silently reset to "pending" once this
-- column starts being read. Uses the most recent matching row per guest
-- (the legacy flow allows repeated inserts with no upsert). Attendee
-- count/plus-one/dietary data has no legacy equivalent — left at this
-- migration's defaults (0 / null / null), never guessed.
with latest_legacy_rsvp as (
  select distinct on (r.guest_id) r.guest_id, r.status, r.created_at
  from invite_rsvps r
  where r.guest_id is not null
  order by r.guest_id, r.created_at desc
)
update invite_guests g
set rsvp_status = case when l.status = 'yes' then 'attending' else 'declined' end,
    responded_at = l.created_at
from latest_legacy_rsvp l
where l.guest_id = g.id;

-- Admin-visible read, same shape as "invites admin select" (Stage 8) —
-- cheap, no invariant to protect on a plain read. Every WRITE still goes
-- through a function below (audit-logged), never this policy.
create policy "invite_guests admin select" on invite_guests for select using (public.is_admin());

comment on table invite_guests is
  'Legacy self-service guest list (owner-scoped RLS, unchanged since genesis) extended in Stage 10 with concierge-guest-management columns. Owner writes continue via direct table access; administrator writes go exclusively through admin_create_guest()/admin_update_guest()/admin_set_guest_active()/admin_delete_guest() below, each audit-logged.';

-- =======================================================================
-- 3. invite_guest_links — the personalized guest link's token-hash
--    table. Structurally identical to invite_previews (Stage 5): one row
--    per guest (`guest_id` is the PRIMARY KEY, not just unique), RLS
--    enabled with ZERO policy for any role including an administrator's
--    own client — reachable only through the three functions below, none
--    of which ever return token_hash.
-- =======================================================================

create table if not exists invite_guest_links (
  guest_id uuid primary key references invite_guests (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  rotated_at timestamptz,
  revoked_at timestamptz
);

alter table invite_guest_links enable row level security;
-- Deliberately no policy at all — see invite_previews' own comment
-- (20260910120000) for the full rationale, identical here.

-- =======================================================================
-- 4. Admin guest CRUD — each is_admin()-gated, SECURITY DEFINER (RLS on
--    invite_guests has no "administrator may write any row" policy, by
--    design — see section 2), search_path='' with fully-qualified
--    public.* references, minimal grants (authenticated only, anon
--    explicitly revoked to close the ALTER DEFAULT PRIVILEGES gap
--    documented in every prior migration).
-- =======================================================================

create or replace function public.admin_create_guest(
  p_invite_id uuid,
  p_name text,
  p_slug text,
  p_household_id uuid default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_permitted_attendees integer default 1,
  p_allow_plus_one boolean default false,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may create a guest';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 or char_length(p_name) > 160 then
    raise exception 'invalid guest name';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,127}$' then
    raise exception 'invalid guest slug';
  end if;

  if p_household_id is not null and not exists (
    select 1 from public.invite_guest_households h where h.id = p_household_id and h.invite_id = p_invite_id
  ) then
    raise exception 'household does not belong to this invitation';
  end if;

  insert into public.invite_guests (
    invite_id, name, slug, click_teaser, household_id, contact_email, contact_phone,
    permitted_attendees, allow_plus_one, internal_notes
  ) values (
    p_invite_id, trim(p_name), p_slug, '', p_household_id, p_contact_email, p_contact_phone,
    coalesce(p_permitted_attendees, 1), coalesce(p_allow_plus_one, false), p_internal_notes
  )
  returning id into v_new_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_created', 'invite_guests', v_new_id, jsonb_build_object('invite_id', p_invite_id));

  return v_new_id;
exception
  when unique_violation then
    raise exception 'a guest with this slug already exists for this invitation';
end;
$$;

revoke all on function public.admin_create_guest(uuid, text, text, uuid, text, text, integer, boolean, text) from public;
grant execute on function public.admin_create_guest(uuid, text, text, uuid, text, text, integer, boolean, text) to authenticated;
revoke execute on function public.admin_create_guest(uuid, text, text, uuid, text, text, integer, boolean, text) from anon;

create or replace function public.admin_update_guest(
  p_guest_id uuid,
  p_name text,
  p_household_id uuid default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_permitted_attendees integer default 1,
  p_allow_plus_one boolean default false,
  p_internal_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may update a guest';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 or char_length(p_name) > 160 then
    raise exception 'invalid guest name';
  end if;

  select invite_id into v_invite_id from public.invite_guests where id = p_guest_id;
  if v_invite_id is null then
    return false;
  end if;

  if p_household_id is not null and not exists (
    select 1 from public.invite_guest_households h where h.id = p_household_id and h.invite_id = v_invite_id
  ) then
    raise exception 'household does not belong to this invitation';
  end if;

  update public.invite_guests
  set name = trim(p_name),
      household_id = p_household_id,
      contact_email = p_contact_email,
      contact_phone = p_contact_phone,
      permitted_attendees = coalesce(p_permitted_attendees, 1),
      allow_plus_one = coalesce(p_allow_plus_one, false),
      internal_notes = p_internal_notes,
      -- Shrinking the permitted count below an already-recorded response
      -- must never leave a contradictory row; clamp the recorded
      -- attendee_count down with it rather than violating the
      -- attendee-within-permitted constraint.
      attendee_count = least(attendee_count, coalesce(p_permitted_attendees, 1)),
      updated_at = now()
  where id = p_guest_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_updated', 'invite_guests', p_guest_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_update_guest(uuid, text, uuid, text, text, integer, boolean, text) from public;
grant execute on function public.admin_update_guest(uuid, text, uuid, text, text, integer, boolean, text) to authenticated;
revoke execute on function public.admin_update_guest(uuid, text, uuid, text, text, integer, boolean, text) from anon;

create or replace function public.admin_set_guest_active(p_guest_id uuid, p_is_active boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may change a guest''s active state';
  end if;

  update public.invite_guests
  set is_active = p_is_active, updated_at = now()
  where id = p_guest_id
  returning invite_id into v_invite_id;

  if v_invite_id is null then
    return false;
  end if;

  -- A revoked/deactivated guest's link is revoked in the same action —
  -- "active/revoked state" for the guest and for their link should never
  -- silently diverge (a deactivated guest whose link still resolves
  -- would be a real access-control gap, not a UI inconsistency).
  if not p_is_active then
    update public.invite_guest_links set revoked_at = now() where guest_id = p_guest_id and revoked_at is null;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_active_state_changed', 'invite_guests', p_guest_id, jsonb_build_object('is_active', p_is_active));

  return true;
end;
$$;

revoke all on function public.admin_set_guest_active(uuid, boolean) from public;
grant execute on function public.admin_set_guest_active(uuid, boolean) to authenticated;
revoke execute on function public.admin_set_guest_active(uuid, boolean) from anon;

-- Delete is intentionally the narrow exception, not the default action
-- ("delete behavior only if recoverable and justified — prefer archive/
-- deactivate"): only permitted for a guest who has never responded and
-- never had a link issued — i.e. a just-created row that was plainly a
-- mistake. Anything with response or link history must be archived
-- (admin_set_guest_active(false)) instead, structurally, not merely by
-- UI convention.
create or replace function public.admin_delete_guest(p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_rsvp_status text;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may delete a guest';
  end if;

  select invite_id, rsvp_status into v_invite_id, v_rsvp_status from public.invite_guests where id = p_guest_id;
  if v_invite_id is null then
    return false;
  end if;

  if v_rsvp_status <> 'pending' then
    raise exception 'this guest has already responded — deactivate instead of deleting';
  end if;

  if exists (select 1 from public.invite_guest_links l where l.guest_id = p_guest_id) then
    raise exception 'this guest has an issued link — deactivate instead of deleting';
  end if;

  delete from public.invite_guests where id = p_guest_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_deleted', 'invite_guests', p_guest_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_delete_guest(uuid) from public;
grant execute on function public.admin_delete_guest(uuid) to authenticated;
revoke execute on function public.admin_delete_guest(uuid) from anon;

-- =======================================================================
-- 5. Personalized guest link lifecycle — byte-for-byte the same shape as
--    admin_create_invite_preview()/admin_rotate_invite_preview()/
--    admin_revoke_invite_preview() (Stage 5), against invite_guest_links
--    instead of invite_previews. Take the ALREADY-HASHED token — raw
--    generation and hashing happen in src/lib/guest-tokens.server.ts, in
--    trusted Node code, before this function is ever called.
-- =======================================================================

create or replace function public.admin_create_guest_link(p_guest_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may create a guest link';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash';
  end if;

  select invite_id into v_invite_id from public.invite_guests where id = p_guest_id;
  if v_invite_id is null then
    raise exception 'guest not found';
  end if;

  insert into public.invite_guest_links (guest_id, token_hash, created_by)
  values (p_guest_id, p_token_hash, auth.uid());

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_link_created', 'invite_guests', p_guest_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
exception
  when unique_violation then
    raise exception 'a link already exists for this guest — rotate it instead';
end;
$$;

revoke all on function public.admin_create_guest_link(uuid, text) from public;
grant execute on function public.admin_create_guest_link(uuid, text) to authenticated;
revoke execute on function public.admin_create_guest_link(uuid, text) from anon;

create or replace function public.admin_rotate_guest_link(p_guest_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may rotate a guest link';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash';
  end if;

  update public.invite_guest_links
  set token_hash = p_token_hash, rotated_at = now(), revoked_at = null
  where guest_id = p_guest_id;

  if found then
    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'guest_link_rotated', 'invite_guests', p_guest_id, '{}'::jsonb);
  end if;

  return found;
end;
$$;

revoke all on function public.admin_rotate_guest_link(uuid, text) from public;
grant execute on function public.admin_rotate_guest_link(uuid, text) to authenticated;
revoke execute on function public.admin_rotate_guest_link(uuid, text) from anon;

create or replace function public.admin_revoke_guest_link(p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may revoke a guest link';
  end if;

  update public.invite_guest_links
  set revoked_at = now()
  where guest_id = p_guest_id and revoked_at is null;

  if found then
    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'guest_link_revoked', 'invite_guests', p_guest_id, '{}'::jsonb);
  end if;

  return found;
end;
$$;

revoke all on function public.admin_revoke_guest_link(uuid) from public;
grant execute on function public.admin_revoke_guest_link(uuid) to authenticated;
revoke execute on function public.admin_revoke_guest_link(uuid) from anon;

-- =======================================================================
-- 6. admin_list_invite_guests() — the admin guest-list read model. A
--    dedicated function, not a direct table select, specifically so it
--    can join invite_guest_links (zero RLS policy of its own — see
--    section 3) and invite_guest_households in one round trip; the
--    exact same reason admin_invite_has_preview_link() (Stage 9) exists
--    instead of a raw PostgREST read of invite_previews. Never returns
--    token_hash — only a boolean has_link/link_revoked pair.
-- =======================================================================

create or replace function public.admin_list_invite_guests(p_invite_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  household_id uuid,
  household_name text,
  contact_email text,
  contact_phone text,
  permitted_attendees integer,
  allow_plus_one boolean,
  internal_notes text,
  is_active boolean,
  rsvp_status text,
  attendee_count integer,
  plus_one_name text,
  dietary_notes text,
  event_attendance jsonb,
  responded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  has_link boolean,
  link_revoked boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may list guests';
  end if;

  return query
  select
    g.id, g.name, g.slug, g.household_id, h.name as household_name,
    g.contact_email, g.contact_phone, g.permitted_attendees, g.allow_plus_one, g.internal_notes,
    g.is_active, g.rsvp_status, g.attendee_count, g.plus_one_name, g.dietary_notes, g.event_attendance,
    g.responded_at, g.created_at, g.updated_at,
    (l.guest_id is not null) as has_link,
    coalesce(l.revoked_at is not null, false) as link_revoked
  from public.invite_guests g
  left join public.invite_guest_households h on h.id = g.household_id
  left join public.invite_guest_links l on l.guest_id = g.id
  where g.invite_id = p_invite_id
  order by g.created_at asc;
end;
$$;

revoke all on function public.admin_list_invite_guests(uuid) from public;
grant execute on function public.admin_list_invite_guests(uuid) to authenticated;
revoke execute on function public.admin_list_invite_guests(uuid) from anon;

-- =======================================================================
-- 7. admin_guest_dashboard_summary() — exact counts, never decorative.
--    Event-level and plus-one totals are derived only from ATTENDING
--    guests' event_attendance/plus_one_name, matching "no contradictory
--    attendance state" — a declined guest's stored attendee_count is
--    always 0 (enforced by the table constraint above), so it never
--    inflates any total here regardless of stale event_attendance data.
-- =======================================================================

create or replace function public.admin_guest_dashboard_summary(p_invite_id uuid)
returns table (
  total_invited bigint,
  responded bigint,
  attending bigint,
  declined bigint,
  pending bigint,
  total_expected_attendees bigint,
  plus_one_count bigint,
  with_dietary_notes bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may view the guest dashboard';
  end if;

  return query
  select
    count(*) filter (where g.is_active) as total_invited,
    count(*) filter (where g.is_active and g.rsvp_status <> 'pending') as responded,
    count(*) filter (where g.is_active and g.rsvp_status = 'attending') as attending,
    count(*) filter (where g.is_active and g.rsvp_status = 'declined') as declined,
    count(*) filter (where g.is_active and g.rsvp_status = 'pending') as pending,
    coalesce(sum(g.attendee_count) filter (where g.is_active and g.rsvp_status = 'attending'), 0) as total_expected_attendees,
    count(*) filter (where g.is_active and g.rsvp_status = 'attending' and g.plus_one_name is not null) as plus_one_count,
    count(*) filter (where g.is_active and g.rsvp_status = 'attending' and g.dietary_notes is not null and char_length(trim(g.dietary_notes)) > 0) as with_dietary_notes
  from public.invite_guests g
  where g.invite_id = p_invite_id;
end;
$$;

revoke all on function public.admin_guest_dashboard_summary(uuid) from public;
grant execute on function public.admin_guest_dashboard_summary(uuid) to authenticated;
revoke execute on function public.admin_guest_dashboard_summary(uuid) from anon;

-- =======================================================================
-- 8. admin_bulk_import_guests() — CSV-preview-approved rows, applied in
--    ONE transaction (a single function call is already one Postgres
--    transaction — no explicit BEGIN/COMMIT needed for "all validated
--    rows commit together, a genuine database error rolls back the
--    whole batch"). Duplicate rows (by contact_email, case-insensitively,
--    when present, else by exact name match) against EITHER the batch
--    itself or this invitation's existing guests are skipped and
--    reported, never inserted twice and never treated as a fatal error
--    for the rest of the batch. Never generates a link — that stays a
--    separate, explicit, per-guest opt-in via admin_create_guest_link(),
--    called from TypeScript only when the caller explicitly asked for
--    links (never as a side effect of import).
--
--    p_rows shape (validated defensively here even though the trusted
--    TypeScript layer already validates with Zod first — same
--    defense-in-depth as every other admin function in this project):
--    [{ "name": text, "householdName": text|null, "contactEmail": text|null,
--       "contactPhone": text|null, "permittedAttendees": int|null,
--       "allowPlusOne": bool|null, "internalNotes": text|null }, ...]
-- =======================================================================

create or replace function public.admin_bulk_import_guests(p_invite_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_index integer := 0;
  v_name text;
  v_email text;
  v_household_name text;
  v_household_id uuid;
  v_dedupe_key text;
  v_seen_keys text[] := array[]::text[];
  v_guest_id uuid;
  v_inserted integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may import guests';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'import is limited to 500 rows per file';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_index := v_index + 1;
    v_name := trim(coalesce(v_row ->> 'name', ''));
    v_email := nullif(trim(lower(coalesce(v_row ->> 'contactEmail', ''))), '');

    if v_name = '' or char_length(v_name) > 160 then
      v_results := v_results || jsonb_build_object('row', v_index, 'status', 'error', 'reason', 'invalid or missing name');
      continue;
    end if;

    v_dedupe_key := coalesce(v_email, lower(v_name));

    if v_dedupe_key = any(v_seen_keys) then
      v_results := v_results || jsonb_build_object('row', v_index, 'status', 'skipped', 'reason', 'duplicate within file');
      continue;
    end if;

    if (
      v_email is not null and exists (
        select 1 from public.invite_guests g where g.invite_id = p_invite_id and lower(g.contact_email) = v_email
      )
    ) or (
      v_email is null and exists (
        select 1 from public.invite_guests g where g.invite_id = p_invite_id and lower(g.name) = lower(v_name)
      )
    ) then
      v_results := v_results || jsonb_build_object('row', v_index, 'status', 'skipped', 'reason', 'duplicate of an existing guest');
      continue;
    end if;

    v_seen_keys := array_append(v_seen_keys, v_dedupe_key);

    v_household_id := null;
    v_household_name := trim(coalesce(v_row ->> 'householdName', ''));
    if v_household_name <> '' then
      select id into v_household_id from public.invite_guest_households
      where invite_id = p_invite_id and lower(name) = lower(v_household_name)
      limit 1;

      if v_household_id is null then
        insert into public.invite_guest_households (invite_id, name)
        values (p_invite_id, v_household_name)
        returning id into v_household_id;
      end if;
    end if;

    insert into public.invite_guests (
      invite_id, name, slug, click_teaser, household_id, contact_email, contact_phone,
      permitted_attendees, allow_plus_one, internal_notes
    ) values (
      p_invite_id, v_name,
      lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8),
      '', v_household_id, v_row ->> 'contactEmail', v_row ->> 'contactPhone',
      coalesce((v_row ->> 'permittedAttendees')::integer, 1),
      coalesce((v_row ->> 'allowPlusOne')::boolean, false),
      nullif(v_row ->> 'internalNotes', '')
    )
    returning id into v_guest_id;

    v_inserted := v_inserted + 1;
    v_results := v_results || jsonb_build_object('row', v_index, 'status', 'inserted', 'guestId', v_guest_id);
  end loop;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'guest_bulk_import', 'invites', p_invite_id, jsonb_build_object('inserted', v_inserted, 'rows', jsonb_array_length(p_rows)));

  return jsonb_build_object('inserted', v_inserted, 'results', v_results);
end;
$$;

revoke all on function public.admin_bulk_import_guests(uuid, jsonb) from public;
grant execute on function public.admin_bulk_import_guests(uuid, jsonb) to authenticated;
revoke execute on function public.admin_bulk_import_guests(uuid, jsonb) from anon;

-- =======================================================================
-- 9. get_guest_invite(p_token) — the ONE way a raw guest token is ever
--    redeemed. Unlike get_invite_preview() (Stage 5), this DOES gate on
--    published_at — a guest link grants no early/unpublished access,
--    only preview links do that. Also requires the link to be
--    un-revoked AND the guest itself to be is_active — a deactivated
--    guest's link stops working immediately even if never explicitly
--    revoked on its own.
--
--    Returns only what a guest's personalized invitation experience
--    needs: never owner_id, request_id, internal_notes, contact
--    fields, token_hash, or anything payment/admin/review-related.
-- =======================================================================

create or replace function public.get_guest_invite(p_token text)
returns table (
  invite_id uuid,
  slug text,
  tier text,
  content jsonb,
  composition jsonb,
  guest_id uuid,
  guest_name text,
  permitted_attendees integer,
  allow_plus_one boolean,
  rsvp_status text,
  attendee_count integer,
  plus_one_name text,
  dietary_notes text,
  event_attendance jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id, i.slug, i.tier, i.content, i.composition,
    g.id, g.name, g.permitted_attendees, g.allow_plus_one,
    g.rsvp_status, g.attendee_count, g.plus_one_name, g.dietary_notes, g.event_attendance
  from public.invite_guest_links l
  join public.invite_guests g on g.id = l.guest_id
  join public.invites i on i.id = g.invite_id
  where l.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and l.revoked_at is null
    and g.is_active
    and i.published_at is not null
  limit 1;
$$;

revoke all on function public.get_guest_invite(text) from public;
grant execute on function public.get_guest_invite(text) to anon, authenticated;

-- =======================================================================
-- 10. submit_guest_rsvp() — the ONE anonymous-reachable guest write.
--     Generic failure ('unavailable') for every rejection reason alike —
--     bad token, revoked/inactive, unpublished invitation, over-limit
--     attendee count, unknown schedule entry id — never a distinguishing
--     message, same posture as submit_review_approval()/
--     submit_review_changes() (Stage 9).
--
--     Contradictory-state prevention: a 'declined' status always forces
--     attendee_count/plus_one_name to null/0 server-side, regardless of
--     what the caller sent — never trusts the client to have zeroed
--     these out correctly. event_attendance entries are individually
--     checked against the invitation's OWN current composition schedule
--     entries (never an arbitrary caller-supplied id), and the whole
--     array is bounded to the same 12-entry limit the table constraint
--     enforces.
--
--     Single guarded UPDATE (WHERE guest_id = ... and is_active and
--     invite published) makes this transactional and race-safe the same
--     way submit_review_approval()'s guarded UPDATE is: two near-
--     simultaneous submissions serialize on Postgres row locking, never
--     producing a half-applied row.
--
--     Audits status/attendee_count only — never dietary_notes or
--     plus_one_name (free text), matching "audit safe events without
--     copying sensitive free text".
-- =======================================================================

create or replace function public.submit_guest_rsvp(
  p_token text,
  p_status text,
  p_attendee_count integer,
  p_plus_one_name text default null,
  p_dietary_notes text default null,
  p_event_attendance jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_invite_id uuid;
  v_permitted integer;
  v_allow_plus_one boolean;
  v_composition jsonb;
  v_valid_entry_ids text[];
  v_entry jsonb;
  v_final_count integer;
  v_final_plus_one text;
begin
  if p_status not in ('attending', 'declined') then
    return 'unavailable';
  end if;

  if p_event_attendance is null or jsonb_typeof(p_event_attendance) <> 'array' or jsonb_array_length(p_event_attendance) > 12 then
    return 'unavailable';
  end if;

  if p_dietary_notes is not null and char_length(p_dietary_notes) > 500 then
    return 'unavailable';
  end if;

  select g.id, g.invite_id, g.permitted_attendees, g.allow_plus_one, i.composition
  into v_guest_id, v_invite_id, v_permitted, v_allow_plus_one, v_composition
  from public.invite_guest_links l
  join public.invite_guests g on g.id = l.guest_id
  join public.invites i on i.id = g.invite_id
  where l.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and l.revoked_at is null
    and g.is_active
    and i.published_at is not null
  limit 1;

  if v_guest_id is null then
    return 'unavailable';
  end if;

  if p_status = 'declined' then
    v_final_count := 0;
    v_final_plus_one := null;
  else
    if p_attendee_count is null or p_attendee_count < 1 or p_attendee_count > v_permitted then
      return 'unavailable';
    end if;
    v_final_count := p_attendee_count;
    v_final_plus_one := nullif(trim(coalesce(p_plus_one_name, '')), '');
    if v_final_plus_one is not null and (not v_allow_plus_one or char_length(v_final_plus_one) > 120) then
      return 'unavailable';
    end if;
  end if;

  -- Every schedule-entry id the guest submitted attendance for must be a
  -- REAL entry in the invitation's own current composition — never an
  -- arbitrary caller-supplied string. An invitation with no composition
  -- (or no schedule section) accepts no event-level entries at all.
  select coalesce(array_agg(entries.value ->> 'id'), array[]::text[])
  into v_valid_entry_ids
  from jsonb_array_elements(coalesce(v_composition -> 'sections', '[]'::jsonb)) as sections(value)
  cross join lateral jsonb_array_elements(
    case when sections.value ->> 'type' = 'schedule' then sections.value -> 'data' -> 'entries' else '[]'::jsonb end
  ) as entries(value);

  for v_entry in select * from jsonb_array_elements(p_event_attendance)
  loop
    if jsonb_typeof(v_entry -> 'scheduleEntryId') <> 'string' or jsonb_typeof(v_entry -> 'attending') <> 'boolean' then
      return 'unavailable';
    end if;
    if not ((v_entry ->> 'scheduleEntryId') = any(v_valid_entry_ids)) then
      return 'unavailable';
    end if;
  end loop;

  update public.invite_guests
  set rsvp_status = p_status,
      attendee_count = v_final_count,
      plus_one_name = v_final_plus_one,
      dietary_notes = nullif(trim(coalesce(p_dietary_notes, '')), ''),
      event_attendance = p_event_attendance,
      responded_at = now(),
      updated_at = now()
  where id = v_guest_id and is_active
  and exists (select 1 from public.invites i where i.id = v_invite_id and i.published_at is not null);

  if not found then
    return 'unavailable';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (null, 'guest_rsvp_submitted', 'invite_guests', v_guest_id, jsonb_build_object('invite_id', v_invite_id, 'status', p_status, 'attendee_count', v_final_count));

  return 'ok';
end;
$$;

revoke all on function public.submit_guest_rsvp(text, text, integer, text, text, jsonb) from public;
grant execute on function public.submit_guest_rsvp(text, text, integer, text, text, jsonb) to anon, authenticated;
