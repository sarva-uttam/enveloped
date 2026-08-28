-- PayPal payment integrity foundation.
--
-- Adds a durable, server-authoritative `payments` record for every PayPal
-- order created against an invitation, and closes a gap this project's own
-- prior review explicitly deferred: an authenticated owner could still
-- flip their own invite's `paid`/`paypal_order_id` columns directly via
-- the client SDK, bypassing PayPal entirely (see REVIEW_BRIEF.md,
-- "Specific areas to scrutinize" #2 from the auth_ownership review).
--
-- NOT applied to the live project yet — same process as the prior
-- migration: paste into the Supabase SQL editor (or `supabase db push`
-- once the project is linked) only after explicit review/approval.
--
-- Assumes supabase/migrations/20260828000000_auth_ownership.sql (owner_id,
-- ownership-scoped RLS) is already applied.

-- ---------------------------------------------------------------------
-- 1. payments table.
--
-- One row per PayPal order attempt against an invitation. Never written
-- by the browser under any circumstances — see the RLS section below.
-- `expected_amount`/`captured_amount` are `numeric(10,2)`, not floating
-- point, so an exact-match comparison at capture time
-- (expected_amount = captured_amount) can't be defeated by float
-- rounding.
-- ---------------------------------------------------------------------

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invites (id) on delete cascade,
  -- Denormalized from invites.owner_id at creation time (not a foreign
  -- key default — this table is only ever written via the service-role
  -- client, which has no auth.uid() of its own). Lets the owner-read RLS
  -- policy below avoid a subquery into invites for every row.
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'paypal',
  provider_order_id text not null,
  provider_capture_id text,
  -- The tier/price this order was created for — captured at order-creation
  -- time from the server-authoritative TIERS table (src/lib/tiers.ts),
  -- never from anything the client sent. This is what capture-time
  -- verification compares the actual PayPal capture amount against.
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  expected_amount numeric(10, 2) not null check (expected_amount > 0),
  captured_amount numeric(10, 2),
  currency text not null default 'USD',
  status text not null default 'created'
    check (status in ('created', 'processing', 'captured', 'failed')),
  -- Sent as the PayPal-Request-Id header on both the order-create and
  -- capture calls for this row, so a retried request (ours or the
  -- client's) that reaches PayPal twice is idempotent AT PAYPAL TOO, not
  -- just in our own database.
  idempotency_key uuid not null default gen_random_uuid(),
  -- The verified capture response, kept for audit/reconciliation if a
  -- dispute or "PayPal succeeded but our database update failed"
  -- scenario ever needs investigating by hand.
  raw_capture_response jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);

create index if not exists payments_invitation_id_idx on payments (invitation_id);
create index if not exists payments_owner_id_idx on payments (owner_id);
-- Supports "does this invitation already have a pending order" lookups
-- (order-creation idempotency) without a full table scan.
create index if not exists payments_invitation_status_idx on payments (invitation_id, status);

alter table payments enable row level security;

-- Read-only for the owner, and ONLY the owner — matches every other
-- owner-scoped table in this project. There is deliberately NO insert,
-- update, or delete policy for anon/authenticated on this table at all:
-- with RLS enabled and no policy granting a given operation, that
-- operation is denied outright for every role except one that bypasses
-- RLS (the service-role client — src/lib/supabase/admin.ts). This is
-- what makes "never trust an amount/tier/invitation association supplied
-- by the browser" a structural guarantee rather than an app-layer
-- convention: the browser cannot write to this table under any
-- circumstances, full stop, regardless of what any client-side bug might
-- someday attempt.
create policy "payments owner read own" on payments
  for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------
-- 2. Close the "owner can flip their own paid flag directly" gap.
--
-- invites' existing "invites owner update" policy (auth.uid() = owner_id)
-- lets an owner update ANY column on their own invite via the client
-- SDK — including `paid` and `paypal_order_id`. Nothing in the app UI
-- currently exercises that (there's no client-side .update() call on
-- invites at all as of this migration), but it was a real, reachable gap
-- via the Supabase client directly, explicitly flagged as deferred in
-- REVIEW_BRIEF.md. RLS itself can't express "this role may update this
-- row, but not these two specific columns" — Postgres COLUMN-level
-- privileges can, but a simpler and more auditable fix here is a trigger
-- that rejects any change to `paid`/`paypal_order_id` unless the
-- connection is the service_role (which is what markInvitePaid() uses,
-- and the only thing that should ever be allowed to flip these columns).
-- ---------------------------------------------------------------------

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
