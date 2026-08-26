-- Enveloped — persistence schema.
-- Base tables already applied to the connected Supabase project
-- (ravfwnqfxngphncuyyxo). The `paid` / `paypal_order_id` columns and the
-- "invites public update" policy below are NOT applied yet — run the
-- "-- Payment gating migration" block at the bottom against that project
-- (SQL editor or `supabase db execute`) before the PayPal flow will work.
-- Kept here so the schema is reproducible / reviewable in source control.

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

-- MVP policies: fully public read/write, no auth yet. Tighten before a real
-- public launch — e.g. scope invite/guest writes to a server action using
-- the service role, and/or add Supabase Auth and scope by an owner_id
-- column so one couple can't edit or read another's invite.
create policy "invites public read" on invites for select using (true);
create policy "invites public insert" on invites for insert with check (true);
create policy "invites public update" on invites for update using (true) with check (true);

create policy "invite_guests public read" on invite_guests for select using (true);
create policy "invite_guests public insert" on invite_guests for insert with check (true);
create policy "invite_guests public update" on invite_guests for update using (true) with check (true);

create policy "invite_rsvps public read" on invite_rsvps for select using (true);
create policy "invite_rsvps public insert" on invite_rsvps for insert with check (true);

-- Payment gating migration — run this against the already-provisioned
-- project to bring it up to date with the two table changes above.
alter table invites add column if not exists paid boolean not null default false;
alter table invites add column if not exists paypal_order_id text;
drop policy if exists "invites public update" on invites;
create policy "invites public update" on invites for update using (true) with check (true);
