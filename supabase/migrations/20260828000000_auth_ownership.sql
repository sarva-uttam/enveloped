-- Auth & invitation ownership foundation.
--
-- Adds Supabase Auth-based ownership to invites, tightens RLS so one host
-- cannot read or write another host's invites, guest list, or RSVPs, and
-- adds a narrow SECURITY DEFINER lookup so an unauthenticated guest can
-- still see their own personalized invite (name + click-teaser) without
-- being able to read anyone else's.
--
-- NOT applied to the live project yet. Run this file's contents against
-- the connected Supabase project (SQL editor, or `supabase db push` once
-- the project is linked) only after explicit review/approval — see
-- PROJECT_STATUS.md for the exact steps and a note on what pre-existing
-- rows (created before auth existed) look like afterward.
--
-- This migration assumes the base schema in supabase/schema.sql (tables
-- `invites`, `invite_guests`, `invite_rsvps`) and the earlier payment-
-- gating migration (`paid`, `paypal_order_id` columns) are already applied.

-- ---------------------------------------------------------------------
-- 1. Ownership column
-- ---------------------------------------------------------------------

alter table invites
  add column if not exists owner_id uuid references auth.users (id) on delete cascade
    default auth.uid();

create index if not exists invites_owner_id_idx on invites (owner_id);

-- Pre-existing invites (created before auth existed) will have
-- owner_id = null. If already PAID, they stay reachable by slug for
-- guests through get_published_invite() below (that function checks
-- `paid`, not ownership — see its comment). If still UNPAID, they become
-- unreadable by anyone at all — not even their original creator, who has
-- no account to match owner_id against — since the raw table's only read
-- policy is auth.uid() = owner_id, and null owner_id can never equal a
-- real auth.uid(). They also won't appear in anyone's dashboard and can't
-- be edited/deleted. All of this is a known, documented gap — see
-- PROJECT_STATUS.md — not something to silently work around (e.g. by
-- making owner_id nullable-matches-anyone).

-- ---------------------------------------------------------------------
-- 2. invites — owner-scoped writes AND reads. The raw table is no longer
--    readable by anyone except its owner, full stop — including a "paid"
--    branch. That's a deliberate change from an earlier draft of this
--    migration, which had a "paid = true" public read policy on the raw
--    table. That draft was still wrong: `invites.answers` is the raw
--    survey input, which includes `guestNames` (the host's plain-text
--    guest list) plus `partnerNames`/`venue`/`city`/`colorMood`/
--    `extraDetails` — none of that is meant for guests, but
--    `select("*")` would have shipped all of it to any guest viewing a
--    published invite regardless of `paid`. Postgres RLS is row-level,
--    not column-level, so "some columns public, others owner-only" on
--    ONE table can't be expressed as a table policy at all — the correct
--    tool is a SECURITY DEFINER function that returns a hand-picked,
--    minimal column set, which is what get_published_invite() below is.
--    Every non-owner read goes through that function now; the raw table
--    literally has no path for a non-owner to read anything from it.
-- ---------------------------------------------------------------------

drop policy if exists "invites public read" on invites;
drop policy if exists "invites public read published" on invites;
drop policy if exists "invites public insert" on invites;
drop policy if exists "invites public update" on invites;

create policy "invites owner read own" on invites
  for select using (auth.uid() = owner_id);

create policy "invites owner insert" on invites
  for insert with check (auth.uid() = owner_id);

create policy "invites owner update" on invites
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "invites owner delete" on invites
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------
-- 3. invite_guests — owner-only. Guests reach their own row only through
--    resolve_invite_guest() below, never through a direct table read.
-- ---------------------------------------------------------------------

drop policy if exists "invite_guests public read" on invite_guests;
drop policy if exists "invite_guests public insert" on invite_guests;
drop policy if exists "invite_guests public update" on invite_guests;

create policy "invite_guests owner read" on invite_guests
  for select using (
    auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id)
  );

create policy "invite_guests owner insert" on invite_guests
  for insert with check (
    auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id)
  );

create policy "invite_guests owner update" on invite_guests
  for update
  using (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id))
  with check (auth.uid() = (select owner_id from invites where invites.id = invite_guests.invite_id));

-- ---------------------------------------------------------------------
-- 4. invite_rsvps — submitting stays open to guests (no accounts), but
--    reading the RSVP list is now owner-only, same privacy reasoning as
--    the guest list above.
--
--    The insert policy is NOT left as the original unconditional
--    "with check (true)" — the app's submitRsvp() already refuses to
--    submit against an unpaid invite before it ever issues an insert,
--    but that is a client-side convenience, not a security boundary: the
--    anon key is public, so anyone can call the Supabase REST/JS client
--    directly and skip the app entirely. The database itself now
--    enforces, independent of anything the browser does:
--      1. the referenced invite is paid (no RSVPs on an unpublished
--         invite, from anyone, authenticated or not);
--      2. IF a guest_id is supplied, it must reference a guest row that
--         actually belongs to the SAME invite_id being inserted against
--         — otherwise a caller could cite a real guest_id that belongs
--         to a DIFFERENT invite, misattributing an RSVP to someone else's
--         guest list. guest_id remains optional (null is fine — RSVPs
--         are collected on non-Platinum tiers too, which have no named
--         guest list at all).
-- ---------------------------------------------------------------------

