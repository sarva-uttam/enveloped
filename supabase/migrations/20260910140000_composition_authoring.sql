-- Stage 6, Part G/H — server-side composition authoring, and protecting
-- generator-controlled fields from direct owner/browser modification.
--
-- Forward-only, additive except for the one trigger function this
-- extends (same "create or replace function" in-place update pattern
-- Stage 3 already used for the identical reason — see
-- 20260909150000_publication_payment_split.sql's own header). No
-- existing table, policy, or RPC's PUBLIC behavior changes: get_published_invite()
-- is untouched (it already returns `composition`, added defensively by
-- Stage 3 before any application code read it); only get_invite_preview()
-- (Stage 5) gains one new returned column.

-- ---------------------------------------------------------------------
-- 1. Extend the existing payment/publication trigger to also protect
--    the generator-controlled columns: composition, design_spec,
--    generator_content, generator_kind, occasion, occasion_custom_label.
--
--    `invites`' owner-scoped UPDATE policy
--    (20260901114159_auth_ownership.sql, "invites owner update") is
--    ROW-scoped only (`using/with check (auth.uid() = owner_id)`) — it
--    places no restriction on WHICH COLUMNS an owner's own raw
--    `.update()` call can touch. Without this section, an owner could
--    set their own invite's `composition` (or generator_kind, occasion,
--    etc.) to anything at all via an ordinary PostgREST update — exactly
--    the same gap Stage 3 already closed for `paid`/`paypal_order_id`/
--    `published_at` on this identical table, now closed for the
--    generator/composition fields too.
--
--    A THIRD transaction-local flag, `enveloped.composition_action`,
--    independent of `enveloped.publish_action` (Stage 3) — saving a
--    composition and publishing an invitation are different
--    administrator actions, neither should imply the other is also
--    happening (matching this migration's own admin_save_invite_composition()
--    below, which never touches published_at, exactly as
--    publish_invite()/unpublish_invite() never touch composition).
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

  if (new.published_at is distinct from old.published_at)
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('enveloped.publish_action', true), '') <> 'granted' then
    raise exception 'published_at can only be set by an administrator, through publish_invite() or unpublish_invite()';
  end if;

  if (
       new.composition is distinct from old.composition
    or new.design_spec is distinct from old.design_spec
    or new.generator_content is distinct from old.generator_content
    or new.generator_kind is distinct from old.generator_kind
    or new.occasion is distinct from old.occasion
    or new.occasion_custom_label is distinct from old.occasion_custom_label
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('enveloped.composition_action', true), '') <> 'granted' then
    raise exception 'composition and generator fields can only be set by an administrator, through admin_save_invite_composition()';
  end if;

  return new;
end;
$$;

-- Trigger itself is unchanged (still BEFORE UPDATE, still this same
-- function by name) — `create or replace function` above already
-- updates its behavior in place.

-- ---------------------------------------------------------------------
-- 2. admin_save_invite_composition() — the ONE sanctioned way
--    composition (and, alongside it, occasion/occasion_custom_label)
--    is ever set by an interactive session. Same shape as
--    publish_invite()/unpublish_invite(): is_admin() gate (never trust
--    the GRANT alone), SECURITY DEFINER (invites' RLS has no
--    "administrator may update any invite" policy — Stage 2's own
--    deliberate choice, unchanged), set search_path = '' with
--    fully-qualified public.* references, sets the transaction-local
--    flag immediately before its own UPDATE, returns a plain boolean
--    (true if a matching invitation was found and updated, false for a
--    stale/missing id — a data condition, not an authorization
--    failure), EXECUTE granted to authenticated only, explicitly
--    revoked from anon.
--
--    Does NOT validate the shape of p_composition itself — that is
--    src/lib/composition-admin.server.ts's validateComposition()'s job,
--    called BEFORE this function is ever invoked (see that file's own
--    comment on the ordering: authorization first, then validation,
--    then this database call). This function's own job is
--    authorization and the one integrity check a raw jsonb value can't
--    express on its own: p_occasion, if supplied, must be a real,
--    registered event_types id — the same guarantee the FK constraint
--    from 20260910130000_wedding_event_taxonomy.sql gives for a DIRECT
--    write, made explicit here as a clear error message rather than a
--    generic foreign-key-violation one.
--
--    Full-replacement semantics, not a partial patch: every call sets
--    composition/occasion/occasion_custom_label to EXACTLY what was
--    passed (occasion/occasion_custom_label default to null when
--    omitted) — there is no "leave the existing value alone" option.
--    Appropriate for this stage's scope (no partial-update editor UI
--    exists yet); a future editor calling this repeatedly must always
--    pass the complete desired state.
-- ---------------------------------------------------------------------

create or replace function public.admin_save_invite_composition(
  p_invite_id uuid,
  p_composition jsonb,
  p_occasion text default null,
  p_occasion_custom_label text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may save an invitation composition';
  end if;

  if p_occasion is not null and not exists (select 1 from public.event_types e where e.id = p_occasion) then
    raise exception 'unknown event type: %', p_occasion;
  end if;

  perform set_config('enveloped.composition_action', 'granted', true);

  update public.invites
  set composition = p_composition,
      occasion = p_occasion,
      occasion_custom_label = p_occasion_custom_label
  where id = p_invite_id;

  return found;
end;
$$;

revoke all on function public.admin_save_invite_composition(uuid, jsonb, text, text) from public;
grant execute on function public.admin_save_invite_composition(uuid, jsonb, text, text) to authenticated;
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- public.* function to anon/authenticated/service_role by default,
-- independent of the `revoke ... from public` above — same platform
-- correction already documented (and applied) for every admin-only
-- function since Stage 3.
revoke execute on function public.admin_save_invite_composition(uuid, jsonb, text, text) from anon;

-- ---------------------------------------------------------------------
-- 3. get_invite_preview() gains `composition` — Part H: "ensure
--    sanitized public and preview reads return only the composition
--    fields required for rendering." get_published_invite() already
--    returns it (Stage 3); get_invite_preview() (Stage 5) did not yet.
--    Adding a column to `returns table (...)` requires `drop function`
--    first (same SQLSTATE 42P13 lesson from Stage 1's own from-empty
--    replay — see supabase/migrations/README.md); the function BODY
--    otherwise keeps its exact Stage 5 shape and security properties
--    (accepts the raw token, hashes it inside itself via
--    extensions.digest(), never gates on published_at, excludes every
--    private field structurally).
-- ---------------------------------------------------------------------

drop function if exists get_invite_preview(text);

create or replace function public.get_invite_preview(p_token text)
returns table (
  id uuid,
  slug text,
  paid boolean,
  published_at timestamptz,
  tier text,
  content jsonb,
  event_date text,
  song text,
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
    i.published_at,
    i.tier,
    i.content,
    i.answers ->> 'eventDate' as event_date,
    i.answers ->> 'song' as song,
    i.composition
  from public.invite_previews p
  join public.invites i on i.id = p.invite_id
  where p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and p.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
