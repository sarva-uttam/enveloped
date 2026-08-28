-- Enveloped — persistence schema.
--
-- This file is a human-readable snapshot of the FULL desired end-state
-- schema, kept for reproducibility/review. supabase/migrations/*.sql is
-- the authoritative, versioned, ordered source of truth for what to
-- actually run — apply migrations in filename order, not by copying
-- chunks out of this file.
--
-- Base tables (invites/invite_guests/invite_rsvps) are already applied to
-- the connected Supabase project (ravfwnqfxngphncuyyxo). Two migrations
-- are NOT applied there yet — see PROJECT_STATUS.md for exact steps:
--   1. "Payment gating migration" (bottom of this file) — paid /
--      paypal_order_id columns.
--   2. supabase/migrations/20260828000000_auth_ownership.sql — owner_id,
--      the ownership-scoped RLS policies below, and resolve_invite_guest().
-- The policies shown below already reflect BOTH migrations applied — they
-- will NOT match the live project's actual policies until you run them.

create extension if not exists pgcrypto;

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  answers jsonb not null,
  content jsonb not null,
  paid boolean not null default false,
  paypal_order_id text,
  -- References the Supabase Auth user who created this invite. Nullable
  -- because rows created before auth existed have no owner — see
  -- supabase/migrations/20260828000000_auth_ownership.sql.
  owner_id uuid references auth.users (id) on delete cascade default auth.uid(),
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
create index if not exists invites_owner_id_idx on invites (owner_id);

alter table invites enable row level security;
alter table invite_guests enable row level security;
alter table invite_rsvps enable row level security;

-- Ownership-scoped policies (as of the auth_ownership migration). The
-- raw `invites` table has NO public read policy at all — RLS is
-- row-level, not column-level, and `answers` (raw survey input,
-- including the host's plain-text guest list) can't be selectively
-- hidden from a table-level policy. Every non-owner read goes through
-- get_published_invite() below instead, which hand-picks a minimal,
-- safe column set. Writes, the guest list, and RSVP reads stay
-- owner-only throughout, same as before.
create policy "invites owner read own" on invites for select using (auth.uid() = owner_id);
create policy "invites owner insert" on invites for insert with check (auth.uid() = owner_id);
create policy "invites owner update" on invites for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "invites owner delete" on invites for delete using (auth.uid() = owner_id);

create policy "invite_guests owner read" on invite_guests for select
  using (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));
create policy "invite_guests owner insert" on invite_guests for insert
  with check (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));
create policy "invite_guests owner update" on invite_guests for update
  using (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id))
  with check (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));

create policy "invite_rsvps owner read" on invite_rsvps for select
  using (auth.uid() = (select owner_id from invites where invites.id = invite_rsvps.invite_id));

-- Insert is NOT unconditional ("with check (true)") — the database
-- itself, not just the app's submitRsvp(), enforces that the invite is
-- paid and that a supplied guest_id actually belongs to the same
-- invite. See the migration's comment on this policy for the reasoning.
create policy "invite_rsvps insert on published invite" on invite_rsvps for insert
  with check (
    exists (select 1 from invites i where i.id = invite_rsvps.invite_id and i.paid = true)
    and (
      invite_rsvps.guest_id is null
      or exists (
        select 1 from invite_guests g
        where g.id = invite_rsvps.guest_id and g.invite_id = invite_rsvps.invite_id
      )
    )
  );

-- Narrow, unauthenticated guest lookup — returns only the ONE matching
-- guest's public fields for an exact (invite slug, guest slug) pair, on
-- a PAID invite only, never the full list. This is how a guest sees
-- their own personalized name/teaser without an account despite
-- invite_guests being owner-only above.
--
-- search_path = '' (empty) plus fully-qualified public.* table
-- references guard against search_path hijacking — see the migration's
-- comment on this function for the full reasoning.
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

-- Sanitized public invite read — the ONLY way a non-owner reads an
-- invite. Never selects answers.guestNames or any other raw survey
-- field except event_date/song (the two the UI actually renders for a
-- guest), never owner_id or paypal_order_id. content/tier/event_date/
-- song are NULL unless paid = true; id/slug/paid are always returned so
-- the app can tell "not found" from "found but not published yet".
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
-- Historical migrations below, preserved for reference. Both are still
-- pending against the live project — see PROJECT_STATUS.md.
-- ---------------------------------------------------------------------

-- Payment gating migration
alter table invites add column if not exists paid boolean not null default false;
alter table invites add column if not exists paypal_order_id text;

-- Auth & ownership migration — see
-- supabase/migrations/20260828000000_auth_ownership.sql for the runnable,
-- versioned copy of this (it's identical in substance to the policies
-- already shown above; duplicated there so it can be applied standalone
-- and tracked by filename/date).
