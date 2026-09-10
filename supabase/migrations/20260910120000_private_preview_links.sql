-- Stage 5 — secure, tokenized private preview links.
--
-- Adds ONE new table (invite_previews) and four new functions so a
-- concierge client can review their invitation — published or not —
-- through an unguessable, revocable link that never requires a client
-- account. This is a forward-only, purely additive migration: no
-- existing table, column, policy, trigger, or function from any prior
-- migration is altered. `published_at` (Stage 3) and `paid` remain
-- completely untouched by anything below — a preview link is a read-only
-- side door into an invitation's sanitized content, never a second way
-- to publish or pay for one. See PROJECT_STATUS.md's Stage 5 section for
-- the full design rationale.
--
-- NOT applied to the live project as of this writing — verified only
-- against the local Supabase stack, same as every migration since Stage 2.

-- ---------------------------------------------------------------------
-- 1. invite_previews — the token-hash table.
--
-- One row per invitation, by design (`invite_id` is the PRIMARY KEY,
-- not just a unique/foreign-keyed column) — "support one active preview
-- link per invitation initially" is enforced structurally, not by
-- convention: there is no way for a second row to exist for the same
-- invitation at all, so "rotate" is necessarily an UPDATE of the one
-- existing row, never an INSERT of a second one. A dedicated table
-- (rather than columns on `invites` itself) keeps this security-
-- sensitive material physically separate from the much more broadly
-- read/written `invites` row, and lets it carry its own, much stricter
-- RLS posture (below) independent of anything `invites` already allows.
--
-- `token_hash` — NEVER the raw token. One-way SHA-256, hex-encoded (see
-- src/lib/preview-tokens.server.ts and get_invite_preview() below for
-- the two places this value is computed — creation, in trusted Node
-- server code, before the raw token is ever sent to Postgres at all;
-- verification, inside get_invite_preview() itself, from the raw token
-- supplied in a preview request). `unique` makes it both efficiently
-- searchable (a real btree index, not a sequential scan) and a second,
-- structural guarantee that two invitations can never collide on the
-- same hash (astronomically unlikely with 256 bits of entropy regardless,
-- but free to also enforce at the schema level).
--
-- `revoked_at` — null means active. Rotating clears it (a rotation always
-- produces a fresh, active credential, even if the previous one had been
-- revoked); revoking sets it without touching `token_hash` (the old hash
-- stays on the row as an audit trail of what was once issued, but no
-- longer matches anything get_invite_preview() will accept — see its
-- `revoked_at is null` predicate below). No DELETE path exists for this
-- table from any function in this migration — a preview link's history
-- persists (revoked or superseded by rotation) until the invitation
-- itself is deleted (`on delete cascade`).
-- ---------------------------------------------------------------------

create table if not exists invite_previews (
  invite_id uuid primary key references invites (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  rotated_at timestamptz,
  revoked_at timestamptz
);

alter table invite_previews enable row level security;

-- Deliberately NO policy of any kind, for any role, including an
-- administrator's own ordinary authenticated client — the exact same
-- posture as app_admins (20260909120000_admin_identity.sql): with RLS
-- enabled and zero policies, every operation (select/insert/update/
-- delete) is denied outright for anon and authenticated, structurally,
-- not by convention. The only way any row here is ever read or written
-- is through the SECURITY DEFINER functions below, each of which
-- performs its own is_admin() (for writes) or token-hash (for the one
-- read) check internally rather than relying on a table-level policy —
-- necessary specifically because a table-level policy can gate WHICH
-- ROWS a role sees, but cannot itself hash an incoming raw token for
-- comparison, which get_invite_preview() must do. This also means
-- token_hash is never reachable through PostgREST's ordinary table
-- endpoint (`/rest/v1/invite_previews`) for any caller, admin included —
-- the only exposed surface is the four functions below, and none of them
-- ever returns token_hash to any caller (see each function's own
-- comment).

-- ---------------------------------------------------------------------
-- 2. admin_create_invite_preview(p_invite_id, p_token_hash) — the FIRST
--    preview link for an invitation.
--
-- Takes the ALREADY-HASHED token, never the raw one — hashing happens in
-- trusted Node server code (src/lib/preview-tokens.server.ts, called
-- from src/lib/preview-admin.server.ts) before this function is ever
-- invoked, specifically so the raw token is never sent to Postgres at
-- all, not even as a transient RPC argument that could appear in a
-- connection-level query log. This is a deliberately different design
-- from get_invite_preview() below, which DOES accept a raw token — see
-- that function's own comment for why verification and creation have
-- different trust shapes.
--
-- is_admin() gate, SECURITY DEFINER (invite_previews' own RLS has no
-- policy an ordinary — even administrator — caller could satisfy, so a
-- SECURITY INVOKER version would fail for literally everyone; same
-- reasoning as publish_invite()/unpublish_invite()). `set search_path =
-- ''` plus fully-qualified `public.invite_previews` — same
-- search-path-hijacking defense as every other SECURITY DEFINER function
-- in this project.
--
-- A minimal sanity check on the hash's shape (64 lowercase hex
-- characters — exactly what sha256-hex always produces) rejects an
-- obviously-malformed value outright rather than silently storing
-- garbage that could never match anything get_invite_preview() computes.
--
-- Raises (does not silently no-op or silently rotate) if a row already
-- exists for this invitation — invite_id's PRIMARY KEY constraint would
-- reject the INSERT anyway; the explicit unique_violation catch below
-- exists only to turn Postgres's generic constraint-violation error into
-- a message that tells the caller what to do instead (use
-- admin_rotate_invite_preview()).
-- ---------------------------------------------------------------------

