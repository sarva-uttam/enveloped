-- Enveloped — schema reference snapshot.
--
-- GENERATED, READ-ONLY REFERENCE. Do not hand-edit. Do not apply this file
-- directly — it is not a migration and has no version. The authoritative,
-- versioned source of truth is supabase/migrations/*.sql; see
-- supabase/migrations/README.md for the workflow and the exact
-- provenance/confidence of every migration currently in that directory.
-- Statements below are ordered to match real dependency/chronological
-- order (each `invites` column batch appears next to the migration that
-- added it, via `alter table`, exactly as it happened live) rather than
-- collapsed into one `create table invites (...)` block — a collapsed
-- block would forward-reference `requests` before it exists.
--
-- This snapshot was regenerated on 2026-09-09 (Stage 0 of the
-- browser-generator-v2 rebuild) from a read-only introspection of the live
-- Supabase project `ravfwnqfxngphncuyyxo` — every table, column (with
-- exact ordinal position), constraint, index, function body, and trigger
-- below was cross-checked against `information_schema`/`pg_catalog` and
-- matches exactly. The previous version of this file was materially
-- stale: it predated the three 2026-09-05 migrations entirely (no
-- `requests`, `templates`, `invite_payment_records`, or any generator-
-- related `invites` column), and its own header claimed all migrations
-- were "NOT applied yet" when in fact the auth_ownership and
-- payment_integrity migrations had been live since 2026-09-01. Neither
-- claim is true of this version.
--
-- Extensions actually in use: pgcrypto (gen_random_uuid()). The live
-- project also has pg_stat_statements, uuid-ossp, plpgsql, and
-- supabase_vault installed — none of those are used by anything below;
-- they are Supabase platform defaults, not part of this project's schema,
-- and are intentionally omitted here.
--
-- Also intentionally omitted: `public.rls_auto_enable()` and its
-- `ensure_rls` event trigger, confirmed live. This is Supabase
-- platform-provided infrastructure (it auto-enables RLS on any newly
-- created table in `public`) — it was not authored by, and is not part
-- of, this project's own migrations, so it has no corresponding file in
-- supabase/migrations/ and is not reproduced here.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 20260825050021_enveloped_invites_schema (genesis)
-- ---------------------------------------------------------------------

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  answers jsonb not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invite_guests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites (id) on delete cascade,
  name text not null,
  slug text not null,
  click_teaser text not null,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (invite_id, slug)
);

create table if not exists invite_rsvps (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites (id) on delete cascade,
  guest_id uuid references invite_guests (id) on delete set null,
  name text not null,
  status text not null check (status in ('yes', 'no')),
  created_at timestamptz not null default now()
);

create index if not exists invite_guests_invite_id_idx on invite_guests (invite_id);
create index if not exists invite_rsvps_invite_id_idx on invite_rsvps (invite_id);
create unique index if not exists invites_slug_idx on invites (slug);

-- ---------------------------------------------------------------------
-- 20260901114121_payment_gating
-- ---------------------------------------------------------------------

alter table invites add column if not exists paid boolean not null default false;
alter table invites add column if not exists paypal_order_id text;

-- ---------------------------------------------------------------------
-- 20260901114159_auth_ownership
-- ---------------------------------------------------------------------

alter table invites add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

create index if not exists invites_owner_id_idx on invites (owner_id);

alter table invites enable row level security;
alter table invite_guests enable row level security;
alter table invite_rsvps enable row level security;

-- invites — owner-only. No public read policy exists at all; every
-- non-owner read goes through get_published_invite() below instead,
-- because RLS is row-level and `answers` (raw survey input, including the
-- host's plain-text guest list) needed column-level protection.
create policy "invites owner read own" on invites for select using (auth.uid() = owner_id);
create policy "invites owner insert" on invites for insert with check (auth.uid() = owner_id);
create policy "invites owner update" on invites for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "invites owner delete" on invites for delete using (auth.uid() = owner_id);

-- invite_guests — owner-only. Guests reach their own row only through
-- resolve_invite_guest() below, never a direct table read.
create policy "invite_guests owner read" on invite_guests for select
  using (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));
create policy "invite_guests owner insert" on invite_guests for insert
  with check (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));
create policy "invite_guests owner update" on invite_guests for update
  using (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id))
  with check (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));

-- invite_rsvps — read is owner-only. Insert is NOT unconditional: it
-- delegates to can_insert_rsvp() (a SECURITY DEFINER function — an RLS
-- policy's own inline subqueries are themselves subject to RLS on
-- whatever they touch, which would make an anonymous caller's subquery
-- see zero rows and reject every legitimate RSVP; see
-- 20260901114159_auth_ownership.sql's comment on this policy for the
-- full history of that specific bug and fix).
create policy "invite_rsvps owner read" on invite_rsvps for select
  using (auth.uid() = (select owner_id from invites where invites.id = invite_rsvps.invite_id));

create or replace function can_insert_rsvp(p_invite_id uuid, p_guest_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.invites i
    where i.id = p_invite_id and i.paid = true
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

create policy "invite_rsvps insert on published invite" on invite_rsvps for insert
  with check (can_insert_rsvp(invite_rsvps.invite_id, invite_rsvps.guest_id));

-- Narrow, unauthenticated guest lookup — the ONE matching guest's public
-- fields for an exact (invite slug, guest slug) pair, on a PAID invite
-- only, never the full list.
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
  where i.slug = p_invite_slug and g.slug = p_guest_slug and i.paid = true
  limit 1;
$$;

revoke all on function resolve_invite_guest(text, text) from public;
grant execute on function resolve_invite_guest(text, text) to anon, authenticated;

-- Sanitized public invite read — replaced in full by
-- 20260905091530_generator_payment_publish_split below (which changes
-- its return columns and guard condition); this first version is shown
-- here only for historical completeness of what auth_ownership created.
-- The version actually live today is the one further down this file.
create or replace function get_published_invite(p_slug text)
returns table (
  id uuid,
  slug text,
  paid boolean,
  tier text,
  content jsonb,
  event_date text,
  song text
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
    case when i.paid then i.tier end as tier,
    case when i.paid then i.content end as content,
    case when i.paid then i.answers ->> 'eventDate' end as event_date,
    case when i.paid then i.answers ->> 'song' end as song
  from public.invites i
  where i.slug = p_slug
  limit 1;
$$;

revoke all on function get_published_invite(text) from public;
grant execute on function get_published_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 20260901114212_payment_integrity
-- ---------------------------------------------------------------------

-- payments — one row per PayPal order attempt against an invitation.
-- Never written by the browser: RLS is owner-read-only with NO
-- insert/update/delete policy for anon/authenticated at all.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invites (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'paypal',
  provider_order_id text not null,
  provider_capture_id text,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  expected_amount numeric(10, 2) not null check (expected_amount > 0),
  captured_amount numeric(10, 2),
  currency text not null default 'USD',
  status text not null default 'created'
    check (status in ('created', 'processing', 'captured', 'failed')),
  idempotency_key uuid not null default gen_random_uuid(),
  raw_capture_response jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);

create index if not exists payments_invitation_id_idx on payments (invitation_id);
create index if not exists payments_owner_id_idx on payments (owner_id);
create index if not exists payments_invitation_status_idx on payments (invitation_id, status);

alter table payments enable row level security;

create policy "payments owner read own" on payments for select using (auth.uid() = owner_id);

-- Prevents an owner from setting paid/paypal_order_id directly on their
-- own invite via the client SDK — only the service-role client
-- (markInvitePaid(), src/lib/storage.server.ts) may change these two
-- columns.
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
  return new;
end;
$$;

drop trigger if exists invites_reject_client_paid_update on invites;
create trigger invites_reject_client_paid_update
  before update on invites
  for each row
  execute function public.reject_client_paid_update();

-- ---------------------------------------------------------------------
-- 20260905073155_requests_and_templates
-- ---------------------------------------------------------------------

-- requests — a concierge intake record, captured before any invite
-- exists. `agreed_price`/`agreed_currency` exist so a concierge sale is
-- never tied to the fixed self-service TIERS pricing (src/lib/tiers.ts).
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'quoted', 'awaiting_payment', 'paid', 'in_progress', 'delivered', 'archived')),
  name text not null,
  email text,
  phone text,
  preferred_channel text not null default 'whatsapp'
    check (preferred_channel in ('whatsapp', 'email', 'instagram')),
  category text not null
    check (category in ('wedding-hindu', 'wedding-christian', 'wedding-muslim', 'wedding-other', 'holiday', 'vacation', 'hotel-package', 'birthday', 'other')),
  event_date date,
  tier_interest text check (tier_interest in ('bronze', 'silver', 'gold', 'platinum')),
  notes text,
  -- KNOWN LIMITATION, not the permanent domain model: this vocabulary is
  -- Hindu-wedding-specific. Product direction is general events through
  -- reusable cultural packs, weddings primary but not exclusive — this
  -- fixed enum is reproduced as-is from the live database, not corrected.
  requested_occasions text[] not null default '{}'
    check (requested_occasions <@ array['haldi', 'sangeet_mehendi', 'wedding_day', 'reception']),
  agreed_price numeric(10, 2) check (agreed_price is null or agreed_price > 0),
  agreed_currency text not null default 'USD',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists requests_reference_code_idx on requests (reference_code);
create index if not exists requests_status_idx on requests (status);

-- templates — a catalogue of reusable design templates a generator can
-- select from, rather than free-generating markup.
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null
    check (category in ('wedding-hindu', 'wedding-christian', 'wedding-muslim', 'wedding-other', 'holiday', 'vacation', 'hotel-package', 'birthday', 'other')),
  occasion text
    check (occasion is null or occasion in ('haldi', 'sangeet_mehendi', 'wedding_day', 'reception')),
  min_tier text not null default 'bronze' check (min_tier in ('bronze', 'silver', 'gold', 'platinum')),
  style_tags text[] not null default '{}',
  palette text[] not null default '{}',
  font_pairing text,
  layout_component text not null,
  animation_preset text,
  music_allowed boolean not null default true,
  thumbnail_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_category_idx on templates (category);
create index if not exists templates_occasion_idx on templates (occasion);
create index if not exists templates_status_idx on templates (status);

alter table invites add column if not exists request_id uuid references requests (id) on delete set null;
create index if not exists invites_request_id_idx on invites (request_id);

alter table requests enable row level security;
alter table templates enable row level security;

-- No RLS policy on requests/templates — confirmed live: RLS enabled,
-- zero policies on both, which Postgres treats as deny-all for every
-- role except service_role. Not added here; see PROJECT_STATUS.md.

-- ---------------------------------------------------------------------
-- 20260905084115_generator_composition
-- ---------------------------------------------------------------------

alter table invites add column if not exists occasion text;
alter table invites add constraint invites_occasion_check
  check (occasion is null or occasion in ('haldi', 'sangeet_mehendi', 'wedding_day', 'reception'));

alter table invites add column if not exists generator_kind text;
alter table invites add column if not exists design_spec jsonb;
alter table invites add column if not exists generator_content jsonb;
alter table invites add column if not exists composition jsonb;

-- ---------------------------------------------------------------------
-- 20260905091530_generator_payment_publish_split
-- ---------------------------------------------------------------------

alter table invites add column if not exists published_at timestamptz;
comment on column invites.published_at is
  'Explicit admin publish timestamp for a Generator-produced invite (generator_kind is not null). Null = not yet published. Not consulted for the self-serve flow, where paid alone gates visibility.';

alter table invites add column if not exists created_by_admin_id uuid references auth.users (id) on delete set null;
comment on column invites.created_by_admin_id is
  'Which admin account ran the Generator for this invite (invites.server.ts generateHinduInvite). Distinct from owner_id, which stays null for every concierge-created invite.';

-- invite_payment_records — a ledger for payments taken outside PayPal
-- (cash, bank transfer, mobile money, or a manually-recorded PayPal
-- payment). The concierge-payment counterpart to `payments`.
create table if not exists invite_payment_records (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites (id) on delete cascade,
  method text not null check (method in ('cash', 'bank_transfer', 'mobile_money', 'paypal_manual', 'other')),
  reference_note text not null,
  recorded_by uuid not null references auth.users (id),
  recorded_at timestamptz not null default now()
);

create index if not exists invite_payment_records_invite_id_idx on invite_payment_records (invite_id);

alter table invite_payment_records enable row level security;

-- No RLS policy here either — same deny-all reasoning as requests/templates.

-- Replaces get_published_invite() above with the version actually live
-- today — adds generator_kind/generator_content/composition, and changes
-- every generator-aware column's guard from `i.paid` alone to
-- `i.paid and (i.generator_kind is null or i.published_at is not null)`.
--
-- KNOWN LIMITATION, live today, NOT fixed by this snapshot: despite this
-- migration's name, `i.paid` is still a hard, unconditional AND on every
-- branch below. `published_at` only ever narrows visibility further for
-- a generator invite; it never substitutes for `paid`. A concierge
-- invite the admin has approved and published, but that has not been
-- paid through PayPal, is exactly as invisible to guests as an
-- unpublished one — the publication/payment separation the
-- concierge-first product direction requires does not yet exist at the
-- database level. `resolve_invite_guest()` and `can_insert_rsvp()` above
-- still gate on `i.paid = true` alone and have no awareness of
-- `published_at` at all. See PROJECT_STATUS.md for the full account and
-- the recommended Stage 1+ fix. This snapshot describes current live
-- behavior exactly; it does not correct it.
create or replace function get_published_invite(p_slug text)
returns table (
  id uuid,
  slug text,
  paid boolean,
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
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.tier end as tier,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.content end as content,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.answers ->> 'eventDate' end as event_date,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.answers ->> 'song' end as song,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.generator_kind end as generator_kind,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.generator_content end as generator_content,
    case when i.paid and (i.generator_kind is null or i.published_at is not null) then i.composition end as composition
  from public.invites i
  where i.slug = p_slug
  limit 1;
$$;

revoke all on function get_published_invite(text) from public;
grant execute on function get_published_invite(text) to anon, authenticated;
