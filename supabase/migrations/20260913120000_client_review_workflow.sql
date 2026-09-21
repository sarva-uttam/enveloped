-- Stage 9 — secure client approval and revision workflow.
--
-- Forward-only. Extends Stage 5 (private preview links), Stage 8
-- (composition revisions, admin_audit_log, publish_invite()) — adds two
-- new tables and a set of narrow, single-purpose SECURITY DEFINER
-- functions, never a generic "update review status" endpoint. Nothing
-- here alters public visibility, payment state, or any guest-facing RPC;
-- get_invite_preview() itself is untouched — review context is served by
-- a dedicated new function instead (see section 5), the same "physically
-- separate, independently-evolvable" posture invite_previews already
-- established relative to invites.
--
-- A preview-link decision is NOT a verified identity. Nothing below
-- stores or implies otherwise — the optional client display name is
-- exactly that, a label the visitor typed, never authenticated.
--
-- NOT applied to the live project — verified only against the local
-- Supabase stack, same as every migration since Stage 2.

-- =======================================================================
-- 1. review_rounds — one row per review round. A round binds to EXACTLY
--    one composition_revision at creation time (Part B: "a review round
--    must reference one exact composition revision") and never changes
--    which revision it refers to afterward — a meaningful composition
--    save instead supersedes the round outright (section 6 below),
--    rather than silently re-pointing it at the new content.
--
--    Same zero-client-policy posture as invite_previews/admin_audit_log:
--    RLS enabled, one admin-only SELECT policy, no insert/update/delete
--    policy for any role — every write goes through a dedicated function
--    below, each performing its own is_admin() (admin actions) or
--    token-hash (client decisions) check internally.
--
--    The partial unique index makes "only one ACTIVE round per
--    invitation" (Part B) structural, not conventional — "active" here
--    is every non-terminal status: a round stops blocking a new one only
--    once it is resolved, superseded, or cancelled.
-- =======================================================================

create table if not exists review_rounds (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites (id) on delete cascade,
  composition_revision integer not null,
  round_number integer not null,
  status text not null default 'draft' check (
    status in ('draft', 'ready_to_send', 'awaiting_client', 'changes_requested', 'client_approved', 'resolved', 'superseded', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  decided_at timestamptz,
  -- Client-provided, NEVER a verified identity — see this migration's
  -- header and every UI-facing string built from it (Part G/E: "labelled
  -- correctly," "say submitted through the private preview link, not a
  -- verified identity").
  decision_display_name text check (decision_display_name is null or char_length(decision_display_name) <= 100),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  superseded_at timestamptz,
  cancelled_at timestamptz,
  unique (invite_id, round_number)
);

create index if not exists review_rounds_invite_id_idx on review_rounds (invite_id);

create unique index if not exists review_rounds_one_active_idx on review_rounds (invite_id)
  where status in ('draft', 'ready_to_send', 'awaiting_client', 'changes_requested', 'client_approved');

alter table review_rounds enable row level security;

create policy "review_rounds admin select" on review_rounds for select using (public.is_admin());

comment on table review_rounds is
  'Stage 9 client review rounds — every write goes through a dedicated SECURITY DEFINER function (admin_*_review_round(), submit_review_*()); no client role has a table-level policy for any other operation. A preview-link decision is possession-based, never a verified identity.';

-- =======================================================================
-- 2. review_feedback_items — the structured content of a "request
--    changes" decision (Part D). A single decision may contain multiple
--    items (each with its own optional category/section reference), all
--    sharing the same review_round_id and submitted together. `invite_id`
--    is denormalized from the round for simpler admin queries/RLS; it is
--    never independently writable (always copied from the round at
--    insert time inside submit_review_changes() below).
--
--    Plain text only — rendered as text, never HTML, by every consumer
--    (Part D: "never render feedback with dangerouslySetInnerHTML").
--    Length/count limits are enforced here as a hard backstop (Part D:
--    "define strict length and count limits") in addition to the
--    stricter Zod validation the trusted server route runs first.
-- =======================================================================

create table if not exists review_feedback_items (
  id uuid primary key default gen_random_uuid(),
  review_round_id uuid not null references review_rounds (id) on delete cascade,
  invite_id uuid not null references invites (id) on delete cascade,
  category text check (
    category is null or category in ('wording', 'names', 'dateTime', 'venue', 'schedule', 'imagery', 'style', 'music', 'rsvp', 'other')
  ),
  section_id text check (section_id is null or section_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  message text not null check (char_length(message) between 1 and 2000),
  display_name text check (display_name is null or char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index if not exists review_feedback_items_round_idx on review_feedback_items (review_round_id);
create index if not exists review_feedback_items_invite_idx on review_feedback_items (invite_id);

alter table review_feedback_items enable row level security;

create policy "review_feedback_items admin select" on review_feedback_items for select using (public.is_admin());

comment on table review_feedback_items is
  'Stage 9 structured "request changes" items — plain text only, never rendered as HTML. display_name is client-typed, never a verified identity.';

-- =======================================================================
-- 3. admin_create_review_round(p_invite_id) — binds a new round to the
--    invitation's CURRENT composition_revision at the moment of
--    creation. round_number is 1 + the highest existing round number for
--    this invitation (0 if none yet — the first round is always 1).
--    Fails with a friendly exception (not a bare constraint error) if an
--    active round already exists — the partial unique index is the real
--    guarantee; the pre-check just gives a clearer message.
-- =======================================================================

create or replace function public.admin_create_review_round(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision integer;
  v_round_number integer;
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may start a review round';
  end if;

  select composition_revision into v_revision from public.invites where id = p_invite_id;
  if not found then
    raise exception 'invitation not found';
  end if;

  if exists (
    select 1 from public.review_rounds
    where invite_id = p_invite_id
      and status in ('draft', 'ready_to_send', 'awaiting_client', 'changes_requested', 'client_approved')
  ) then
    raise exception 'an active review round already exists for this invitation';
  end if;

  select coalesce(max(round_number), 0) + 1 into v_round_number from public.review_rounds where invite_id = p_invite_id;

  insert into public.review_rounds (invite_id, composition_revision, round_number, status, created_by)
  values (p_invite_id, v_revision, v_round_number, 'draft', auth.uid())
  returning id into v_new_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_round_created', 'review_rounds', v_new_id, jsonb_build_object('invite_id', p_invite_id, 'round_number', v_round_number, 'composition_revision', v_revision));

  return v_new_id;
exception
  when unique_violation then
    raise exception 'an active review round already exists for this invitation';
end;
$$;

revoke all on function public.admin_create_review_round(uuid) from public;
grant execute on function public.admin_create_review_round(uuid) to authenticated;
revoke execute on function public.admin_create_review_round(uuid) from anon;

-- =======================================================================
-- 4. Admin round-lifecycle actions — each a narrow, single-transition
--    function (never a generic "set status to X"), returning boolean:
--    true if the round was found in the expected starting status and
--    updated, false otherwise (a normal, expected "nothing to do"
--    outcome, not an exception — the same shape as
--    admin_rotate_invite_preview()). A non-admin caller still gets a
--    thrown exception.
-- =======================================================================

create or replace function public.admin_mark_review_round_ready(p_review_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may mark a review round ready';
  end if;

  update public.review_rounds
  set status = 'ready_to_send'
  where id = p_review_round_id and status = 'draft'
  returning invite_id into v_invite_id;

  if not found then
    return false;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_round_ready', 'review_rounds', p_review_round_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_mark_review_round_ready(uuid) from public;
grant execute on function public.admin_mark_review_round_ready(uuid) to authenticated;
revoke execute on function public.admin_mark_review_round_ready(uuid) from anon;

-- admin_send_review_round() — the explicit "I actually sent/shared this
-- link" confirmation (Part J: "do not claim a preview was delivered
-- merely because a link was created or copied — use explicit admin
-- state changes"). Records sent_at and moves the round into the one
-- status the client-facing decision functions below will act on.

create or replace function public.admin_send_review_round(p_review_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may mark a review round as sent';
  end if;

  update public.review_rounds
  set status = 'awaiting_client', sent_at = now()
  where id = p_review_round_id and status = 'ready_to_send'
  returning invite_id into v_invite_id;

  if not found then
    return false;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_round_sent', 'review_rounds', p_review_round_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_send_review_round(uuid) from public;
grant execute on function public.admin_send_review_round(uuid) to authenticated;
revoke execute on function public.admin_send_review_round(uuid) from anon;

-- admin_cancel_review_round() — from ANY non-terminal status. Cancelling
-- an already-resolved/superseded/cancelled round is a clean no-op
-- (returns false), matching every other idempotent admin action here.

create or replace function public.admin_cancel_review_round(p_review_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may cancel a review round';
  end if;

  update public.review_rounds
  set status = 'cancelled', cancelled_at = now()
  where id = p_review_round_id
    and status in ('draft', 'ready_to_send', 'awaiting_client', 'changes_requested', 'client_approved')
  returning invite_id into v_invite_id;

  if not found then
    return false;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_round_cancelled', 'review_rounds', p_review_round_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_cancel_review_round(uuid) from public;
grant execute on function public.admin_cancel_review_round(uuid) to authenticated;
revoke execute on function public.admin_cancel_review_round(uuid) from anon;

-- admin_resolve_review_round() — marks a decided round (approved or
-- changes-requested) as fully handled/closed out. Does NOT itself touch
-- composition or start a new round — Part G lists "resolve" and "start a
-- new round for the revised composition" as separate administrator
-- actions.

create or replace function public.admin_resolve_review_round(p_review_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may resolve a review round';
  end if;

  update public.review_rounds
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_review_round_id and status in ('changes_requested', 'client_approved')
  returning invite_id into v_invite_id;

  if not found then
    return false;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_round_resolved', 'review_rounds', p_review_round_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_resolve_review_round(uuid) from public;
grant execute on function public.admin_resolve_review_round(uuid) to authenticated;
revoke execute on function public.admin_resolve_review_round(uuid) from anon;

-- admin_resolve_review_feedback_item() — resolves ONE structured item
-- (Part G: "resolve individual feedback items or the review round").
-- Independent of the parent round's own status.

create or replace function public.admin_resolve_review_feedback_item(p_feedback_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may resolve a feedback item';
  end if;

  update public.review_feedback_items
  set resolved_at = now(), resolved_by = auth.uid()
  where id = p_feedback_item_id and resolved_at is null
  returning invite_id into v_invite_id;

  if not found then
    return false;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review_feedback_item_resolved', 'review_feedback_items', p_feedback_item_id, jsonb_build_object('invite_id', v_invite_id));

  return true;
end;
$$;

revoke all on function public.admin_resolve_review_feedback_item(uuid) from public;
grant execute on function public.admin_resolve_review_feedback_item(uuid) to authenticated;
revoke execute on function public.admin_resolve_review_feedback_item(uuid) from anon;

-- =======================================================================
-- 5. get_invite_review_context(p_token) — the sanitized, anonymous-
--    reachable read a preview page uses to know what to show. Same
--    trust shape as get_invite_preview(): accepts the RAW token, hashes
--    it INSIDE itself against invite_previews.token_hash, requires
--    revoked_at is null — an invalid, malformed, rotated, or revoked
--    token all produce the identical empty result set, never a
--    distinguishing error (Part C: "do not reveal whether another
--    invitation or review round exists").
--
--    Returns the LATEST round for the invitation (by round_number desc)
--    and `is_current` — whether that round's bound composition_revision
--    still equals the invitation's actual current one — computed HERE,
--    server-side, rather than exposing either raw revision number to the
--    client at all (Part E: "no internal workflow terminology exposed
--    unnecessarily"). Never returns token_hash, owner_id, payment
--    fields, or any review_feedback_items content — a client only ever
--    submits feedback, never reads back what was previously submitted
--    through this function.
-- =======================================================================

create or replace function public.get_invite_review_context(p_token text)
returns table (
  invite_id uuid,
  review_round_id uuid,
  round_number integer,
  status text,
  is_current boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id as invite_id,
    r.id as review_round_id,
    r.round_number,
    r.status,
    (r.composition_revision = i.composition_revision) as is_current
  from public.invite_previews p
  join public.invites i on i.id = p.invite_id
  left join lateral (
    select * from public.review_rounds rr
    where rr.invite_id = i.id
    order by rr.round_number desc
    limit 1
  ) r on true
  where p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_invite_review_context(text) from public;
grant execute on function public.get_invite_review_context(text) to anon, authenticated;

-- mark_review_round_opened(p_token) — best-effort "opened" tracking
-- (Part B: "sent/opened timestamp where safely measurable"). A pure,
-- idempotent side effect: only ever sets opened_at once, only for a
-- round currently awaiting a decision, only through the same trusted
-- token-hash boundary as every other client-facing function here.
-- Returns boolean so a caller can distinguish "recorded" from "nothing
-- to record" without that ever being treated as an error.

create or replace function public.mark_review_round_opened(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.review_rounds r
  set opened_at = now()
  from public.invite_previews p
  where r.invite_id = p.invite_id
    and p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null
    and r.status = 'awaiting_client'
    and r.opened_at is null
    and r.id = (select rr.id from public.review_rounds rr where rr.invite_id = r.invite_id order by rr.round_number desc limit 1);

  return found;
end;
$$;

revoke all on function public.mark_review_round_opened(text) from public;
grant execute on function public.mark_review_round_opened(text) to anon, authenticated;

-- =======================================================================
-- 6. Client decision functions — submit_review_approval() and
--    submit_review_changes(). Both:
--      - accept the RAW token, hash it INSIDE themselves (never trust a
--        pre-hashed value from an anonymous caller);
--      - resolve to the invitation's LATEST round only, and require it
--        to be exactly 'awaiting_client' AND still bound to the
--        invitation's CURRENT composition_revision — a stale or
--        superseded round, or one already decided, rejects the
--        submission (Part C/B: "reject decisions for stale or
--        superseded revisions," "approval of revision N must never
--        approve revision N+1");
--      - use ONE guarded UPDATE (`where status = 'awaiting_client'`) as
--        the actual transactional protection against two near-
--        simultaneous decisions (Part C) — Postgres's own row-level
--        locking serializes concurrent UPDATEs to the same row; the
--        loser's WHERE clause simply matches zero rows;
--      - return a short, generic outcome code ('ok' / 'unavailable') —
--        'unavailable' covers every failure reason (bad token, no
--        round, wrong status, stale revision, lost race) identically,
--        by design (Part C: "do not reveal whether another invitation
--        or review round exists" — even to the legitimate holder of
--        THIS token, a generic message is safer than a specific one a
--        script could probe with);
--      - record the decision in admin_audit_log with actor_id = null
--        (there is no authenticated user) and detail noting the source
--        is the preview link — never the token, never its hash, never
--        full feedback text (Part K).
-- =======================================================================

create or replace function public.submit_review_approval(p_token text, p_display_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_round_id uuid;
  v_display_name text;
begin
  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_display_name is not null and char_length(v_display_name) > 100 then
    v_display_name := left(v_display_name, 100);
  end if;

  select i.id into v_invite_id
  from public.invite_previews p
  join public.invites i on i.id = p.invite_id
  where p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null;

  if not found then
    return 'unavailable';
  end if;

  select r.id into v_round_id
  from public.review_rounds r
  join public.invites i on i.id = r.invite_id
  where r.invite_id = v_invite_id
    and r.status = 'awaiting_client'
    and r.composition_revision = i.composition_revision
  order by r.round_number desc
  limit 1;

  if not found then
    return 'unavailable';
  end if;

  update public.review_rounds
  set status = 'client_approved', decided_at = now(), decision_display_name = v_display_name
  where id = v_round_id and status = 'awaiting_client';

  if not found then
    return 'unavailable';
  end if;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (null, 'review_decision_received', 'review_rounds', v_round_id, jsonb_build_object('invite_id', v_invite_id, 'decision', 'approved', 'source', 'preview_link'));

  return 'ok';
end;
$$;

revoke all on function public.submit_review_approval(text, text) from public;
grant execute on function public.submit_review_approval(text, text) to anon, authenticated;

-- submit_review_changes() — p_items is a jsonb array of
-- {category, section_id, message} objects, already validated (length,
-- category allowlist, section-id existence in the invitation's own
-- composition) by the trusted server route BEFORE this function is ever
-- called (Part D: strict Zod validation is the primary gate — see
-- src/lib/review-client.server.ts). The CHECK constraints on
-- review_feedback_items are a hard backstop, not the primary
-- enforcement, the same division composition validation already uses
-- between Zod and admin_save_invite_composition().

create or replace function public.submit_review_changes(p_token text, p_items jsonb, p_display_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_round_id uuid;
  v_display_name text;
  v_item jsonb;
  v_count integer;
begin
  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_display_name is not null and char_length(v_display_name) > 100 then
    v_display_name := left(v_display_name, 100);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 'unavailable';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  if v_count < 1 or v_count > 10 then
    return 'unavailable';
  end if;

  select i.id into v_invite_id
  from public.invite_previews p
  join public.invites i on i.id = p.invite_id
  where p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null;

  if not found then
    return 'unavailable';
  end if;

  select r.id into v_round_id
  from public.review_rounds r
  join public.invites i on i.id = r.invite_id
  where r.invite_id = v_invite_id
    and r.status = 'awaiting_client'
    and r.composition_revision = i.composition_revision
  order by r.round_number desc
  limit 1;

  if not found then
    return 'unavailable';
  end if;

  update public.review_rounds
  set status = 'changes_requested', decided_at = now(), decision_display_name = v_display_name
  where id = v_round_id and status = 'awaiting_client';

  if not found then
    return 'unavailable';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.review_feedback_items (review_round_id, invite_id, category, section_id, message, display_name)
    values (
      v_round_id,
      v_invite_id,
      nullif(v_item ->> 'category', ''),
      nullif(v_item ->> 'sectionId', ''),
      v_item ->> 'message',
      v_display_name
    );
  end loop;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (null, 'review_decision_received', 'review_rounds', v_round_id, jsonb_build_object('invite_id', v_invite_id, 'decision', 'changes_requested', 'source', 'preview_link', 'item_count', v_count));

  return 'ok';
end;
$$;

revoke all on function public.submit_review_changes(text, jsonb, text) from public;
grant execute on function public.submit_review_changes(text, jsonb, text) to anon, authenticated;

-- =======================================================================
-- 7. admin_save_invite_composition() — gains meaningful-change detection
--    (Part H: "saving identical normalized composition content should
--    not create a false revision") and automatic review-round
--    supersession on a MEANINGFUL save (Part H: "a meaningful save while
--    a review is active must supersede that review").
--
--    Return type changes from `text` to `jsonb` — carrying back the
--    invitation's ACTUAL resulting revision, which a caller can no
--    longer safely compute as `p_expected_revision + 1` now that a
--    no-op save doesn't increment it. Same SQLSTATE 42P13 lesson as
--    every other signature/return-type change in this project: `drop
--    function` first. `{"result": "ok"|"stale"|"not-found", "revision":
--    <int, null on not-found>}`.
--
--    Uses `select ... for update` to read-then-conditionally-write the
--    current row atomically (replacing the prior single guarded UPDATE,
--    which had no way to also decide whether to increment) — still a
--    proper compare-and-swap: the row lock is held for the remainder of
--    this function's transaction, so a concurrent caller blocks until
--    this one commits, then sees the new composition_revision and
--    correctly fails its own `p_expected_revision` check.
--
--    Supersession only reaches a round in a NON-terminal status
--    (resolved/superseded/cancelled rounds are already finished and are
--    left alone). A round that was 'client_approved' gets a SECOND,
--    distinct audit event (Part K lists "review superseded" and
--    "current-version approval invalidated by composition change" as
--    separate items) — the approval is what made the invitation
--    publishable a moment ago, so losing it is worth its own record.
-- =======================================================================

drop function if exists admin_save_invite_composition(uuid, jsonb, integer, text, text);

create or replace function public.admin_save_invite_composition(
  p_invite_id uuid,
  p_composition jsonb,
  p_expected_revision integer,
  p_occasion text default null,
  p_occasion_custom_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current record;
  v_changed boolean;
  v_new_revision integer;
  v_superseded record;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may save an invitation composition';
  end if;

  if p_occasion is not null and not exists (select 1 from public.event_types e where e.id = p_occasion) then
    raise exception 'unknown event type: %', p_occasion;
  end if;

  select composition, occasion, occasion_custom_label, composition_revision
  into v_current
  from public.invites
  where id = p_invite_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not-found', 'revision', null);
  end if;

  if v_current.composition_revision <> p_expected_revision then
    return jsonb_build_object('result', 'stale', 'revision', v_current.composition_revision);
  end if;

  v_changed := (v_current.composition is distinct from p_composition)
    or (v_current.occasion is distinct from p_occasion)
    or (v_current.occasion_custom_label is distinct from p_occasion_custom_label);

  if not v_changed then
    return jsonb_build_object('result', 'ok', 'revision', v_current.composition_revision);
  end if;

  perform set_config('enveloped.composition_action', 'granted', true);

  v_new_revision := v_current.composition_revision + 1;

  update public.invites
  set composition = p_composition,
      occasion = p_occasion,
      occasion_custom_label = p_occasion_custom_label,
      composition_revision = v_new_revision,
      updated_at = now()
  where id = p_invite_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'composition_save', 'invites', p_invite_id, jsonb_build_object('new_revision', v_new_revision));

  for v_superseded in
    select id, status from public.review_rounds
    where invite_id = p_invite_id
      and status in ('draft', 'ready_to_send', 'awaiting_client', 'changes_requested', 'client_approved')
  loop
    update public.review_rounds
    set status = 'superseded', superseded_at = now()
    where id = v_superseded.id;

    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'review_round_superseded', 'review_rounds', v_superseded.id, jsonb_build_object('invite_id', p_invite_id, 'new_revision', v_new_revision));

    if v_superseded.status = 'client_approved' then
      insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
      values (auth.uid(), 'review_approval_invalidated', 'review_rounds', v_superseded.id, jsonb_build_object('invite_id', p_invite_id, 'new_revision', v_new_revision));
    end if;
  end loop;

  return jsonb_build_object('result', 'ok', 'revision', v_new_revision);
end;
$$;

revoke all on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) from public;
grant execute on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) to authenticated;
revoke execute on function public.admin_save_invite_composition(uuid, jsonb, integer, text, text) from anon;

-- =======================================================================
-- 8. publish_invite() — gains a concierge-only approval gate (Part I).
--    Signature and return type are UNCHANGED (still `(uuid) returns
--    boolean`), so `create or replace` alone is sufficient — no drop
--    needed. Self-service invitations (generator_kind is null) hit
--    NONE of the new checks below; their publish behavior is byte-for-
--    byte identical to Stage 3/8 (Part I: "preserve legitimate existing
--    self-service publication behavior").
--
--    Readiness (schema validity, blocking placeholders, required
--    headline/date) is deliberately NOT re-implemented here — that
--    logic has only ever lived in TypeScript (src/lib/composition/
--    readiness.ts), consulted by the publishInvitation() wrapper BEFORE
--    this function is ever called, the same division composition SHAPE
--    validation already uses (Zod in TypeScript; this function never
--    re-validates composition shape either). What genuinely IS
--    table-state, and therefore checked here as the actual security
--    boundary (defending against a direct RPC call that skips the
--    TypeScript wrapper, not just a well-behaved caller): a
--    client-approved round for the CURRENT revision, and no unresolved
--    change request.
-- =======================================================================

create or replace function public.publish_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generator_kind text;
  v_revision integer;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may publish an invitation';
  end if;

  select generator_kind, composition_revision into v_generator_kind, v_revision
  from public.invites where id = p_invite_id;

  if not found then
    return false;
  end if;

  if v_generator_kind = 'concierge' then
    -- Checked first, and with its own specific message: under the "one
    -- active round" constraint (section 1) a changes_requested round is
    -- also, by definition, not a client_approved one, so this case would
    -- otherwise be masked by the more generic "no approval" message
    -- below. Kept as an explicit, separately-reachable check rather than
    -- relying on that constraint always holding — defense in depth, the
    -- same reasoning applied throughout this project.
    if exists (
      select 1 from public.review_rounds
      where invite_id = p_invite_id and status = 'changes_requested'
    ) then
      raise exception 'there is an unresolved change request for this invitation — resolve it before publishing';
    end if;

    if not exists (
      select 1 from public.review_rounds
      where invite_id = p_invite_id and status = 'client_approved' and composition_revision = v_revision
    ) then
      raise exception 'this invitation has no client approval for its current version — it cannot be published yet';
    end if;
  end if;

  perform set_config('enveloped.publish_action', 'granted', true);

  update public.invites
  set published_at = now()
  where id = p_invite_id;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'invitation_published', 'invites', p_invite_id, jsonb_build_object('generator_kind', v_generator_kind, 'revision', v_revision));

  return found;
end;
$$;

revoke all on function public.publish_invite(uuid) from public;
grant execute on function public.publish_invite(uuid) to authenticated;
revoke execute on function public.publish_invite(uuid) from anon;

-- unpublish_invite() — untouched in behavior, but gains the same audit
-- event Part K asks for ("unpublication where relevant"). Historical
-- review records are never touched by unpublishing — nothing below
-- references review_rounds/review_feedback_items at all.

create or replace function public.unpublish_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may unpublish an invitation';
  end if;

  perform set_config('enveloped.publish_action', 'granted', true);

  update public.invites
  set published_at = null
  where id = p_invite_id;

  if found then
    insert into public.admin_audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'invitation_unpublished', 'invites', p_invite_id, '{}'::jsonb);
  end if;

  return found;
end;
$$;

revoke all on function public.unpublish_invite(uuid) from public;
grant execute on function public.unpublish_invite(uuid) to authenticated;
revoke execute on function public.unpublish_invite(uuid) from anon;

-- =======================================================================
-- 9. admin_invite_has_preview_link(p_invite_id) — a correction, found
--    during this stage's own visual review, to a genuine pre-existing
--    gap: src/lib/invitation-admin.server.ts's getAdminInvitationDetail()
--    (Stage 8) has always read `invite_previews` through the ordinary
--    session-aware client, but that table deliberately carries NO
--    policy for any role at all (20260910120000_private_preview_links.sql
--    section 1: "token_hash is never reachable through PostgREST's
--    ordinary table endpoint... for any caller, admin included") — so
--    that read has always returned nothing, meaning `hasPreviewLink` has
--    always silently reported `false` even when an active link exists.
--    The fix is NOT a blanket admin SELECT policy on invite_previews
--    (that would make token_hash itself reachable via a raw
--    `.select("token_hash")` from an admin's own client, directly
--    contradicting the table's own stated design) — it is this narrow,
--    boolean-only function, the same "function-mediated, not policy-
--    mediated, when the underlying table has a sensitive column" shape
--    already used by get_invite_preview() itself.
-- =======================================================================

create or replace function public.admin_invite_has_preview_link(p_invite_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_admin() and exists (
    select 1 from public.invite_previews where invite_id = p_invite_id and revoked_at is null
  );
$$;

revoke all on function public.admin_invite_has_preview_link(uuid) from public;
grant execute on function public.admin_invite_has_preview_link(uuid) to authenticated;
revoke execute on function public.admin_invite_has_preview_link(uuid) from anon;
