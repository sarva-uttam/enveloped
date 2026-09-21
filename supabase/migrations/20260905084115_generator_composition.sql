-- Generator-produced content columns on `invites`.
--
-- RECONSTRUCTED, not original — see 20260905073155_requests_and_templates.sql's
-- header for the full account of why (no original script or source code
-- for this era could be found anywhere searched during Stage 0). Recovers
-- schema_migrations version 20260905084115, name `generator_composition`,
-- by read-only inspection of the live database on 2026-09-09. Adding this
-- file makes no application change.
--
-- Confidence: HIGH for the column/constraint shape (directly queried from
-- the live database). MEDIUM for grouping these five columns under this
-- specific migration name rather than the one before or after it —
-- inferred from ordinal position (occasion through composition are
-- invites' 13th-17th columns, contiguous, immediately after request_id and
-- before published_at/created_by_admin_id) and from the columns' evident
-- purpose matching this migration's recorded name ("generator composition"
-- — the structured content a generator produces, as opposed to
-- publication/payment state, which 20260905091530 adds instead).
--
-- `occasion` — which specific sub-event within a multi-event wedding this
-- invite is for (a single wedding can have several: haldi, sangeet/
-- mehendi, the wedding day itself, the reception). `generator_kind` — a
-- free-text tag identifying which generator produced this invite (the
-- live column comment on created_by_admin_id names one such kind,
-- `invites.server.ts generateHinduInvite`, in the migration that follows
-- this one) — null for a self-service invite. `design_spec` — structured
-- theme/palette/motion parameters chosen for the invite, as opposed to
-- `generator_content`, the generated wording/copy, and `composition`, the
-- assembled structure a renderer consumes (component/section list). None
-- of the three jsonb columns has a CHECK constraint enforcing internal
-- shape live — validation, if any, happened only in the missing
-- application code.
--
-- KNOWN LIMITATION, carried forward unchanged by Stage 0 (see
-- PROJECT_STATUS.md and REVIEW_BRIEF.md): `occasion`'s CHECK constraint
-- below is hardcoded to a Hindu-wedding-specific vocabulary (haldi /
-- sangeet_mehendi / wedding_day / reception) inherited verbatim from the
-- live database. Per explicit product direction, Enveloped's permanent
-- domain model must support general events through reusable cultural
-- packs, with weddings as the primary but not exclusive market — this
-- fixed enum is not that model and is expected to be replaced by a later,
-- non-Stage-0 migration (see PROJECT_STATUS.md's Stage 1 recommendation).
-- It is reproduced as-is here only because Stage 0's scope is describing
-- current live behavior exactly, not correcting it.

alter table invites add column if not exists occasion text;
alter table invites add constraint invites_occasion_check
  check (occasion is null or occasion in ('haldi', 'sangeet_mehendi', 'wedding_day', 'reception'));

alter table invites add column if not exists generator_kind text;
alter table invites add column if not exists design_spec jsonb;
alter table invites add column if not exists generator_content jsonb;
alter table invites add column if not exists composition jsonb;
