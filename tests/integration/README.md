# Database integration tests

Real, repeatable tests that apply every file in `supabase/migrations/` to
a clean, disposable, **local** PostgreSQL/Supabase stack and then verify
actual database behavior — real RLS decisions, real trigger rejections,
real RPC output — as genuine `anon`/`authenticated`/`service_role`
PostgREST callers. Stage 1 of the browser-generator-v2 rebuild
(2026-09-09) built this test system; Stage 2 (same day) extended it to
cover the new administrator identity in `admin.test.ts`; Stage 3 (same
day) extended it again to cover the publication/payment split in
`publication-authorization.test.ts` and `legacy-backfill.test.ts`, and
rewrote `published-invite.test.ts` — see `PROJECT_STATUS.md`'s Stage 1,
2, and 3 sections for the full account, and
`supabase/migrations/README.md` for what each migration file's own
provenance/confidence is.

## Prerequisites

- **Docker**, running and reachable (`docker info` should succeed). On
  Windows, this means Docker Desktop with WSL2 integration enabled for
  whichever distro you run this repo in — see "Troubleshooting" below if
  `docker info` hangs or errors.
- **The Supabase CLI**, installed and on `PATH` (`supabase --version`
  should print something). Install via one of Supabase's official
  methods (Homebrew, the npm-published `supabase` package run through
  `npx`, or the install script) — see
  https://supabase.com/docs/guides/local-development/cli/getting-started.
  Deliberately **not** an npm `devDependency` of this project — it's a
  system tool in the same category as Docker itself, not a library this
  code imports.
- Everything `npm install` already gives you for the rest of the project
  (this stage added exactly two new `devDependencies`: `pg` and
  `@types/pg` — a plain, dependency-free Postgres client, used only for
  direct schema introspection in `schema.test.ts`; nothing else changed).

## Starting the local environment

```bash
npm run db:start
```

Runs `supabase start`, excluding every service these tests don't need
(realtime, storage, image proxy, mailpit/SMTP, the Studio UI, edge
functions, log/vector aggregation, the connection pooler) — only
Postgres, GoTrue (auth), PostgREST, and the Kong gateway that fronts them
actually start. First run pulls several Docker images and can take a
few minutes; later runs are fast.

`supabase/config.toml`'s ports were moved off the CLI's documented
defaults (55321/55322/... instead of 54321/54322/...) — see that file's
own comment and "Troubleshooting" below for why.

## Running the integration tests

```bash
npm run test:db
```

This is `supabase db reset && vitest run --config vitest.integration.config.ts`
— **always resets the local database first**, reapplying all nine
migrations from scratch, then runs every file under `tests/integration/`.
The reset-first behavior is deliberate and is the actual guarantee behind
"a failed test must not leave state that affects the next run": whatever
a previous run left behind (a crashed test, a Ctrl-C mid-suite) is wiped
unconditionally before the next run's assertions execute, independent of
whether that run's own cleanup succeeded. Test files also clean up their
own rows in `afterAll` (see `helpers/fixtures.ts`'s `cleanupRunFixtures()`)
for tidiness across repeated runs against an already-started stack — but
that's a courtesy, not the safety net.

For a faster inner loop while iterating on a test file (skip the reset):

```bash
npx vitest run --config vitest.integration.config.ts
# or, to watch:
npx vitest --config vitest.integration.config.ts
```

To run everything — the fast, dependency-free unit suite AND the
database integration suite:

```bash
npm run test:all
```

## How these tests are guaranteed not to target production

Every test file imports `tests/integration/helpers/local-env.ts` (directly
or through another helper) before doing anything else.
`getLocalSupabaseEnv()`:

1. **Never reads `.env.local`, `.env`, or any `NEXT_PUBLIC_SUPABASE_*` /
   `SUPABASE_*` variable.** Those hold this project's real, live Supabase
   project's credentials — this module has no code path that touches
   them at all, so there is nothing to accidentally fall back to. The
   only source of connection info is `supabase status -o json`: the
   local CLI asking the local Docker daemon what it started.
2. **Refuses to return anything unless every resolved URL's hostname is
   a loopback address** (`127.0.0.1` / `localhost` / `::1`) — a live
   Supabase project is always reachable at `https://<ref>.supabase.co`
   (or a custom domain), never a loopback address, so this check alone
   is already sufficient.
3. **Additionally refuses any URL containing `supabase.co` or
   `supabase.com`**, as pure defense in depth beyond #2.
4. **Throws — does not warn, does not fall back, does not skip — the
   moment any of the above fails.** `tests/integration/setup.ts` calls
   this eagerly before any test file's own code runs, so a
   misconfigured/unavailable local stack fails the whole suite
   immediately and identically, rather than each test discovering the
   same problem separately mid-run.

Combined with the fact that none of the nine migration files in
`supabase/migrations/` were applied to the live project by this
repository's tooling (the first seven document what's already live,
verified read-only; the eighth and ninth, Stage 2's `admin_identity` and
Stage 3's `publication_payment_split`, are new migrations deliberately
left unapplied there — see `supabase/migrations/README.md`) — there is
no command in this repo, this document, or `package.json` that reaches
the live project `ravfwnqfxngphncuyyxo`.

