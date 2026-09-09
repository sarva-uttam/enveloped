-- Enveloped — base invitation schema (genesis state).
--
-- RECONSTRUCTED, not original. This file did not exist in the repository
-- before Stage 0 of the browser-generator-v2 rebuild (2026-09-09). It was
-- built by read-only inspection of the live Supabase project
-- (ravfwnqfxngphncuyyxo) — information_schema/pg_catalog column, constraint,
-- and index definitions, plus this repo's own migration history, which
-- already documents this genesis state indirectly (see the `drop policy if
-- exists "invites public read"` etc. lines in
-- 20260901114159_auth_ownership.sql, which only make sense if these exact
-- policies existed first). No application changes are made by adding this
-- file — `schema_migrations` on the live project already records this
-- version (20260825050021, name `enveloped_invites_schema`) as applied; this
-- file lets the repository describe what's already there.
--
-- Confidence: HIGH for table/column/constraint/index shape (directly
-- queried from the live database's current — unaltered-since-genesis —
-- state for invite_guests/invite_rsvps, and from ordinal-position
-- back-inference for invites' first 8 columns). MEDIUM for the exact
-- original RLS policy names/predicates below: reconstructed from the
-- `drop policy if exists "..."` statements in the auth_ownership migration
-- (which name every policy this migration is inferred to have created) and
-- from PROJECT_STATUS.md/REVIEW_BRIEF.md's own prose description of the
-- original state ("fully-public RLS ... `using (true)` unconditionally").
-- One dropped policy name, "invites public read published", is NOT
-- recreated here — per PROJECT_STATUS.md's "Round 2/3" narrative it was an
-- intermediate draft policy (`paid = true OR auth.uid() = owner_id`)
-- created and superseded within the auth_ownership migration's own working
-- history, never a separately recorded `schema_migrations` version — so
-- there is no genesis-state version of this file where it belongs.

create extension if not exists pgcrypto;

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

alter table invites enable row level security;
alter table invite_guests enable row level security;
alter table invite_rsvps enable row level security;

-- Original, fully-public policies — genesis state, later replaced entirely
-- by the ownership-scoped policies in 20260901114159_auth_ownership.sql.
-- `using (true)` / `with check (true)` meant any caller (including
-- anonymous) could read or write any row in any of these three tables.
-- This is the exact state PROJECT_STATUS.md's "Auth & ownership
-- foundation" section describes as the pre-fix condition — reconstructed
-- here only so the migration history has a real starting point; it was
-- never safe and should never be reapplied.
create policy "invites public read" on invites for select using (true);
create policy "invites public insert" on invites for insert with check (true);
create policy "invites public update" on invites for update using (true) with check (true);

create policy "invite_guests public read" on invite_guests for select using (true);
create policy "invite_guests public insert" on invite_guests for insert with check (true);
create policy "invite_guests public update" on invite_guests for update using (true) with check (true);

create policy "invite_rsvps public read" on invite_rsvps for select using (true);
create policy "invite_rsvps public insert" on invite_rsvps for insert with check (true);
