-- Admin authorship + offline-payment record + (attempted) publish/payment
-- split on `get_published_invite()`.
--
-- RECONSTRUCTED, not original — see 20260905073155_requests_and_templates.sql's
-- header for the full account of why. Recovers schema_migrations version
-- 20260905091530, name `generator_payment_publish_split`, by read-only
-- inspection of the live database on 2026-09-09, including
-- `pg_get_functiondef()` for the exact live body of `get_published_invite()`
-- reproduced below. Adding this file makes no application change — this
-- is the function as it already runs live today.
--
-- Confidence: HIGH for every column/table/function definition below (all
-- directly queried from the live database). MEDIUM for grouping
-- `published_at`/`created_by_admin_id`/`invite_payment_records` and the
-- `get_published_invite()` replacement under this one migration name —
-- inferred from ordinal position (published_at/created_by_admin_id are
-- invites' final two columns, 18-19, immediately after the generator_
-- composition columns) and from `get_published_invite()`'s live body
-- being the only function definition anywhere in this schema that
-- references generator_kind/generator_content/composition/published_at —
-- i.e. it could only have been (re)created at or after this point, and
-- its name and purpose ("payment_publish_split") match this migration's
-- recorded name closely enough to place it here with reasonable
-- confidence.
--
-- `published_at` — an explicit admin publish timestamp for a
-- generator-produced invite, distinct from `paid`. `created_by_admin_id`
-- — which admin account ran the generator for this invite, distinct from
-- `owner_id` (which stays null for every concierge-created invite — see
-- the live column comment reproduced below, the one surviving reference
-- to the missing `invites.server.ts generateHinduInvite`).
-- `invite_payment_records` — a ledger for payments taken OUTSIDE PayPal
-- (cash, bank transfer, mobile money, or a manually-recorded PayPal
-- payment), the concierge-payment counterpart to the `payments` table's
-- PayPal-only, self-service-oriented records.
--
-- KNOWN LIMITATION, carried forward unchanged by Stage 0, NOT fixed here:
-- despite this migration's name, `get_published_invite()`'s live body
-- (reproduced verbatim below) does NOT actually decouple publication from
-- payment. Every generator-aware branch is `i.paid AND (i.generator_kind
-- IS NULL OR i.published_at IS NOT NULL)` — `i.paid` is still a hard,
-- unconditional AND. An admin-published-but-unpaid concierge invite is
-- exactly as invisible to guests as an admin-approved-but-unpublished one:
-- `published_at` only ever narrows visibility further for a generator
-- invite, it never substitutes for `paid`. `resolve_invite_guest()` and
-- `can_insert_rsvp()` (both defined in 20260901114159_auth_ownership.sql,
-- unchanged since) still gate on `i.paid = true` alone and have no
-- awareness of `published_at` at all. Concretely: a concierge invite the
-- admin has approved and published, but that has not been paid through
-- PayPal, is invisible to guests, and personalised guest links against it
-- resolve to nothing. This is a real defect against the concierge-first
-- product direction (payment state and publication state must be
-- separate) and is documented in PROJECT_STATUS.md/REVIEW_BRIEF.md as a
-- named, tracked issue for a future, explicitly-scoped behavioral
-- migration — Stage 0's job is only to describe current live behavior
-- exactly, never to correct it.

alter table invites add column if not exists published_at timestamptz;
comment on column invites.published_at is
  'Explicit admin publish timestamp for a Generator-produced invite (generator_kind is not null). Null = not yet published. Not consulted for the self-serve flow, where paid alone gates visibility.';

alter table invites add column if not exists created_by_admin_id uuid references auth.users (id) on delete set null;
comment on column invites.created_by_admin_id is
  'Which admin account ran the Generator for this invite (invites.server.ts generateHinduInvite). Distinct from owner_id, which stays null for every concierge-created invite.';

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

-- No RLS policy is added here — verified live to have none (RLS enabled,
-- zero policies), denying every operation to anon/authenticated. Preserved
-- as-is; an admin access policy is future work, not part of Stage 0.

-- Replaces get_published_invite() from 20260901114159_auth_ownership.sql
-- with the live 10-column version — adds generator_kind/generator_content/
-- composition to the previous id/slug/paid/tier/content/event_date/song,
-- and changes every generator-aware column's guard from `i.paid` alone to
-- `i.paid AND (i.generator_kind IS NULL OR i.published_at IS NOT NULL)`.
-- See the KNOWN LIMITATION note above for why this guard does not achieve
-- the payment/publication split its name implies. search_path = '' plus
-- fully-qualified public.invites — same search_path-hijacking rationale as
-- this function's original definition.
--
-- Bug found and fixed by Stage 1's local-database replay (2026-09-09,
-- see tests/integration/): `create or replace function` cannot change an
-- existing function's `returns table (...)` column list — Postgres
-- rejects it with "cannot change return type of existing function"
-- (SQLSTATE 42P13) — only the function BODY can change under `create or
-- replace`, not its output shape. The original 7-column
-- get_published_invite() from 20260901114159_auth_ownership.sql must be
-- dropped first. This is a correction to how this RECONSTRUCTED file
-- reaches the verified live end-state (see this file's own header and
-- supabase/migrations/README.md for what "reconstructed" means) — the
-- function body below is unchanged and still matches the live database
-- exactly (verified via pg_get_functiondef() during Stage 0); only the
-- missing statement needed to actually reach that state from a fresh
-- database has been added. The real (lost) browser-generator-v1 migration
-- must have done the equivalent, or the live database itself could never
-- have reached its current state either.
drop function if exists get_published_invite(text);

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