## Resetting / stopping the local environment

```bash
npm run db:reset   # re-applies all migrations to a clean local database, keeps containers running
npm run db:stop     # stops and removes the local containers (--no-backup: no volume is kept around)
```

The local Postgres data directory lives inside a Docker volume Supabase's
CLI manages — `db:stop` with `--no-backup` discards it entirely. There is
no on-disk database file this repository tracks or that Git sees; see
"Confirm no unintended files" below.

## Text-based guards vs. real database integration tests

Two genuinely different kinds of test exist in this repository, and they
answer different questions:

| | `src/lib/rls-policy.test.ts` (`npm test`) | `tests/integration/**/*.test.ts` (`npm run test:db`) |
|---|---|---|
| What it checks | The migration **SQL files' text** — does the right-looking policy/function definition still appear in the file? | **Real Postgres**, after real migrations, queried by real `anon`/`authenticated`/`service_role` clients |
| Can it catch a logic bug inside a correct-looking policy? | No — this is explicit in its own file header | **Yes** — this is the entire reason it exists |
| Needs Docker/Supabase CLI? | No — pure Node, part of the fast default `npm test` | Yes |
| Historical motivation | Round 4/5 (see `REVIEW_BRIEF.md`): a broken RLS policy passed every text-pattern check because the substrings were all present and still evaluated wrong under real RLS-subquery recursion | Closing exactly that gap — real Postgres is the only thing that can prove a policy's actual runtime behavior |

`rls-policy.test.ts` is kept, deliberately, as a fast, dependency-free,
CI-friendly **secondary** guard (catches an accidental revert of an
obviously-wrong pattern, like a stray `using (true)`, without needing
Docker at all) — not replaced. Treat a passing `tests/integration/` run
as the actual proof; a passing `rls-policy.test.ts` alone is not.

## What's tested here

- `schema.test.ts` — every expected table/column (in exact live ordinal
  order)/constraint/foreign key/index/trigger/function exists, with the
  right shape, after a fresh `supabase db reset` — the literal proof that
  all nine migrations apply in order to an empty database and produce
  the schema `supabase/migrations/README.md` claims they do.
- `ownership-rls.test.ts` — raw `invites` is never publicly readable; an
  owner can read/write only their own invite; a different signed-in user
  or anon gets zero rows back, never an error that leaks existence; the
  `paid`/`paypal_order_id` trigger rejects a client's own update but not
  service_role's; `payments` refuses insert/update/delete from anon and
  authenticated alike (read-only, owner-scoped); `requests`/`templates`/
  `invite_payment_records` deny all ORDINARY access (anon/authenticated —
  as of Stage 2 these three do carry policies, but every one is gated on
  `is_admin()`, so this remains true for anyone who isn't an
  administrator; see `admin.test.ts` for the admin-can-access half); a
  third, unrelated authenticated user can't read anything through any of
  these paths either.
- `published-invite.test.ts` — `get_published_invite()`'s sanitized
  payload; `resolve_invite_guest()`'s exact-match resolution;
  `can_insert_rsvp()`'s RSVP rules. As of Stage 3, gated on
  `published_at`, not `paid` — this file was fully rewritten that stage
  to cover all four paid × published combinations explicitly (its
  previous version contained three tests that intentionally asserted the
  Stage-0-documented coupling DEFECT as current behavior; per this
  project's own convention, those were rewritten, not silently deleted,
  once the defect was actually fixed — see git history / PROJECT_STATUS.md's
  Stage 3 section for the before/after).
- `publication-authorization.test.ts` (Stage 3) — who can change
  `published_at`, and how: an invite's own owner cannot set or clear it
  via a raw update (the trigger rejects it); an ordinary authenticated
  user and anon cannot call `publish_invite()`/`unpublish_invite()` at
  all; an administrator CAN publish/unpublish via those RPCs, even an
  invite they don't own and even if it's unpaid; publishing/unpublishing
  never changes `paid`; a service-role payment update never changes
  `published_at`; both RPCs fail safely (return `false`, not an error)
  for a non-existent invitation id. Also proves the harder property: even
  an ADMINISTRATOR's own client cannot set `published_at` via a raw table
  update, only through the two sanctioned functions — see
  PROJECT_STATUS.md's Stage 3 section ("A gap found and closed while
  writing this migration") for why that distinction needed its own fix
  and its own test.
