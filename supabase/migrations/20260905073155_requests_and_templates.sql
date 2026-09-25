-- Concierge intake + template catalogue foundation.
--
-- RECONSTRUCTED, not original. This migration was applied to the live
-- Supabase project (ravfwnqfxngphncuyyxo, schema_migrations version
-- 20260905073155, name `requests_and_templates`) on or before 2026-09-05,
-- almost certainly as part of an earlier "browser-generator v1" effort
-- referenced only by a live column comment on invites.created_by_admin_id
-- ("...invites.server.ts generateHinduInvite"). No copy of the original
-- migration script, or of `invites.server.ts`/`generateHinduInvite`
-- themselves, exists anywhere this Stage 0 reconciliation could find:
-- not in this repository's git history (any ref, reflog, stash, or
-- dangling object), not in any other local checkout of this project, and
-- not in any locally-retrievable Claude session transcript. See
-- PROJECT_STATUS.md's "Missing browser-generator-v1 source" section for
-- the full account of that search. This file — and the two migrations
-- that follow it — exist to describe what is verifiably live today, not
-- to reconstruct how it was built.
--
-- Built by read-only inspection of the live database on 2026-09-09:
-- information_schema/pg_catalog column, constraint, and index definitions
-- for `requests`/`templates`, plus the `invites.request_id` column and its
-- foreign key. Adding this file makes no application change — these
-- objects already exist live with exactly this shape.
--
-- Confidence: HIGH for every column/constraint/index below (all directly
-- queried from the live database's current state). MEDIUM for which of
-- the three 2026-09-05 migrations each object originally belonged to —
-- schema_migrations records three versions from that date but not their
-- individual statement bodies, so the grouping below (requests + templates
-- + the invites.request_id link, all under this migration's name) is
-- inferred from table/column purpose matching this migration's recorded
-- name, cross-checked against column ordinal position on `invites`
-- (request_id is invites' 12th column — immediately after owner_id from
-- the prior migration, before any generator-specific column).
--
-- `requests` — a concierge intake record: a prospective client's request,
-- captured before any invite exists, tracking the admin's own pipeline
-- (new -> contacted -> quoted -> awaiting_payment -> paid -> in_progress
-- -> delivered -> archived) and the price agreed with them off-platform.
-- `agreed_price`/`agreed_currency` exist specifically so a concierge sale
-- is not tied to the fixed self-service TIERS pricing (src/lib/tiers.ts).
--
-- `templates` — a catalogue of reusable design templates (layout
-- component, animation preset, palette, style tags), keyed loosely to
-- category/occasion/min_tier, that a generator can select from rather
-- than free-generating markup. Neither table has an RLS policy yet
-- (verified live: RLS is enabled with zero policies on both, which
-- Postgres treats as deny-all for every role except service_role — safe,
-- if inconvenient, until an admin access policy is added).

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
  -- Occasion vocabulary as recovered from the live database — see
  -- 20260905084115_generator_composition.sql's header for why this is
  -- Hindu-wedding-specific and not the permanent domain model.
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

-- No RLS policies are added here — verified live to have none (RLS
-- enabled, zero policies on both tables), which denies every operation to
-- anon/authenticated and leaves only the service-role client able to
-- read/write. This is deliberately preserved as-is by Stage 0 (no new
-- behavioral migration); an admin access policy is future work, not part
-- of this reconciliation.