create or replace function public.admin_create_invite_preview(p_invite_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may create a preview link';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash';
  end if;

  insert into public.invite_previews (invite_id, token_hash, created_by)
  values (p_invite_id, p_token_hash, auth.uid());

  return true;
exception
  when unique_violation then
    raise exception 'a preview link already exists for this invitation — rotate it instead';
end;
$$;

revoke all on function public.admin_create_invite_preview(uuid, text) from public;
grant execute on function public.admin_create_invite_preview(uuid, text) to authenticated;
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- public.* function to anon/authenticated/service_role by default,
-- independent of the `revoke ... from public` above — same platform
-- behavior already documented (and explicitly corrected for) in
-- 20260909150000_publication_payment_split.sql. Closed here the same
-- way: anon is unreachable, not merely rejected internally.
revoke execute on function public.admin_create_invite_preview(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- 3. admin_rotate_invite_preview(p_invite_id, p_token_hash) — replaces
--    the CURRENT token (whether active or previously revoked) with a
--    fresh one. Clears revoked_at unconditionally: rotation always
--    produces a live credential, even for a previously-revoked
--    invitation — an administrator explicitly choosing to rotate is a
--    deliberate re-authorization, not an accident that should leave the
--    link revoked.
--
-- Returns false (not an exception) when no row exists for this
-- invitation yet — a normal, expected "nothing to rotate" condition
-- (e.g. a stale/mistyped invite id), handled as a clean return value
-- exactly like publish_invite()/unpublish_invite() do for a missing
-- invite id. A caller who is NOT an administrator still gets a thrown
-- exception (an authorization failure, not a data condition).
-- ---------------------------------------------------------------------

create or replace function public.admin_rotate_invite_preview(p_invite_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may rotate a preview link';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash';
  end if;

  update public.invite_previews
  set token_hash = p_token_hash,
      rotated_at = now(),
      revoked_at = null
  where invite_id = p_invite_id;

  return found;
end;
$$;

revoke all on function public.admin_rotate_invite_preview(uuid, text) from public;
grant execute on function public.admin_rotate_invite_preview(uuid, text) to authenticated;
revoke execute on function public.admin_rotate_invite_preview(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- 4. admin_revoke_invite_preview(p_invite_id) — marks the current link
--    inactive without deleting its row (see section 1's comment on the
--    audit-trail rationale). Idempotent: revoking an already-revoked (or
--    never-created) link simply matches zero rows and returns false —
--    not an error, the same "clean false for a data condition, exception
--    only for an authorization failure" shape as every function above.
-- ---------------------------------------------------------------------

create or replace function public.admin_revoke_invite_preview(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may revoke a preview link';
  end if;

  update public.invite_previews
  set revoked_at = now()
  where invite_id = p_invite_id and revoked_at is null;

  return found;
end;
$$;

revoke all on function public.admin_revoke_invite_preview(uuid) from public;
grant execute on function public.admin_revoke_invite_preview(uuid) to authenticated;
revoke execute on function public.admin_revoke_invite_preview(uuid) from anon;

-- ---------------------------------------------------------------------
-- 5. get_invite_preview(p_token) — the ONE way a raw preview token is
--    ever redeemed for invitation data. This is the public-facing
--    counterpart to get_published_invite() (auth_ownership /
--    publication_payment_split), with one deliberate difference: it
--    does NOT gate on published_at at all — that is the entire point of
--    a preview link (Part D's "work for unpublished and published
--    invitations"). Token POSSESSION is the authorization here, not
--    publication state.
--
-- Accepts the RAW token and hashes it INSIDE this function, using the
-- same algorithm (sha256, hex-encoded) as src/lib/preview-tokens.server.ts's
-- hashPreviewToken() — `encode(extensions.digest(p_token, 'sha256'), 'hex')`
-- and Node's `createHash('sha256').update(token).digest('hex')` independently
-- produce byte-identical output for the same input, verified directly by
-- tests/integration/private-preview.test.ts. This is deliberately
-- different from admin_create/rotate_invite_preview() above, which take
-- an already-hashed value: those are trusted, authenticated ADMIN
-- operations where Node-side hashing keeps the raw token out of Postgres
-- entirely; this is the untrusted, anonymous-reachable VERIFICATION path,
-- where doing the hash-and-compare in one atomic, minimal-surface
-- SECURITY DEFINER function (rather than trusting every caller to hash
-- correctly and pass only the hash) is the safer shape for something
-- anon can invoke arbitrarily.
--
-- `coalesce(p_token, '')` avoids a null-in/null-out short-circuit that
-- would otherwise make `token_hash = extensions.digest(null, ...)` compare against
-- NULL and silently match nothing anyway — coalescing to an empty string
-- keeps the comparison a well-defined, always-false-for-no-token
-- boolean rather than relying on NULL propagation semantics to happen to
-- produce the same safe result.
--
-- `p.revoked_at is null` is what makes a rotated or revoked token stop
-- working immediately: rotation replaces token_hash outright (the OLD
-- hash simply no longer exists anywhere in the table to match), and
-- revocation sets revoked_at without touching token_hash (the OLD hash
-- is still present but excluded by this predicate) — both take effect on
-- the very next request, there is no caching or delay anywhere in this
-- path.
--
-- Returns every field PublicInviteView actually renders, UNCONDITIONALLY
-- (no published_at-gated CASE WHEN, unlike get_published_invite()) —
-- content/tier/event_date/song are always populated when a row matches,
-- published or not. Still excludes, structurally (these columns are not
-- in the `returns table (...)` shape at all, so there is no code path
-- that could ever include them): answers (raw survey input), owner_id,
-- paypal_order_id, generator_kind/generator_content/composition (not
-- wired into rendering yet regardless of source), and — specific to this
-- function — token_hash and every other invite_previews column. Also
-- returns `published_at` itself, unmodified, so the preview page can show
-- "not necessarily published" honestly rather than pretending every
-- preview is either fully public-equivalent or misleadingly silent about
-- its real state.
--
-- `extensions.digest(...)`, schema-qualified, not bare `digest(...)` —
-- confirmed directly against this local stack while writing this
-- migration: `create extension if not exists pgcrypto` (already run by
-- the genesis migration) installs pgcrypto's functions into the
-- `extensions` schema, not `public` — `select p.proname, n.nspname from
-- pg_proc p join pg_namespace n on n.oid = p.pronamespace where
-- p.proname = 'digest'` returns `extensions.digest`. `set search_path =
-- ''` below means an unqualified `digest(...)` call fails outright
-- (`function digest(text, unknown) does not exist`, SQLSTATE 42883) —
-- this is the same search-path-hijacking defense as every fully-
-- qualified `public.*` table reference elsewhere in this project,
-- applied to an extension function for the first time in this codebase.
-- ---------------------------------------------------------------------

create or replace function public.get_invite_preview(p_token text)
returns table (
  id uuid,
  slug text,
  paid boolean,
  published_at timestamptz,
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
    i.published_at,
    i.tier,
    i.content,
    i.answers ->> 'eventDate' as event_date,
    i.answers ->> 'song' as song
  from public.invite_previews p
  join public.invites i on i.id = p.invite_id
  where p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- Note: get_published_invite()'s own behavior (section 3 of
-- 20260909150000_publication_payment_split.sql) is entirely untouched by
-- this migration — not re-created, not re-granted, not referenced by
-- anything above. A preview token grants access ONLY through
-- get_invite_preview(); it has no effect whatsoever on what
-- get_published_invite()/resolve_invite_guest()/can_insert_rsvp() return
-- for the same invitation via the ordinary /invite/[id] path.
