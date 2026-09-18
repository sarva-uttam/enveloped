-- Stage 8 — concierge request management and structured admin
-- invitation generator.
--
-- Forward-only. Extends, rather than duplicates, everything Stage 2/5/6
-- already built: is_admin() (unchanged), admin_save_invite_composition()
-- (signature extended, same authorization/validation shape),
-- publish_invite()/unpublish_invite() (untouched, just linked from the
-- new admin UI), the preview-link RPCs (untouched). Nothing here alters
-- public/preview visibility, payment state, or any guest-facing RPC.
--
-- NOT applied to the live project — verified only against the local
-- Supabase stack, same as every migration since Stage 2.

-- =======================================================================
-- 1. requests.status — the consultation-led vocabulary.
--
-- The table recovered in 20260905073155_requests_and_templates.sql
-- carries an earlier, self-service-flavored pipeline
-- (new/contacted/quoted/awaiting_payment/paid/in_progress/delivered/
-- archived) that conflates payment into the request's own status —
-- exactly the kind of coupling Stage 3 already corrected for invitations
-- themselves (`published_at`, not `paid`, is the sole publication gate).
-- This section makes the same correction for requests: a stable set of
-- CONSULTATION-STAGE identifiers that says nothing about money (payment,
-- if any, is agreed and tracked outside the application per the
-- business model — see README.md's "Product direction").
--
-- Any existing row is remapped, not dropped or left violating the new
-- constraint — safe to run against a database that already has requests
-- in the old vocabulary (there are none in the local stack today, but a
-- forward-only migration should not assume that):
--   new             -> new             (unchanged)
--   contacted       -> contacted       (unchanged)
--   quoted          -> consultation    (a price was discussed; still pre-commitment)
--   awaiting_payment-> accepted        (client has committed to proceed)
--   paid            -> accepted        (payment is no longer a status value at all)
--   in_progress     -> in_production   (clearer verb, matches the generator work itself)
--   delivered       -> completed
--   archived        -> archived        (unchanged)
-- =======================================================================

alter table requests drop constraint if exists requests_status_check;

update requests set status = 'consultation' where status = 'quoted';
update requests set status = 'accepted' where status in ('awaiting_payment', 'paid');
update requests set status = 'in_production' where status = 'in_progress';
update requests set status = 'completed' where status = 'delivered';

alter table requests add constraint requests_status_check
  check (status in ('new', 'contacted', 'consultation', 'accepted', 'in_production', 'preview_sent', 'completed', 'declined', 'archived'));

alter table requests add column if not exists status_changed_at timestamptz not null default now();

comment on column requests.status is
  'Stable machine identifier for the consultation pipeline — see src/lib/requests.ts for human labels and the allowed-transition graph mirrored in TypeScript for client-side UX. Never a payment state.';

-- =======================================================================
-- 2. admin_audit_log — a durable, admin-read-only record of the
--    generator's sensitive actions (Part G: "record an administrative
--    audit event for invitation creation, pack selection, composition
--    save, request association, request-status change").
--
--    Same posture as invite_previews (20260910120000): RLS enabled, one
--    admin-only SELECT policy for a future audit-viewing UI, and NO
--    insert/update/delete policy for any client role at all — every row
--    is written exclusively by the SECURITY DEFINER functions below,
--    which run as this migration's owning role and are therefore
--    unaffected by RLS regardless of policy (the same mechanism that
--    already lets admin_create_invite_preview() write to a table with
--    zero INSERT policy).
--
--    `detail` is a small, deliberately-bounded jsonb payload — NEVER a
--    raw preview token (nothing below ever passes one in), never a full
--    composition document (only small identifying fields: pack id,
--    section count, old/new status). This table has no DELETE path from
--    any function — an audit log that could be quietly edited or trimmed
--    by the same role it's supposed to hold accountable is not a useful
--    audit log.
-- =======================================================================

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx on admin_audit_log (target_table, target_id);
create index if not exists admin_audit_log_created_at_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;

create policy "admin_audit_log admin select" on admin_audit_log for select using (public.is_admin());

-- =======================================================================
-- 3. Request status transitions — validated AND audited independent of
--    which client path triggers the update (the existing "requests admin
--    update" RLS policy from 20260909120000_admin_identity.sql already
--    lets an administrator's own ordinary client issue a raw PostgREST
--    UPDATE; without this trigger that update could set ANY status value
--    the CHECK constraint allows, in any order, with no record of the
--    change — closing that gap here is the same "structural guarantee,
--    not just an application-layer check" this project has used
--    throughout, e.g. reject_client_paid_update()).
--
-- is_valid_request_status_transition() is a pure lookup against a fixed
-- allowlist of (from, to) pairs — deliberately NOT "any forward status
-- greater than the current one" (there is no natural total order here)
-- and NOT "anything goes" (Part B: "invalid status transitions fail").
-- The graph:
--   new            -> contacted, declined
--   contacted      -> consultation, declined
--   consultation   -> accepted, declined
--   accepted       -> in_production, declined
--   in_production  -> preview_sent, declined
--   preview_sent   -> in_production (sent back for revisions), completed, declined
--   completed      -> archived
--   declined       -> archived
--   (archived is terminal — nothing transitions OUT of it)
-- A status "changing" to its own current value is not a transition at
-- all (short-circuited before this function is even consulted) — an
-- administrator re-saving the same status is a no-op, not an error.
-- =======================================================================

create or replace function public.is_valid_request_status_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('new', 'contacted'), ('new', 'declined'),
    ('contacted', 'consultation'), ('contacted', 'declined'),
    ('consultation', 'accepted'), ('consultation', 'declined'),
    ('accepted', 'in_production'), ('accepted', 'declined'),
    ('in_production', 'preview_sent'), ('in_production', 'declined'),
    ('preview_sent', 'in_production'), ('preview_sent', 'completed'), ('preview_sent', 'declined'),
    ('completed', 'archived'),
    ('declined', 'archived')
  );
