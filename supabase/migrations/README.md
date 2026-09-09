# Migration workflow

## Verified applying cleanly, in order, to an empty database (Stage 1, 2026-09-09)

All seven files below now apply cleanly, in order, to a fresh local
Postgres — proven repeatedly by `npm run test:db` / `npm run db:reset`
(see `tests/integration/README.md`), not just asserted. Getting here
required one real fix: `20260905091530_generator_payment_publish_split.sql`'s
`get_published_invite()` redefinition failed against real Postgres with
`cannot change return type of existing function (SQLSTATE 42P13)` —
`create or replace function` cannot change an existing function's
`returns table (...)` shape (7 columns → 10 columns here); a `drop
function if exists get_published_invite(text);` was missing before it.
Added, with the function's body left exactly as it was (still verified
against the live project's `pg_get_functiondef()` output from Stage 0) —
see that file's own header for the full account. This is exactly the
class of error a from-scratch replay catches and a read-only introspection
diff (Stage 0's own validation method) cannot, since the live database
never had to replay its own history from empty — it just already was
whatever it was.

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
| `20260909120000` | `admin_identity` | **Stage 2, local-only** — written new, not reconstructed. NOT applied to the live project (`ravfwnqfxngphncuyyxo`) as of this writing; verified only against the local Supabase stack. See "Bootstrapping the first administrator" below and PROJECT_STATUS.md's Stage 2 section. |
| `20260909150000` | `publication_payment_split` | **Stage 3, local-only** — written new, not reconstructed. NOT applied to the live project as of this writing. Corrects the Stage-0-documented payment/publication coupling defect: `published_at` becomes the sole public-access gate. See PROJECT_STATUS.md's Stage 3 section (publication/payment lifecycle, legacy backfill rule, production rollout requirements). |

The first seven filenames match the versions recorded in the live
project's `schema_migrations` table exactly. Every table, column
(including exact ordinal position), constraint, foreign key, index,
function, and trigger declared across those seven files was cross-checked
against a fresh read-only introspection of the live database
(`ravfwnqfxngphncuyyxo`) on 2026-09-09 and matches with no unexplained
extras on either side — see PROJECT_STATUS.md's Stage 0 section for the
full validation record. The eighth (`admin_identity`) is different in
kind from the first seven: it is a genuinely NEW, forward-only migration
this project authored, not a reconstruction of something already live —
see PROJECT_STATUS.md's Stage 2 section for why it hasn't been applied to
the live project yet and what applying it there will require.

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

As of Stage 1 (2026-09-09), a local Supabase stack IS available in this
repository — `supabase/config.toml`, `npm run db:start`, `npm run
db:reset` — see `tests/integration/README.md` for the full workflow.
This project is still NOT linked to the live project via `supabase link`
(no `.supabase/` directory), and no command in `package.json` or this
repository applies anything to it. Add a new versioned file here
following the naming convention, verify it against the local stack
(`npm run db:reset`, `npm run test:db`), get it reviewed, and only then
apply it manually against the live project (or a branch/preview project)
the same way every migration through `20260905091530` has been applied —
then keep this table current.

`20260909120000_admin_identity.sql` (Stage 2) and
`20260909150000_publication_payment_split.sql` (Stage 3) are the first
migrations written this way: authored fresh, verified repeatedly against
the local stack, and deliberately left unapplied to the live project
pending owner review — see below, and PROJECT_STATUS.md's Stage 3
section ("Production rollout and rollback") for what applying the second
one specifically will require.

## Bootstrapping the first administrator

`app_admins` has no INSERT policy for any role, including an existing
administrator's own client — this is deliberate (see the migration's own
comments) and means there is exactly one way to grant admin membership:
a direct write with a connection that bypasses RLS, run by a trusted
human with direct database access. There is no in-app "become an admin"
flow, and there must never be one that runs with anything less than this
level of trust.

**Never commit the real UUID, or any other identifying value, used in
this procedure.** The placeholder UUID below (`00000000-...`) is not a
real user — replace it locally, run the statement, and discard it; it
never belongs in a commit, an issue, a chat log, or this file.

1. **The person becoming the first administrator must already have a
   real Supabase Auth account** — sign in once via the app's existing
   magic-link flow (`/login`) against the target project (local or live)
   so a genuine `auth.users` row exists for them.
2. **Find their `auth.users.id`** without ever pasting it anywhere
   persistent:
   - Live project: Supabase Dashboard → Authentication → Users, or, via
     the SQL Editor (service-role/owner access only):
     ```sql
     select id, email from auth.users where email = 'the-admin@example.com';
     ```
   - Local project: `select id, email from auth.users where email = '...';`
     against `postgresql://postgres:postgres@127.0.0.1:55322/postgres`
     (the local-only, non-secret default credential Supabase's CLI
     itself prints — see `tests/integration/README.md`), or via
     `createTestUser()`/`grantAdmin()` in a throwaway script for local
     testing (see "Verifying an administrator locally" below).
3. **Insert exactly one row**, run directly against the database (SQL
   Editor for the live project; `psql`/the local stack's own tooling for
   local) — never through the anon or authenticated Supabase client,
   which has no path to do this at all:
   ```sql
   insert into app_admins (user_id, note)
   values ('00000000-0000-0000-0000-000000000000', 'initial bootstrap, 2026-09-09, by <operator>');
   ```
   Replace the UUID with the real one from step 2. The `note` is a free-
   text audit trail — record who ran this and when.
4. **Verify it worked** without ever exposing the UUID again: sign in as
   that user and visit `/admin` — a correctly-bootstrapped administrator
   sees the placeholder dashboard, not the access-denied page.

### Adding a future (second, third, ...) administrator

Exactly the same procedure — steps 1–4 above use no assumption that only
one administrator will ever exist. `app_admins.created_by` can optionally
record which existing administrator requested the addition (still a
manual, trusted operation — no self-service admin-inviting flow exists in
this stage or is implied by this design). No schema change is ever
required to add another row.

### Verifying an administrator locally

Against the local stack (`npm run db:start` first):

```bash
docker exec supabase_db_Enveloped psql -U postgres -c \
  "select a.user_id, a.note, u.email from app_admins a join auth.users u on u.id = a.user_id;"
```

Or, for an automated check exercising the real `is_admin()` function and
RLS exactly as the app does, see `tests/integration/admin.test.ts` —
`grantAdmin()` in `tests/integration/helpers/fixtures.ts` is a
service-role insert into `app_admins`, the exact local equivalent of this
section's bootstrap procedure, used throughout that test file.
