-- Stage 6, Part C — culturally extensible event/wedding model.
--
-- Replaces the permanent Hindu-wedding-only constraint on
-- `invites.occasion` (a hardcoded CHECK against exactly four values —
-- `haldi`/`sangeet_mehendi`/`wedding_day`/`reception`, inherited verbatim
-- from the live database by Stage 0 and flagged there as a KNOWN
-- LIMITATION — see 20260905084115_generator_composition.sql's own
-- header) with a general, extensible EVENT TYPE lookup table, so a new
-- vocabulary entry (a Muslim, Christian, civil, or future birthday/
-- corporate event type) is a new ROW, never a new migration.
--
-- Forward-only, purely additive: no existing table, column, policy, or
-- function from any prior migration is altered except the one CHECK
-- constraint this section specifically targets, and the trigger this
-- migration REPLACES it with does not change behavior for any value the
-- old CHECK already accepted (see section 2 below — the four original
-- values are the FIRST four rows seeded into event_types, so every
-- existing `occasion` value in a live database stays valid, unchanged,
-- unreinterpreted, the instant this migration applies).
--
-- Single TypeScript source of truth for this exact vocabulary:
-- src/lib/composition/event-types.ts — see its own header for the full
-- design rationale (why `haldi`/`reception` are kept as first-class
-- while `sangeet_mehendi`/`wedding_day` are flagged legacy-only, why
-- `custom` exists, why this stays capable of birthdays/corporate events
-- later without a schema change). Kept in sync with this migration by
-- convention and by
-- tests/integration/wedding-event-taxonomy.test.ts, which asserts every
-- id in that file has a matching live row and vice versa.

-- ---------------------------------------------------------------------
-- 1. event_types — the lookup table. A stable text id (never a
--    surrogate integer — the id itself IS the portable, human-readable-
--    enough machine identifier every foreign key and Zod enum
--    references directly), a display label (never trusted as anything
--    but presentation text), and an `is_legacy` flag (documentation for
--    future tooling only — never affects validity, see event-types.ts).
--
--    RLS enabled with a single, public SELECT policy — this is
--    reference/vocabulary data, not sensitive in any way (contrast with
--    invite_previews/app_admins, which have NO policy at all): a future
--    admin (or even guest-facing) UI listing available event types needs
--    no special authorization to do so. No insert/update/delete policy
--    for anon or authenticated — seeding/editing this vocabulary is a
--    trusted, migration- or service-role-only operation, matching how
--    `templates`/`requests` are already administrator/service-role-only
--    for writes.
-- ---------------------------------------------------------------------

create table if not exists event_types (
  id text primary key,
  label text not null,
  is_legacy boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table event_types enable row level security;
create policy "event_types public read" on event_types for select using (true);

insert into event_types (id, label, is_legacy, sort_order) values
  ('engagement', 'Engagement', false, 10),
  ('haldi', 'Haldi', false, 20),
  ('mehendi', 'Mehendi', false, 30),
  ('sangeet', 'Sangeet', false, 40),
  ('civil_ceremony', 'Civil Ceremony', false, 50),
  ('religious_ceremony', 'Religious Ceremony', false, 60),
  ('nikah', 'Nikah', false, 70),
  ('wedding_ceremony', 'Wedding Ceremony', false, 80),
  ('reception', 'Reception', false, 90),
  ('dinner', 'Dinner', false, 100),
  ('custom', 'Custom', false, 110),
  -- Legacy — the exact four values the old CHECK constraint enforced,
  -- preserved verbatim so an existing row's occasion stays valid with
  -- no reinterpretation. sangeet_mehendi/wedding_day are flagged
  -- legacy-only (see event-types.ts); haldi/reception are not (kept as
  -- ordinary, first-class entries above, not duplicated here).
  ('sangeet_mehendi', 'Sangeet & Mehendi', true, 200),
  ('wedding_day', 'Wedding Day', true, 210)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. invites.occasion — replace the hardcoded CHECK with a real FOREIGN
--    KEY into event_types. A scalar FK (unlike the array case in
--    section 3 below) is fully supported by Postgres directly — this is
--    the textbook "stable machine identifiers as database truth, an
--    extensible lookup table instead of a hardcoded enum" pattern Part C
--    asks for.
--
--    Dropping the old CHECK and adding the new FK happen together, in
--    the correct order (seed the lookup table FIRST, in section 1 above
--    — already done by the time this section runs), so a live database
--    with existing `haldi`/`sangeet_mehendi`/`wedding_day`/`reception`
--    values never has a moment where those values are invalid: the new
--    FK's referenced rows already exist before the constraint requiring
--    them is even added.
--
--    `occasion_custom_label` — Part C requirement 5, "allow safe custom
--    display labels while keeping stable internal identifiers": a
--    NEW, separate column (occasion itself stays a stable id, never
--    free text) usable only when occasion = 'custom', enforced by its
--    own CHECK — the identical rule the composition Zod schema's
--    WeddingContextSchema.superRefine() also enforces at the
--    application layer (belt and braces, same rule twice, matching this
--    project's established double-enforcement pattern for anything
--    security- or integrity-relevant).
-- ---------------------------------------------------------------------

alter table invites drop constraint if exists invites_occasion_check;

alter table invites add constraint invites_occasion_fkey
  foreign key (occasion) references event_types (id);

alter table invites add column if not exists occasion_custom_label text;

alter table invites add constraint invites_occasion_custom_label_requires_custom
  check (occasion_custom_label is null or occasion = 'custom');

-- ---------------------------------------------------------------------
-- 3. templates.occasion — the same hardcoded CHECK, on the (currently
--    unread by any application code — see Stage 0's own note)
--    `templates` catalogue. Same fix, same reasoning as section 2: a
--    scalar FK replaces the CHECK, and since the four original values
--    are already seeded (section 1), no existing row's `occasion`
--    becomes invalid.
-- ---------------------------------------------------------------------

alter table templates drop constraint if exists templates_occasion_check;

alter table templates add constraint templates_occasion_fkey
  foreign key (occasion) references event_types (id);

-- ---------------------------------------------------------------------
-- 4. requests.requested_occasions — a text ARRAY, which Postgres cannot
--    constrain with a plain FOREIGN KEY (FKs only ever reference a
--    single scalar value per row, never validate each element of an
--    array column). A BEFORE INSERT OR UPDATE trigger is the standard
--    substitute: validates every element against event_types.id,
--    raising an exception naming the first invalid one found, exactly
--    mirroring what a FK violation would communicate for the scalar
--    case above.
--
--    Replaces requests' own hardcoded CHECK
--    (`requested_occasions <@ array['haldi', 'sangeet_mehendi',
--    'wedding_day', 'reception']`) with the same extensible vocabulary —
--    same "preserve legacy values, migrate safely" guarantee: every
--    existing requests row's requested_occasions values are already
--    valid event_types ids (seeded in section 1), so this trigger
--    accepts every pre-existing row unchanged the instant it's created.
-- ---------------------------------------------------------------------

create or replace function public.check_requested_occasions_valid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad text;
begin
  select o into bad
  from unnest(new.requested_occasions) as o
  where not exists (select 1 from public.event_types e where e.id = o)
  limit 1;

  if bad is not null then
    raise exception 'unknown event type: %', bad;
  end if;

  return new;
end;
$$;

alter table requests drop constraint if exists requests_requested_occasions_check;

drop trigger if exists requests_check_occasions on requests;
create trigger requests_check_occasions
  before insert or update on requests
  for each row execute function public.check_requested_occasions_valid();