$$;

create or replace function public.enforce_request_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
      raise exception 'only an administrator may change a request''s status';
    end if;

    if not public.is_valid_request_status_transition(old.status, new.status) then
      raise exception 'invalid request status transition: % -> %', old.status, new.status;
    end if;

    new.status_changed_at := now();
    new.updated_at := now();

    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (
      auth.uid(),
      'request_status_change',
      'requests',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists requests_enforce_status_transition on requests;
create trigger requests_enforce_status_transition
  before update on requests
  for each row
  execute function public.enforce_request_status_transition();

-- =======================================================================
-- 4. invites — admin-only SELECT. Deliberately read-only: every WRITE an
--    administrator makes to an invitation continues to go through a
--    dedicated SECURITY DEFINER function (admin_save_invite_composition(),
--    admin_create_invitation_from_request() below, publish_invite()/
--    unpublish_invite()) — never a general admin UPDATE policy, which
--    would let a raw PostgREST PATCH touch columns none of those
--    functions (or reject_client_paid_update()'s trigger) specifically
--    protect (owner_id, tier, category, request_id, ...). "Use minimal
--    grants" applied literally: read access for the admin UI to list and
--    inspect invitations, nothing more than that from this policy alone.
-- =======================================================================

create policy "invites admin select" on invites for select using (public.is_admin());

-- =======================================================================
-- 5. composition_revision — optimistic concurrency for
--    admin_save_invite_composition() (Part G: "add a revision field ...
--    if two tabs edit the same invitation, a stale save must not
--    silently overwrite newer work").
--
-- admin_save_invite_composition() is replaced (drop + recreate — adding
-- a parameter changes the function's signature, the same SQLSTATE 42P13
-- lesson as every other signature change in this project's migrations)
-- to take p_expected_revision and only apply the update when the row's
-- CURRENT revision still matches what the caller last read — a classic
-- compare-and-swap. Returns one of three outcomes as text rather than a
-- plain boolean, because "the invitation doesn't exist" and "someone
-- else already saved a newer revision" need different messages in the
-- admin UI (Part G: "clear success or failure feedback"):
--   'ok'        — updated; composition_revision is now p_expected_revision + 1
--   'stale'     — the row exists, but its revision had already moved on
--   'not-found' — no invitation with that id exists at all
-- =======================================================================

alter table invites add column if not exists composition_revision integer not null default 0;

drop function if exists admin_save_invite_composition(uuid, jsonb, text, text);

create or replace function public.admin_save_invite_composition(
  p_invite_id uuid,
  p_composition jsonb,
  p_expected_revision integer,
  p_occasion text default null,
  p_occasion_custom_label text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may save an invitation composition';
  end if;

  if p_occasion is not null and not exists (select 1 from public.event_types e where e.id = p_occasion) then
    raise exception 'unknown event type: %', p_occasion;
  end if;

  perform set_config('enveloped.composition_action', 'granted', true);

  update public.invites
  set composition = p_composition,
      occasion = p_occasion,
      occasion_custom_label = p_occasion_custom_label,
      composition_revision = composition_revision + 1,
      updated_at = now()
  where id = p_invite_id and composition_revision = p_expected_revision;

  if found then
    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'composition_save', 'invites', p_invite_id, jsonb_build_object('new_revision', p_expected_revision + 1));
    return 'ok';
  end if;

  select exists (select 1 from public.invites where id = p_invite_id) into v_exists;
  if v_exists then
    return 'stale';
  else
    return 'not-found';
  end if;
end;
$$;

revoke all on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) from public;
grant execute on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) to authenticated;
revoke execute on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) from anon;

-- =======================================================================
-- 6. admin_create_invitation_from_request() — the ONE sanctioned way a
--    concierge invitation is ever created from a client request.
--
-- A partial unique index makes "one invitation per request" a structural
-- guarantee (the same shape as invite_previews' invite_id primary key),
-- not merely a check this function happens to also perform — a
-- concurrent double-click cannot slip past a plain SELECT-then-INSERT
-- race the way it could without one.
--
-- Sets generator_kind = 'concierge' unconditionally — this is what makes
-- get_published_invite()'s existing "generator-aware" branch (Stage 3)
-- gate this invitation's visibility on published_at alone, never on
-- `paid` (which stays false, untouched, exactly matching Part C: "never
-- mark the invitation as paid automatically"). Never sets published_at,
-- paid, paypal_order_id, or owner_id (an admin-created invitation starts
-- with no client account attached — the same "owner_id may be null"
-- shape 20260901114159_auth_ownership.sql already established for
-- pre-auth legacy invitations). p_composition/p_occasion are optional —
-- when supplied, they are the CALLER's already-validated pack-based
-- draft (src/lib/composition-admin.server.ts's buildCompositionFromPack()
-- + validateComposition(), run BEFORE this function is ever invoked,
-- identical ordering to saveInviteComposition()); this function does not
-- itself validate composition shape, only the occasion FK, same division
-- of responsibility as admin_save_invite_composition().
-- =======================================================================

create unique index if not exists invites_request_id_unique_idx on invites (request_id) where request_id is not null;

create or replace function public.admin_create_invitation_from_request(
  p_request_id uuid,
  p_slug text,
  p_category text,
  p_tier text,
  p_composition jsonb default null,
  p_occasion text default null,
  p_occasion_custom_label text default null
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
    raise exception 'only an administrator may create an invitation from a request';
  end if;

  if not exists (select 1 from public.requests r where r.id = p_request_id) then
    raise exception 'request not found';
  end if;

  if exists (select 1 from public.invites i where i.request_id = p_request_id) then
    raise exception 'this request already has an invitation';
  end if;

  if p_occasion is not null and not exists (select 1 from public.event_types e where e.id = p_occasion) then
    raise exception 'unknown event type: %', p_occasion;
  end if;

  perform set_config('enveloped.composition_action', 'granted', true);

  insert into public.invites (
    slug, category, tier, answers, content,
    request_id, generator_kind, created_by_admin_id, owner_id,
    composition, occasion, occasion_custom_label
  ) values (
    p_slug, p_category, p_tier, '{}'::jsonb,
    jsonb_build_object(
      'headline', 'New invitation',
      'subheadline', '',
      'welcomeMessage', '',
      'eventDetails', '[]'::jsonb,
      'closingLine', '',
      'suggestedPalette', '[]'::jsonb
    ),
    p_request_id, 'concierge', auth.uid(), null, -- owner_id: explicit null overrides invites.owner_id's `default auth.uid()` (20260901114159), which would otherwise attribute the row to the calling admin
    p_composition, p_occasion, p_occasion_custom_label
  )
  returning id into v_new_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(),
    'invitation_created_from_request',
    'invites',
    v_new_id,
    jsonb_build_object('request_id', p_request_id, 'pack_id', p_composition ->> 'designPackId')
  );

  return v_new_id;
exception
  when unique_violation then
    raise exception 'this request already has an invitation';
end;
$$;

revoke all on function public.admin_create_invitation_from_request(uuid, text, text, text, jsonb, text, text) from public;
grant execute on function public.admin_create_invitation_from_request(uuid, text, text, text, jsonb, text, text) to authenticated;
revoke execute on function public.admin_create_invitation_from_request(uuid, text, text, text, jsonb, text, text) from anon;

-- Note: `answers`/`content` above are minimal, valid-shaped placeholders
-- satisfying the NOT NULL constraints on both columns — a concierge
-- invitation's real content lives entirely in `composition`, authored
-- through the structured generator, never derived from these two
-- columns (resolveComposition() only ever falls back to the legacy
-- `content` adapter when `composition` is null/undefined — see
-- src/lib/composition/resolve.ts, untouched by this migration). `answers`
-- is deliberately `{}` — request.notes/internal_notes/email/phone are
-- NEVER copied into any invites column by this function (Part C: "never
-- copy private survey answers into public composition output").
