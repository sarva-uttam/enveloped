# Migration workflow

## What's authoritative

**This directory (`supabase/migrations/*.sql`) is the versioned, ordered
source of truth for the schema.** `supabase/schema.sql` is a generated,
read-only reference snapshot for humans — never hand-edit it, never apply
it directly, and never treat it as a migration. If the two ever disagree,
this directory wins; regenerate `schema.sql` to match.

Filenames follow Supabase's convention: `YYYYMMDDHHMMSS_name.sql`, applied
in filename order. The fourteen-digit prefix is also what the live
project's `schema_migrations` table records as that migration's version.

## Current state (as of Stage 0, 2026-09-09)

| Version | Name | Status |
|---|---|---|
| `20260825050021` | `enveloped_invites_schema` | Applied live. File **reconstructed** — see its header. |
| `20260901114121` | `payment_gating` | Applied live. File **reconstructed** (sourced from schema.sql's own prior inline copy) — see its header. |
| `20260901114159` | `auth_ownership` | Applied live 2026-09-01. File **renamed** from `20260828000000_auth_ownership.sql`; SQL body unchanged. |
| `20260901114212` | `payment_integrity` | Applied live 2026-09-01. File **renamed** from `20260829000000_payment_integrity.sql`; SQL body unchanged. |
| `20260905073155` | `requests_and_templates` | Applied live on or before 2026-09-05. File **reconstructed** from live introspection — see its header. |
| `20260905084115` | `generator_composition` | Applied live on or before 2026-09-05. File **reconstructed** — see its header. |
| `20260905091530` | `generator_payment_publish_split` | Applied live on or before 2026-09-05. File **reconstructed** — see its header. |

All seven filenames now match the versions recorded in the live project's
`schema_migrations` table exactly. Every table, column (including exact
ordinal position), constraint, foreign key, index, function, and trigger
declared across these seven files was cross-checked against a fresh
read-only introspection of the live database (`ravfwnqfxngphncuyyxo`) on
2026-09-09 and matches with no unexplained extras on either side — see
PROJECT_STATUS.md's Stage 0 section for the full validation record.

**"Reconstructed" means:** no original migration script or authored
source ever existed in any retrievable location for that change (see
PROJECT_STATUS.md — "Missing browser-generator-v1 source"). The file's
*end-state* SQL is verified byte-for-byte against live
`information_schema`/`pg_catalog` introspection (tables, columns, ordinal
positions, constraints, indexes, function bodies, the trigger). What
is **not** independently verifiable is which exact statements the
*original* author grouped into which of the three 2026-09-05 migrations —
`schema_migrations` records three distinct versions from that date but
not their individual statement bodies. The grouping used here is inferred
from column ordinal position (which lines up exactly with the three
recorded versions in sequence) and from each migration's recorded name
matching the purpose of the objects assigned to it. Each reconstructed
file's header states its confidence level and reasoning explicitly.

The one further-back item that could not be reconstructed with the same
confidence: the *exact original* `using (true)` / `with check (true)`
policy text and predicate wording in `20260825050021_enveloped_invites_schema.sql`.
These objects were superseded (dropped) by `20260901114159_auth_ownership.sql`
before this Stage 0 reconciliation, so no live introspection can recover
them — only the `drop policy if exists "..."` statements already present
in `20260901114159_auth_ownership.sql` (which name every policy that
migration expected to find) and PROJECT_STATUS.md's own prior narrative
description of that state. This is flagged MEDIUM confidence in that
file's own header, not HIGH.

## What Stage 0 deliberately did NOT do

- **No new behavioral migration.** Every statement in the newly-added or
  reconstructed files describes something that was already true on the
  live database before Stage 0 started. Nothing was applied, changed, or
  corrected on the live project as part of writing these files.
- **No `supabase migration repair`.** This project does not use the
  Supabase CLI's linked-migration workflow (`supabase db push` /
  `supabase migration up`) — every migration to date was applied via the
  Supabase dashboard/MCP `apply_migration`, not the CLI, and no
  `supabase/config.toml` linking this repo to the project exists.
  `migration repair` only matters once the CLI's own local
  `supabase_migrations.schema_migrations` bookkeeping needs to be told
  "these versions are already applied, don't re-run them" — that
  bookkeeping is unrelated to renaming local `.sql` files, which never
  touches the live database at all. If this project adopts
  `supabase db push` in the future, running `supabase migration repair`
  first (to confirm the CLI's local state agrees with the seven versions
  above) is the right next step — but proving that is necessary and safe
  is future work, not part of Stage 0.
- **No RLS policy was added to `requests`, `templates`, or
  `invite_payment_records`.** All three have RLS enabled with zero
  policies live today, which Postgres treats as deny-all for every role
  except the service-role client. That is preserved exactly. An admin
  access policy for these tables is a real, tracked future requirement
  (see PROJECT_STATUS.md's Stage 1 recommendation), not something Stage 0
  should improvise.
- **The known publication/payment coupling defect in `get_published_invite()`
  is reproduced verbatim, not fixed.** See
  `20260905091530_generator_payment_publish_split.sql`'s header and
  PROJECT_STATUS.md for the full description.
- **The Hindu-wedding-specific `occasion` vocabulary
  (`haldi`/`sangeet_mehendi`/`wedding_day`/`reception`) is reproduced
  verbatim, not generalized.** Per current product direction this is not
  the permanent domain model — see the `generator_composition` migration's
  header and PROJECT_STATUS.md.

## Applying a future migration

There is currently no local Supabase stack or CLI project link in this
repository (no `supabase/config.toml`, and Docker-based local Postgres was
previously found unavailable in this environment — see REVIEW_BRIEF.md's
"Round 5" note). Until that changes, add a new versioned file here
following the naming convention, get it reviewed, and apply it manually
against the live project (or a branch/preview project) the same way every
migration to date has been applied — then keep this table current.