drop policy if exists "invite_rsvps public read" on invite_rsvps;
drop policy if exists "invite_rsvps public insert" on invite_rsvps;

create policy "invite_rsvps owner read" on invite_rsvps
  for select using (
    auth.uid() = (select owner_id from invites where invites.id = invite_rsvps.invite_id)
  );

create policy "invite_rsvps insert on published invite" on invite_rsvps
  for insert
  with check (
    exists (
      select 1 from invites i
      where i.id = invite_rsvps.invite_id and i.paid = true
    )
    and (
      invite_rsvps.guest_id is null
      or exists (
        select 1 from invite_guests g
        where g.id = invite_rsvps.guest_id and g.invite_id = invite_rsvps.invite_id
      )
    )
  );

-- ---------------------------------------------------------------------
-- 5. Narrow, unauthenticated guest lookup.
--
-- SECURITY DEFINER means this function bypasses the invite_guests RLS
-- policy above — but it only ever returns the ONE row matching an exact
-- (invite slug, guest slug) pair, never a list. This is what lets a guest
-- see their own personalized name/teaser without an account, while the
-- table itself stays locked to the owner.
--
-- `and i.paid = true` is added below — an earlier version of this
-- function had no paid check at all, meaning a guest link to an
-- UNPUBLISHED invite could still resolve a real name/teaser through this
-- RPC even though the app's UI never displays it for that case (the app
-- shows "not live yet" instead) — the data would already have been
-- fetched over the wire before that UI decision, the same class of bug
-- this whole migration exists to close elsewhere. Fixed here too.
--
-- `set search_path = ''` (empty, not `public`) plus fully-qualified
-- `public.invite_guests`/`public.invites` table references: a
-- SECURITY DEFINER function runs with the PRIVILEGES of the function's
-- owner regardless of who calls it, but it still resolves unqualified
-- object names using whatever `search_path` is active — if that path
-- included a schema an unprivileged caller can create objects in (most
-- setups keep `public` writable), a malicious caller could create a
-- same-named object earlier in the path and have this function silently
-- operate on THEIR table/view instead of the real one ("search_path
-- hijacking"). An empty search_path plus explicit schema qualification
-- on every table reference closes that off entirely — there's no
-- unqualified name left for anything to hijack. Built-in types
-- (text/uuid/boolean) and operators don't need qualifying; they resolve
-- via pg_catalog regardless of search_path.
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
  where i.slug = p_invite_slug and g.slug = p_guest_slug and i.paid = true
  limit 1;
$$;

revoke all on function resolve_invite_guest(text, text) from public;
grant execute on function resolve_invite_guest(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Sanitized public invite read — the ONLY way a non-owner (guest or
--    anonymous visitor) reads an invite at all, now that the raw table
--    has no public read policy (see section 2's comment for why).
--
-- Deliberately returns:
--   - id      — the invite's internal uuid. Needed only so a guest can
--               submit an RSVP (invite_rsvps.invite_id is a real FK, not
--               the slug) — not sensitive on its own; it reveals nothing
--               about the owner or other guests, unlike owner_id/
--               paypal_order_id/answers.
--   - slug, paid — safe, and paid's presence lets the app distinguish
--               "not found" from "found but not published yet" without
--               a second query (this distinction is an intentional
--               product decision, not a leak — see PROJECT_STATUS.md).
--   - tier, content, event_date, song — ONLY populated when paid = true
--               (NULL otherwise); these are exactly the fields
--               InviteClient/generateMetadata render for a guest. `tier`
--               reads from the dedicated `tier` column, not answers.tier.
--               `content` is the AI-generated display copy (headline,
--               subheadline, welcome message, event details, closing
--               line) — meant to be shown, unlike the raw survey input.
--               event_date/song are pulled from inside `answers` because
--               they're the only two raw-answer fields the UI actually
--               displays to a guest (the countdown timer and the music
--               toggle) — every other answers.* key (guestNames,
--               partnerNames, venue, city, colorMood, extraDetails) is
--               intentionally NEVER selected here, at any point, for
--               anyone but the owner.
--
-- `set search_path = ''` plus fully-qualified `public.invites` — same
-- search_path-hijacking rationale as resolve_invite_guest() above.
-- ---------------------------------------------------------------------

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