- `legacy-backfill.test.ts` (Stage 3) — extracts the exact SQL between
  the `-- BEGIN LEGACY BACKFILL` / `-- END LEGACY BACKFILL` markers in
  `20260909150000_publication_payment_split.sql` (not a hand-copied
  re-implementation) and re-runs it against rows seeded fresh on the
  local stack, shaped like each documented legacy scenario: paid
  non-generator with/without a matching captured payment (prefers the
  payment's `updated_at`, falls back to the invite's own), a paid
  generator invite with no `published_at` (stays private), a generator
  invite that already has `published_at` (untouched), and an unpaid
  invite (never auto-published). Never touches — and per Stage 3's
  safety restrictions, must never touch — any live row.
- `admin.test.ts` (Stage 2) — the administrator identity/authorization
  boundary: anon and an ordinary authenticated user both report
  `is_admin() = false`; a service-role insert into `app_admins` (the only
  way admin membership can ever be granted — see
  `supabase/migrations/README.md`'s bootstrap section) makes a user report
  `true`; an administrator can select/insert/update/delete on
  `requests`/`templates`/`invite_payment_records`, an ordinary
  authenticated user and anon cannot; no client — including an
  administrator's own — can insert, update, or delete an `app_admins` row
  under any circumstance, proving admin membership can't be granted or
  revoked through normal client-facing RLS access, even by an existing
  administrator; `app_admins` content never appears in
  `get_published_invite()`'s response. This file exercises the database
  directly (as anon/authenticated/admin PostgREST callers) — it does not
  go through the Next.js app or `/admin` at all; the app's own
  `checkAdmin()` orchestration is covered separately by
  `src/lib/auth/admin.server.test.ts` (a fast, mocked unit test, part of
  `npm test`, not this suite).

## Troubleshooting (WSL / Docker)

**`supabase start` fails with `ports are not available: exposing port
TCP 0.0.0.0:54322 -> 127.0.0.1:0: /forwards/expose returned unexpected
status: 500`** (or the same error for 54321/54323/etc.) — this is what
this repository's own `supabase/config.toml` port choice (55321/55322/...
instead of the CLI's 54321/54322/...) exists to route around. It showed
up during Stage 1 development on this exact machine: a raw
`docker run -p 54322:5432 ...` failed with the identical error even
completely outside `supabase start`, while an arbitrary unrelated port
succeeded immediately — meaning something else already had Docker
Desktop's port-forwarding layer holding that specific port (most likely:
another local Supabase project's stack, at its own default port, on the
same shared Docker Desktop host — Docker Desktop's engine is shared
across every WSL distro that uses it, so a stack started from a
completely different project/terminal can still collide here). If you
hit this on a *different* port than the ones already reassigned in
`supabase/config.toml`:
1. Check what else might be running a local Supabase stack:
   `supabase status` in any other project directory on this machine, or
   just try binding that exact port with `docker run --rm -p <port>:1 alpine:3 true` outside any project — if that alone fails the same way, it confirms this is a host-level reservation, not this repo's fault.
2. Reassign the colliding port in `supabase/config.toml` to something
   else unused (this repo's own db/api ports already live in the 55xxx
   range specifically to reduce the odds of this).
3. `npm run db:stop` then `npm run db:start` again.

**`docker info` hangs, errors, or the Docker CLI can't reach a daemon at
all** — on WSL2, this almost always means Docker Desktop's WSL
integration isn't enabled for this distro. In Docker Desktop: Settings →
Resources → WSL Integration → enable the toggle for this distro → Apply
& Restart. If Docker Desktop's own backend process is unhealthy (a
documented historical failure mode for this project specifically — see
`REVIEW_BRIEF.md`'s "Round 5" note, where Docker Desktop's backend
process was found exiting roughly 60 seconds after every launch,
consistent with missing virtualization support in that environment at
the time), restarting Docker Desktop and re-checking
`wsl --status`/virtualization settings (Windows Features → "Virtual
Machine Platform" and "Windows Subsystem for Linux" both enabled,
hardware virtualization on in BIOS/UEFI) is the standard next step.
Confirm recovery with a plain `docker run --rm hello-world` before
retrying `npm run db:start` — that command needs nothing from this
repository and isolates "is Docker itself working" from "is Supabase's
stack working."

**A previous run's containers are still around and something looks
stuck** — `npm run db:stop` (discards the local volume too, via
`--no-backup`), then `npm run db:start` for a fully fresh stack. Since
the local database is disposable by design, there is never a reason to
debug its state in place — reset it instead.

**`supabase status` / `getLocalSupabaseEnv()` fails inside a test run**
— almost always means the stack isn't started, or was stopped between
`db:start` and running tests. Run `npm run db:start` (or just
`npm run test:db`, which resets/(re)creates the schema itself, but still
needs the containers already running — `db:reset` does not start them
from cold).
