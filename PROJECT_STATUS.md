# Enveloped — Project Status & Handoff Notes

Enveloped is an AI-crafted digital invite platform for weddings and events
(Next.js 16 App Router, Supabase backend, PayPal payments, multilingual UI).
This file exists so a fresh session picking up this repo has the context
that would otherwise only live in prior chat history.

**This is now the only working folder for this project.** The personal
portfolio (`uttam-torry-portfolio` / github.com/monsieur-zordi/uttam-torry-portfolio)
is a separate, unrelated site now managed by someone else — disregard it
when working here.

## What's built

- Landing page, dashboard, invite viewer, survey flow, templates, pricing,
  and how-it-works pages
- AI content generation via `src/app/api/generate/route.ts` (Vercel AI SDK)
- Supabase for storage (invites, RSVPs) — schema in `supabase/schema.sql`
- **PayPal payment gate**: an invite is preview-only (owner sees the design,
  guests see "not live yet") until it's paid, then guest links unlock
- **Auth & ownership**: Supabase Auth (email magic link) + a real
  `owner_id` on every invite. Creating invites, the dashboard, and owner
  previews all require sign-in; ownership is decided by comparing the
  signed-in user's id to `owner_id` — never by whether a `?guest=` param
  is present. See "Auth & ownership foundation" below for the full detail.
- **i18n**: a client-side language switcher in the navbar — English, French,
  Hindi, Tamil, Telugu, Marathi, Kreol Morisien — currently covers the
  **navbar and hero only**
- Homepage shows tier names/descriptions but not prices; only `/pricing`
  shows dollar amounts
- AI-forward copy was intentionally toned down site-wide — the product is
  AI-generated but that isn't the headline pitch
- Per-invite Open Graph metadata so a shared link previews with a personal
  message instead of a generic URL/title

## Auth & ownership foundation

**What changed and why:** before this, `invites`/`invite_guests`/
`invite_rsvps` had fully public RLS policies (`using (true)`), and the app
decided who was the invite's "owner" by checking whether a `?guest=` query
param was *absent* from the URL — meaning anyone who stripped that param
off a shared guest link saw the owner's management panel, including every
other guest's name and personal link. This batch replaces both.

- **Auth**: Supabase Auth, email magic link (`supabase.auth.signInWithOtp`).
  `/login` requests the link; `/auth/callback` exchanges the code for a
  session. Client-side auth state lives in `AuthProvider`/`useAuth()`
  (`src/lib/auth/AuthContext.tsx`), mirroring the existing `LocaleContext`
  pattern.
- **Ownership**: `invites.owner_id` (uuid, references `auth.users`,
  `default auth.uid()` so a client can never claim ownership on someone
  else's behalf). Ownership is resolved by the pure, unit-tested
  `resolveViewerRole()` in `src/lib/ownership.ts` — it only ever returns
  "owner" when `currentUserId === ownerId`, both non-null.
- **Enforced in three layers**: `src/proxy.ts` optimistically redirects
  unauthenticated `/dashboard` and `/survey` requests to `/login`; the app
  layer double-checks (`getMyInvites()` returns `[]` without a session,
  `saveInvite()` throws `NotAuthenticatedError`); Postgres RLS is the real
  boundary (`supabase/migrations/20260901114159_auth_ownership.sql`) —
  owner-only insert/update/delete on `invites`, owner-only read/write on
  `invite_guests`/`invite_rsvps`.
- **The raw `invites` table has NO public read policy at all — owner-only,
  full stop.** This went through two wrong drafts before landing here,
  worth recording so the reasoning doesn't get re-litigated or
  accidentally reverted:
  1. Original: `using (true)` unconditionally — an UNPAID invite's full
     content was sent to any caller; "This invite isn't live yet" only
     hid it in the UI, never withheld the data.
  2. First fix: `paid = true OR auth.uid() = owner_id` — closed #1, but
     still `select("*")`-shaped. `invites.answers` is the RAW SURVEY
     INPUT, which includes `guestNames` (the host's plain-text guest
     list — a duplicate of what `invite_guests` holds, but never
     protected the same way) plus `partnerNames`/`venue`/`city`/
     `colorMood`/`extraDetails`. A published invite would have shipped
     ALL of that to any guest, regardless of the `invite_guests`/
     `resolve_invite_guest()` lockdown described below — locking down
     one table while leaving a duplicate of the same data sitting
     unprotected in another column.
  3. **Current**: the raw table's only read policy is
     `auth.uid() = owner_id` (owner sees everything, as intended — "may
     still retrieve the full owner record"). Every non-owner read goes
     through `get_published_invite()` instead — a SECURITY DEFINER
     function returning a hand-picked column set (`id`, `slug`, `paid`,
     and — only when `paid = true` — `tier`, `content`, and the two
     `answers` keys the UI actually renders, `eventDate`/`song`, pulled
     via `->>'eventDate'`/`->>'song'`, never the whole `answers` object).
     Postgres RLS is row-level, not column-level, which is exactly why
     draft #2 couldn't be fixed as a table policy — a function that
     selects specific columns is the correct tool once "some columns
     public, others owner-only" is the requirement.
- A guest's own personalized name/teaser (from a `?guest=` link, only on
  a *published* invite) is resolved separately through
  `resolve_invite_guest()` — also fixed this round to add
  `and i.paid = true` to its own `where` clause; it previously had no
  paid check at all, so a guest link to an unpublished invite could still
  resolve a real name/teaser through that RPC even though the UI never
  displayed it for that case.
- `submitRsvp()` used to look up the invite via a direct
  `invites.select("id")` read, which broke once the raw table became
  owner-only (a guest, with no session, would get nothing back) — it now
  resolves the invite through `get_published_invite()` too, which also
  means RSVPs against an unpublished invite are refused outright now, not
  just hidden by the UI.
- **Client/server Supabase separation**: `src/lib/supabase/client.ts`
  (browser, anon key, RLS-respecting, cookie-based session via
  `@supabase/ssr`) vs. `src/lib/supabase/server.ts` (server-only,
  reads the caller's session from cookies, still RLS-respecting) vs.
  `src/lib/supabase/admin.ts` (server-only, service-role, bypasses RLS —
  guarded by the `server-only` package so it can never reach client code).
  The actual read logic (`fetchInvite`/`fetchGuestEntry`) lives once in
  the client-agnostic `src/lib/storage-queries.ts`, taking an injected
  client — `storage.ts` (browser) and `storage.server.ts` (server) are
  thin wrappers around it, so there's exactly one implementation per
  query, not two to keep in sync. Every server-side caller — the PayPal
  `orders` Route Handler, `generateMetadata`, and `markInvitePaid` — now
  goes through `storage.server.ts`; none of them touch the browser client
  anymore (an earlier version of this batch had the PayPal routes and
  `generateMetadata` calling storage.ts's browser-client-backed
  functions from server code, which worked for plain reads only by
  accident of how `@supabase/ssr`'s browser client degrades outside a
  real browser — fully replaced now, not patched).

### Round 4: three more verified issues, fixed before merge

A pre-merge review of `review/auth-ownership-foundation` found three more
real issues — none of them in the "what a guest can read" data-boundary
work above, all in adjacent surfaces the earlier rounds hadn't
scrutinized as closely.

1. **Open redirect via the auth `next` parameter.** `/login?next=...`
   and `/auth/callback?next=...` both took the `next` value straight
   from the URL and used it to build a redirect — a classic
   attacker-controlled input. The specific trick that defeats naive
   `${origin}${next}` string-prefixing: `next = "@evil.com"` turns that
   into `"https://our-site.com@evil.com"`, a syntactically valid URL
   whose actual HOST is `evil.com` (`our-site.com` becomes discarded
   userinfo). Fixed with `sanitizeRedirectPath()`
   (`src/lib/safe-redirect.ts`) — only an absolute internal path starting
   with exactly one `/`, no backslashes, no embedded scheme, and a
   strict safe-character allowlist (notably excluding `@` and `:`) is
   accepted; anything else falls back to `/dashboard`. Both routes now
   validate `next` through this before using it anywhere.
2. **`invite_rsvps` insert policy was unconditional.** `with check
   (true)` — since the anon key is public, anyone could insert an RSVP
   row against ANY `invite_id` (published or not) and cite ANY
   `guest_id` regardless of which invite it actually belonged to. The
   app's `submitRsvp()` already refused to submit against an unpaid
   invite before this fix, but that was a convenience, never a boundary
   — the browser client can be driven directly, bypassing the app
   entirely. The database itself now enforces, independent of the app:
   the referenced invite must be `paid = true`, and a supplied
   `guest_id` (still optional — non-Platinum tiers have no named guest
   list) must belong to that same `invite_id`.
3. **Both SECURITY DEFINER functions used `search_path = public` with
   unqualified table references.** `public` is exactly the schema most
   setups leave writable by ordinary roles — a caller able to create a
   same-named object there could have made either function silently
   operate on their object instead of the real `invites`/`invite_guests`
   ("search_path hijacking"). Both functions now use `search_path = ''`
   (empty) with every table reference fully qualified
   (`public.invites`, `public.invite_guests`) — no unqualified name is
   left for anything to shadow. Their `revoke`/`grant` statements are
   unchanged.

New tests: `src/lib/safe-redirect.test.ts` (26 cases — legitimate paths
pass through, a wide range of malicious `next` values all fall back);
`src/lib/rls-policy.test.ts` gained checks for the empty search_path,
qualified table references, and the new RSVP insert conditions.

### Round 5: the round-4 RSVP fix was itself broken

A further pre-merge review caught that round 4's own fix for the
`invite_rsvps` insert policy didn't work as written — a subtler bug than
any of the previous rounds, worth explaining precisely because it's easy
to reintroduce.

**The bug:** round 4 wrote the paid/guest_id checks as inline `exists
(select 1 from invites ...)` / `exists (select 1 from invite_guests
...)` subqueries directly inside the `invite_rsvps` insert policy's
`with check (...)` expression. That looks reasonable, but it's wrong: an
RLS policy's own subqueries are themselves subject to RLS on whatever
tables they reference. By round 3, `invites` and `invite_guests` are
BOTH owner-only for SELECT — an anonymous guest submitting an RSVP has
literally zero row visibility into either table. So those inline
subqueries would return no rows and the check would evaluate to false
**unconditionally**, for every anonymous RSVP, regardless of whether the
invite was actually paid or the guest_id actually matched. The fix
would have silently broken the RSVP feature for every real guest while
LOOKING correct on inspection (and passing every text-pattern test from
round 4, since those checked for the right substrings being present,
not for whether the substrings would actually evaluate correctly under
RLS).

**The fix:** the exact same pattern already used for
`resolve_invite_guest()`/`get_published_invite()` — wrap the check in a
new SECURITY DEFINER function, `can_insert_rsvp(p_invite_id, p_guest_id)
returns boolean`. Statements inside a SECURITY DEFINER function run
with the privileges of the function's OWNER, not the caller's — and
since that owner also owns `invites`/`invite_guests` (created in the
same migration) and neither table has `FORCE ROW LEVEL SECURITY` set,
the owner bypasses RLS on them entirely for the function's internal
queries. The policy now reads:
`with check (can_insert_rsvp(invite_rsvps.invite_id, invite_rsvps.guest_id))`.
The function itself is hardened the same way as the other two
(`search_path = ''`, fully-qualified `public.invites`/
`public.invite_guests`, explicit `revoke`/`grant`) and returns ONLY a
boolean — never row data.

**On integration testing:** this round's instructions asked for a real
local Supabase/Postgres integration test if available. It genuinely
isn't, in this environment — a documented attempt: Docker Desktop's own
launch log shows `backend process exited` about a minute after starting,
consistent with missing virtualization support in this sandbox; no
standalone `psql`/Postgres install exists either. `rls-policy.test.ts`
gained regression tests for both the specific broken pattern (inline
`exists(...)` in the policy — now explicitly asserted absent) and the
new function's definition, but these remain text-pattern checks, same
caveat as before: they catch someone reintroducing the exact bug this
round fixed, they do not prove the fixed version is correct under real
Postgres. **This is now the single most important thing to verify
against real Postgres before this migration is trusted** — the fact
that round 4's own fix passed review-by-reading and still didn't work
is itself the strongest argument for actually running this, not just
reading it, before it reaches production. Concretely, once a Supabase
project or local `supabase start` is available: try the RSVP insert
policy as the `anon` role directly (not through the app) — a valid
insert against a paid invite with no guest_id should succeed; against a
paid invite with a guest_id from a DIFFERENT invite should fail;
against an unpaid invite should fail.

## Payment integrity foundation (PayPal)

**What changed and why:** before this batch, the PayPal capture route
trusted the client-supplied `inviteId` to decide which invitation to mark
paid, and did no verification of the capture response at all beyond
`status === "COMPLETED"` — no check that the captured order actually
belonged to that invitation, was for the right amount, or was in the
right currency. Concretely, this meant: a captured order for one
invitation could be replayed against a request naming a different
invitation slug; a Bronze-tier ($19) capture could unlock a Platinum
invitation ($149) if the client simply requested a different `inviteId`
at capture time; and nothing in the database structurally stopped an
authenticated owner from calling `.update({ paid: true })` on their own
invite directly via the client SDK, bypassing PayPal entirely (this
specific gap was explicitly flagged as deferred in the auth_ownership
round — see REVIEW_BRIEF.md's prior "Specific areas to scrutinize" #2).

- **New `payments` table**
  (`supabase/migrations/20260901114212_payment_integrity.sql`) — one row
  per PayPal order attempt: `invitation_id`, `owner_id`, `provider`/
  `provider_order_id`/`provider_capture_id`, `tier`, `expected_amount`/
  `captured_amount` (`numeric(10,2)`, not floating point), `currency`,
  `status` (`created`/`processing`/`captured`/`failed`),
  `idempotency_key`, `raw_capture_response`, `failure_reason`,
  timestamps. RLS enabled with an owner-read-only `select` policy and
  **no insert/update/delete policy for anon/authenticated at all** — with
  RLS on and no policy granting a given operation, that operation is
  denied outright for every role except one that bypasses RLS (the
  service-role client). The browser is structurally unable to write to
  this table under any circumstances, not just discouraged from it by
  convention.
- **Closed the "owner flips their own `paid` flag directly" gap**: a new
  `reject_client_paid_update()` trigger function on `invites` raises an
  exception if `paid`/`paypal_order_id` change and the connection isn't
  `service_role` — the one exception being `markInvitePaid()`
  (`storage.server.ts`), which uses the service-role client. This closes
  REVIEW_BRIEF.md's previously-deferred "Specific areas to scrutinize" #2
  at the database level, not just the app layer.
- **Order creation** (`POST /api/paypal/orders`): requires an
  authenticated session and invite ownership (401/403), Zod-validates the
  body (just `inviteId`, matching the invite-slug shape), looks up the
  tier price from the invite's own stored `answers.tier` against the
  fixed `TIERS` table (`src/lib/tiers.ts`) — never from anything the
  client sends — and creates the PayPal order with `custom_id` set to the
  invitation's **internal uuid** (`invites.id`, not the slug), so
  capture-time verification can compare directly against
  `payments.invitation_id` with no extra lookup. Reuses an existing
  `status = 'created'` payment row for the same invitation instead of
  creating a second outstanding PayPal order on a retried click.
- **Capture** (`POST /api/paypal/orders/[orderId]/capture/route.ts` —
  fully rewritten): the invitation this capture affects is now derived
  **only** from the `payments` row looked up by the PayPal order id
  (`getPaymentByOrderId`, `src/lib/payments.server.ts`) — the
  client-supplied `inviteId` in the request body is optional and used for
  nothing but a friendlier early error, never to decide what gets
  unlocked. Flow: 401 if signed out; 404 if the order id matches no
  stored payment (closes "reused/unknown order"); 403 if the caller isn't
  `payment.ownerId` (closes "non-owner pays for/publishes someone else's
  invitation"); an atomic conditional update
  (`claimPaymentForCapture`, `status: 'created' → 'processing'`) claims
  the payment before PayPal is ever called, so a concurrent duplicate
  request (double-click, retry) gets a 409 instead of triggering a second
  capture call; the actual PayPal capture response is run through
  `verifyCaptureResponse()` (`src/lib/paypal-verify.ts`, a pure,
  dependency-free function — see its exhaustive tests in
  `paypal-verify.test.ts`) which checks the order id, `custom_id` (must
  equal `payments.invitation_id`), capture status (`COMPLETED`),
  currency, exact amount (`numeric(10,2)` compared as normalized
  2-decimal strings, so no floating-point rounding gap), and — only when
  `PAYPAL_MERCHANT_EMAIL` is configured — the payee email; any mismatch
  marks the payment `failed` and returns a **generic** client-facing
  error (the specific reason is server-log-only, so a probing attacker
  learns nothing about which check failed).
- **Idempotent by design, including the "PayPal succeeded but the
  database update failed" case**: a payment already `status = 'captured'`
  short-circuits before ever calling PayPal again — it just retries
  `markInvitePaid()` (itself a no-op if already applied) and returns
  success. This is exactly the recovery path if `markPaymentCaptured()`
  landed but the subsequent `invites.paid` flip failed on a prior
  request: the payment row's durable "captured" state survives that
  failure, so a retried capture call for the same order recovers only
  the missing step, without re-contacting PayPal. `markInvitePaid()` was
  changed to key off the invitation's internal uuid
  (`payments.invitation_id`) instead of the slug, matching what the
  capture route now has on hand authoritatively — see
  `storage.server.ts`.
- **PayPal API response shape verified against official docs**
  (developer.paypal.com/api/orders/v2/orders-capture): `custom_id` lives
  on `purchase_units[]`, not on the capture object itself; the capture
  record is `purchase_units[].payments.captures[]` with its own
  `status`/`amount`; payee info is `purchase_units[].payee`.
- **New tests**: `src/lib/paypal-verify.test.ts` (18 cases — every
  verification failure mode: order id mismatch, missing/wrong
  `custom_id`, non-`COMPLETED` status, currency mismatch, amount
  mismatch including a one-cent discrepancy, payee mismatch, and the
  success path); `src/lib/payments.server.test.ts` (every function
  against a mocked service-role client, including the atomic-claim
  win/lose cases); `src/app/api/paypal/orders/route.test.ts` and
  `src/app/api/paypal/orders/[orderId]/capture/route.test.ts`
  (route-handler-level orchestration tests calling `POST` directly with
  mocked dependencies — auth/ownership failures, Zod validation, reused
  order, wrong invitation/amount/currency, duplicate capture in both the
  "already captured" and "concurrently processing" shapes, and both
  database-update-failure branches). `src/lib/storage.server.test.ts`'s
  existing `markInvitePaid` test was updated to match the new
  uuid-keyed behavior.
- **Still sandbox-only, unchanged on purpose**: no live PayPal
  credentials, no code path enabling `NEXT_PUBLIC_PAYPAL_ENV=live`.

## Round 7: all three migrations applied to the live project + verified against real infrastructure (2026-09-01)

The three migrations that every prior round called out as "reviewed but
never run against real Postgres — treat as a pre-production blocker" are
now **applied to the live Supabase project `ravfwnqfxngphncuyyxo`** and
their security-critical behavior has been exercised against the real
database and the real PayPal **sandbox** API — not mocked clients, and
not the privileged admin/MCP connection either (the RLS checks were run
as genuine `anon` / `authenticated` / `service_role` REST callers).

**Applied, in dependency order, via the Supabase MCP `apply_migration`:**

| `schema_migrations` version | name | source |
|---|---|---|
| `20260825050021` | `enveloped_invites_schema` | (pre-existing base tables) |
| `20260901114121` | `payment_gating` | the inline block at the bottom of `supabase/schema.sql` (`paid` / `paypal_order_id` columns) |
| `20260901114159` | `auth_ownership` | `supabase/migrations/20260828000000_auth_ownership.sql`, verbatim (at the time — see the Stage 0 note below) |
| `20260901114212` | `payment_integrity` | `supabase/migrations/20260829000000_payment_integrity.sql`, verbatim (at the time — see the Stage 0 note below) |

> **Migration-history version drift — RESOLVED by the Stage 0
> reconciliation (2026-09-09).** At the time this round ran, `apply_migration`
> had stamped its own timestamps (`20260901…`), which did **not** match
> this repository's `supabase/migrations/*.sql` filenames (`20260828…`,
> `20260829…`), and `payment_gating` had no file at all. Stage 0 renamed
> the two existing files to their recorded versions
> (`20260901114159_auth_ownership.sql`, `20260901114212_payment_integrity.sql`
> — SQL bodies unchanged) and added `20260901114121_payment_gating.sql`.
> All seven live `schema_migrations` versions (this round's four plus
> three more discovered during Stage 0 — see "Stage 0" below) now have a
> matching filename in `supabase/migrations/`. `supabase migration
> repair` was NOT run — proving it unnecessary was part of Stage 0's own
> validation, not assumed; see `supabase/migrations/README.md`.

### Structural confirmation (`information_schema` / `pg_catalog`)

- `invites` now has `owner_id uuid` (default `auth.uid()`, FK →
  `auth.users`, `on delete cascade`), `paid boolean not null default
  false`, `paypal_order_id text`.
- `payments` exists with every column from the migration, including
  `expected_amount` / `captured_amount` as `numeric(10,2)` (verified
  `numeric_precision=10, numeric_scale=2` — the exact-match amount
  comparison genuinely can't be defeated by float rounding), the
  `status` / `tier` CHECK constraints, `unique (provider,
  provider_order_id)`, and both FKs (`invitation_id` → `invites`,
  `owner_id` → `auth.users`, both `on delete cascade`).
- `invites_reject_client_paid_update` trigger exists on `invites`:
  `BEFORE UPDATE … FOR EACH ROW EXECUTE FUNCTION
  public.reject_client_paid_update()` (verified via `pg_trigger` —
  `tgtype` decodes to BEFORE + ROW + UPDATE).
- All four SECURITY DEFINER functions (`can_insert_rsvp`,
  `resolve_invite_guest`, `get_published_invite`,
  `reject_client_paid_update`) are present, owned by `postgres`,
  `prosecdef = true`.
- The old fully-public policies (`invites public read/insert`,
  `invite_guests public *`, `invite_rsvps public *`) are **gone**;
  `pg_policies` now shows exactly the owner-scoped set from the
  migrations, plus `invite_rsvps insert on published invite` (→
  `can_insert_rsvp(...)`) and `payments owner read own`. RLS is enabled
  (not forced) on all four tables.

### RLS / security behavior — tested as real `anon` / `authenticated` / `service_role` over the REST API

| Check | Result |
|---|---|
| `anon` RSVP insert → **paid** invite, `guest_id` null | **201** (allowed) |
| `anon` RSVP insert → **paid** invite, `guest_id` belonging to that same invite | **201** (allowed) |
| `anon` RSVP insert → paid invite, `guest_id` from a **different** invite | **rejected** — `42501` new row violates RLS |
| `anon` RSVP insert → **unpaid** invite | **rejected** — `42501` |
| `authenticated` **owner**: `UPDATE invites SET paid = true` directly | **rejected** — `P0001 "paid and paypal_order_id can only be set by the payment system"` (the trigger) |
| `authenticated` owner: `UPDATE invites SET category = …` (non-gated column) | **204** — succeeds, proving the block above is the trigger, not blanket RLS |
| `service_role`: `UPDATE invites SET paid = true` | **204** — succeeds (this is the `markInvitePaid()` path) |
| `anon` SELECT `payments` | `[]` — zero rows |
| `authenticated` owner SELECT `payments` | own rows only |
| `anon` INSERT `payments` | **rejected** — `42501` |
| `authenticated` owner INSERT `payments` (even with a truthful `owner_id`) | **rejected** — `42501` |
| `authenticated` owner UPDATE / DELETE `payments` | **0 rows affected** — no policy grants the operation, so the rows are invisible to it; nothing is modified |

Note on the `return=representation` header: an `anon` RSVP insert made
with `Prefer: return=representation` gets an RLS error on the *read-back*
(`invite_rsvps` SELECT is owner-only), not on the write. The app's
`submitRsvp()` uses a bare `.insert(...)` (no `.select()`), so this is a
test-harness artifact, not a real gap — confirmed by reading
`src/lib/storage.ts`.

### Supabase security advisor

`get_advisors` flags the SECURITY DEFINER functions as
`anon`/`authenticated`-executable. For `can_insert_rsvp`,
`resolve_invite_guest`, and `get_published_invite` this is **by design**
— they are the entire non-owner read/RSVP path and are deliberately
`grant execute … to anon, authenticated` with narrow, hand-picked
returns. `reject_client_paid_update` is also flagged, but PostgREST does
**not** actually expose it (a `returns trigger` function isn't in the
schema cache — a direct `/rest/v1/rpc/reject_client_paid_update` call
returns `PGRST202 "Could not find the function"`), so there is nothing
callable there. No action taken; noted so a future advisor run isn't
mistaken for a regression.

### PayPal — real sandbox API + the real app routes (dev server, `NEXT_PUBLIC_PAYPAL_ENV=sandbox`)

Verified end-to-end against `api-m.sandbox.paypal.com` with the app's
actual `/api/paypal/orders` and `/api/paypal/orders/[orderId]/capture`
route handlers, driven by a genuine authenticated Supabase session
cookie:

- **Order creation** (`POST /api/paypal/orders` as the authenticated
  owner): a real PayPal sandbox order is created; a `payments` row lands
  with `status = created`, `tier = gold`, `expected_amount = 79.00`
  (from the server-side `TIERS` table via the invite's stored
  `answers.tier`, **not** anything the request sent), and
  `owner_id` / `invitation_id` matching the invite.
- **Order-creation idempotency**: a second `POST` for the same invite
  reused the *same* PayPal order id (the `findPendingPayment` →
  `status = 'created'` reuse path), rather than opening a second
  outstanding order.
- **Capture of an un-approved order** (no buyer approval step): the real
  PayPal API returns `422 UNPROCESSABLE_ENTITY / ORDER_NOT_APPROVED`,
  the route marks the `payments` row `status = failed` with the reason
  in `failure_reason`, and returns a **generic** `402` to the client
  (specific reason server-log-only). The real capture network call and
  its failure handling are exercised.
- **Capture auth/ownership**: `401` when signed out, `404` for an order
  id with no `payments` row, `403` when a *different* signed-in user
  attempts the capture.
- **Idempotent capture / "PayPal succeeded but the DB update failed"
  recovery branch**: with a `payments` row in `status = 'captured'` (the
  state a real verified capture leaves behind), `POST …/capture` returns
  `200 {"status":"COMPLETED"}` **without calling PayPal again**, and
  flips `invites.paid → true` + sets `invites.paypal_order_id`. Calling
  it a second time stays `200 COMPLETED` and leaves the `payments` row
  byte-for-byte unchanged (no double-processing, no second capture id).

**Not exercised against real infrastructure — the one remaining gap:**
the *happy-path* wallet flow — a real PayPal sandbox **buyer** approving
the order in the hosted checkout UI, then a real
`POST /v2/checkout/orders/{id}/capture` returning `COMPLETED`, run
through `verifyCaptureResponse()` against a genuine PayPal capture body.
That leg needs an interactive browser plus sandbox buyer credentials
(developer.paypal.com/dashboard/sandbox/accounts) and there is no
browser / headless-approval path available in this environment (a
headless card-approval attempt via `confirm-payment-source` returned
`UNPROCESSABLE_ENTITY`, most likely because Advanced Card Payments
isn't enabled on this sandbox account).
`verifyCaptureResponse()` itself remains covered only
by its unit fixtures (`src/lib/paypal-verify.test.ts`, 18 cases). This
is now the single item to run before trusting the paid→publish path in
production — see "Pending" #2 below.

## Pending — needs a human to do these, not just code

1. ~~**Run the auth & ownership migration.**~~ — **DONE 2026-09-01.**
   Applied to `ravfwnqfxngphncuyyxo` as `schema_migrations` version
   `20260901114159` (`auth_ownership`), from
   `supabase/migrations/20260828000000_auth_ownership.sql` verbatim at the
   time (renamed to `20260901114159_auth_ownership.sql` by Stage 0 to match
   this recorded version — SQL body unchanged), and
   verified against the live database — see "Round 7" above.
   ~~`SUPABASE_SERVICE_ROLE_KEY` is present and non-empty in `.env.local`.`~~ —
   **no longer true as of the Stage 0 reconciliation (2026-09-09): this
   key is currently unset in `.env.local`.** See "Stage 0" below and
   Pending item 9.
   - **Existing invites** — there were 3, all `paid = false` test rows
     (`uttam-riyah-…`, `xcfcgs-…`, `test-paywall-check`). All now have
     `owner_id = null` and, being unpaid, are unreadable by anyone
     (no owner to match, and `get_published_invite()` returns
     `content`/`tier` as null until `paid`). This is the documented
     consequence, not a regression; left in place (not deleted — not
     this task's call).
   - `resolve_invite_guest` and `get_published_invite` confirmed present
     with `EXECUTE` to `anon` (and flagged, as expected-by-design, by
     the security advisor).
2. **PayPal sandbox credentials are set; the live wallet happy-path is
   the last unverified leg.** `.env.local` has
   `NEXT_PUBLIC_PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` /
   `PAYPAL_API_BASE_URL` (= `https://api-m.sandbox.paypal.com`) /
   `NEXT_PUBLIC_PAYPAL_ENV` (= `sandbox`), and order-create + capture
   were exercised against the real sandbox API (Round 7). What still
   needs a human with a browser: sign in, create an invite, and complete
   a checkout with a **PayPal sandbox buyer account**
   ([developer.paypal.com/dashboard/sandbox/accounts](https://developer.paypal.com/dashboard/sandbox/accounts)),
   confirming the capture returns `COMPLETED`, `verifyCaptureResponse()`
   passes against the real body, `payments.captured_amount` / `currency`
   are right, and `invites.paid` flips true. `PAYPAL_MERCHANT_EMAIL` is
   still unset — optional; leaving it unset skips only the payee-match
   check (surfaced as skipped, not silently passed).
3. ~~**Run the payment integrity migration.**~~ — **DONE 2026-09-01.**
   Applied to `ravfwnqfxngphncuyyxo` as `schema_migrations` version
   `20260901114212` (`payment_integrity`), from
   `supabase/migrations/20260829000000_payment_integrity.sql` verbatim at
   the time (renamed to `20260901114212_payment_integrity.sql` by Stage 0
   to match this recorded version — SQL body unchanged).
   The inline **payment-gating** block (`paid` / `paypal_order_id`) was
   applied first, as version `20260901114121` (`payment_gating`). The
   `payments` table, its RLS, and the `invites_reject_client_paid_update`
   trigger are all live and verified as real `anon` / `authenticated` /
   `service_role` callers — see "Round 7" above. **Migration-history
   version drift** (recorded versions vs. `supabase/migrations/`
   filenames) is a known follow-up — see the callout in "Round 7".
4. **AI Gateway auth is unset.** `/api/generate` currently throws
   `GatewayAuthenticationError` in local dev — `AI_GATEWAY_API_KEY` (or a
   direct provider key) isn't configured yet, so AI generation doesn't
   actually run end-to-end yet.
5. **i18n is partial by design so far** — only nav + hero are translated.
   Expanding further means adding keys to `src/lib/i18n/translations.ts`
   for each new section (steps, categories, tiers, dashboard, survey…),
   one section at a time.
6. **Translation review recommended.** French is fairly solid. Hindi,
   Tamil, Telugu, and Marathi are AI-translated but not native-reviewed.
   Kreol Morisien was supplied by the user via ChatGPT and looks
   consistent, but hasn't had a native-speaker check either — worth doing
   before real users see any of the five.
7. ~~Pre-existing lint debt~~ — **fixed.** `Countdown.tsx` and
   `PaywallPanel.tsx` now compute their initial state instead of setting
   it synchronously inside an effect; `LocaleContext.tsx` was rewritten to
   read `localStorage` via `useSyncExternalStore` instead of an
   effect+setState (the effect+setState version isn't safely fixable with
   a lazy `useState` initializer the way the other two were, since
   `window` doesn't exist during SSR — `useSyncExternalStore` is React's
   own tool for exactly this); `Footer.tsx`'s unescaped apostrophe is
   escaped. `npm run lint` is clean (exit 0).
8. ~~**RLS is reviewed and covered by two kinds of test, still not
   integration-tested against real Postgres.**~~ — **DONE 2026-09-01, see
   "Round 7" above.** The auth_ownership + payment_integrity policies,
   the `can_insert_rsvp` RSVP-insert policy (the round-5 rewrite), and
   the `invites_reject_client_paid_update` trigger were all exercised
   against the live database as genuine `anon` / `authenticated` /
   `service_role` REST callers — not mocked, not via the privileged
   connection. Every case from Round 5's checklist passed: `anon` RSVP
   insert succeeds against a paid invite (with or without a matching
   `guest_id`), and is rejected for a cross-invite `guest_id` or an
   unpaid invite. `src/lib/rls-policy.test.ts` stays as the cheap
   text-pattern regression guard; it's now backed by a real run.
   Still worth doing when convenient: fold a proper integration test
   (`supabase start` + a seeded fixture, or a CI job hitting a throwaway
   project) into the suite so this doesn't rely on a one-off manual
   verification next time the policies change.
9. **`SUPABASE_SERVICE_ROLE_KEY` is unset in `.env.local`.** Confirmed
   2026-09-09 by variable-name-only inspection (no value read or
   printed). Consequence: `supabaseAdminConfigured` is `false`
   (`src/lib/supabase/admin.ts`), so every function in
   `src/lib/payments.server.ts` and `markInvitePaid()` in
   `storage.server.ts` no-ops, and `POST /api/paypal/orders` 502s on
   every attempt locally — the entire payment path is dead until this is
   restored. This is a local environment gap, not a code or migration
   issue; restoring the value is outside the scope of any repository
   change. See `.env.example`'s note on this variable.
10. **Missing browser-generator-v1 source code — confirmed unrecoverable,
    schema recovered instead.** See "Stage 0" below for the full account.

## Stage 0 — Repository/live database reconciliation (2026-09-09)

Before this, `supabase/migrations/` (2 files) and `supabase/schema.sql`
described a database three migrations behind the actual live project.
Supabase's `list_migrations` (read-only) showed **seven** applied
`schema_migrations` versions; this repository's history accounted for only
four of them (and only two as real migration files — the other two
under different, pre-Stage-0 filenames). The three unaccounted-for
versions — `20260905073155` (`requests_and_templates`), `20260905084115`
(`generator_composition`), `20260905091530`
(`generator_payment_publish_split`) — had created live tables `requests`,
`templates`, and `invite_payment_records`, plus eight new columns on
`invites` (`request_id`, `occasion`, `generator_kind`, `design_spec`,
`generator_content`, `composition`, `published_at`,
`created_by_admin_id`), none of which existed anywhere in this repository.

### Missing browser-generator-v1 source code

A live column comment on `invites.created_by_admin_id` reads *"Which admin
account ran the Generator for this invite (invites.server.ts
generateHinduInvite)."* That file and function do not exist in this
repository. Per explicit owner instruction, Stage 0 performed one final
read-only search before concluding the code is genuinely lost:

- **This repository's full git history** — every ref (`git rev-list
  --all --objects`), every commit's diff (`git log --all -p -S<symbol>`
  for `generateHinduInvite`, `invites.server`, `generator_kind`,
  `design_spec`, `requests_and_templates`, `generator_composition`,
  `generator_payment_publish_split`, `invite_payment_records`), every
  ref's reflog, `git stash list`, and `git fsck --full --unreachable
  --no-reflog` (three dangling objects found — a superseded pre-`--amend`
  commit and its tree/blob, unrelated to the generator; no dangling
  object matches any generator symbol). No hits anywhere.
- **Other local checkouts.** Two directories elsewhere on disk share this
  project's exact package name (`digital-invite-app`) in their path —
  `/mnt/c/Development1/Digital-E-invite` and `/mnt/c/Digital-E-invite` —
  but both are a **different, unrelated project**
  (`ai-digital-invitation-platform`, remote
  `github.com/monsieur-zordi/Digital-E-invite`, a different
  task-numbering scheme). No generator symbols anywhere in their tracked
  files or history. A third checkout,
  `/mnt/c/Users/uttam/OneDrive/Desktop/Enveloped`, IS this same
  repository (`origin` = `sarva-uttam/enveloped`, `HEAD` at `77245d7`,
  one commit behind `master` at the time) — its working tree shows every
  tracked file as locally modified, but diffing confirms this is pure
  CRLF/LF line-ending noise (e.g. a 65-line file reporting 65
  insertions/65 deletions), not real content; no generator symbol appears
  in that diff at all, and its `supabase/migrations/` holds only the same
  two files this repository already had.
- **Claude session transcripts**, local and on the Windows filesystem
  (`~/.claude/projects/`, `/mnt/c/Users/uttam/.claude/projects/`),
  including three Windows-side project sessions that did work under
  paths named `Enveloped`/`Project-Enveloped`/`Digital-Invite-Website` —
  none contain the generator symbols in their transcript text.

**Conclusion: the source for browser-generator-v1 (`invites.server.ts`,
`generateHinduInvite`, and whatever applied the three 2026-09-05
migrations) could not be found anywhere searched and is treated as lost.**
Its schema survives live and has been reconstructed into this repository
(see below); the code that produced and consumed it has not. If a copy
turns up later (a machine not searched here, an export, a colleague's
copy), it would materially change Stage 1's scope — see the recommended
Stage 1 scope for how to fold it back in if so.

### What Stage 0 did

- Recovered the exact live SQL for all three missing migrations via
  read-only inspection (`information_schema`/`pg_catalog` column,
  constraint, index, and function definitions; `pg_get_functiondef()` for
  `get_published_invite()`'s exact live body) and added them as
  `supabase/migrations/20260905073155_requests_and_templates.sql`,
  `20260905084115_generator_composition.sql`, and
  `20260905091530_generator_payment_publish_split.sql`.
- Recovered `payment_gating` (previously only an unversioned inline block
  in `schema.sql`) as its own file,
  `supabase/migrations/20260901114121_payment_gating.sql`.
- Reconstructed the genesis migration,
  `supabase/migrations/20260825050021_enveloped_invites_schema.sql`
  (base `invites`/`invite_guests`/`invite_rsvps` tables and their
  original, fully-public RLS policies — later replaced by
  `auth_ownership`), since no versioned file for it existed either.
- Renamed the two existing migration files to match the versions Supabase
  actually recorded: `20260828000000_auth_ownership.sql` →
  `20260901114159_auth_ownership.sql`,
  `20260829000000_payment_integrity.sql` →
  `20260901114212_payment_integrity.sql`. Their SQL bodies are untouched;
  only their header comments were corrected (they previously said "NOT
  applied to the live project yet," which stopped being true on
  2026-09-01).
- Rebuilt `supabase/schema.sql` from the verified live state — it
  previously still described a three-migrations-behind database and, in
  its own header, incorrectly claimed those migrations were "NOT applied
  there yet" (they had been, since Round 7).
- See `supabase/migrations/README.md` (new) for the ongoing workflow this
  established.

**Every recovered migration file documents two known pre-existing issues,
neither introduced nor fixed by Stage 0** (Stage 0 is documentation and
reconciliation only — no behavioral migration was written or applied):

1. **Payment/publication coupling defect.** Despite its name,
   `generator_payment_publish_split`'s `get_published_invite()` does not
   actually decouple payment from publication — every generator-aware
   column is gated `i.paid AND (i.generator_kind IS NULL OR
   i.published_at IS NOT NULL)`; `paid` is still an unconditional AND. A
   published-but-unpaid concierge invite is invisible to guests, exactly
   like an unpublished one. `resolve_invite_guest()`/`can_insert_rsvp()`
   have no awareness of `published_at` at all. This directly contradicts
   the concierge-first product requirement that payment state and
   publication state remain separate.
2. **Hindu-wedding-specific occasion vocabulary.** `invites.occasion` /
   `templates.occasion` / `requests.requested_occasions` are constrained
   to `{haldi, sangeet_mehendi, wedding_day, reception}`. Per explicit
   product direction, Enveloped's permanent domain model must support
   general events through reusable cultural packs — weddings-first, not
   wedding-only. This fixed enum is not that model and is expected to be
   replaced by a later migration, not part of Stage 0.

### Self-service survey/generator — preserved, to be disabled later

Per explicit owner decision, the existing self-service flow
(`/survey`, `SurveyFlow.tsx`, `/api/generate`, `saveInvite()`, the
`TIERS`-priced PayPal checkout) is **preserved as working code** — none of
it is deleted. It is intended to be **disabled from public use** once the
concierge-first flow is ready, but **Stage 0 makes no behavioral change**:
`/survey` remains reachable and functional exactly as before this
reconciliation. Disabling it (a route guard, a feature flag, or removing
its nav entry) is scoped to a later stage, not Stage 0.

### Product direction — wedding-first, culturally extensible

Recorded here as an explicit decision, not yet implemented in code:
Enveloped's primary market and product focus is weddings, but the
permanent domain model must support general events (holidays, vacations,
hotel packages, birthdays — already present in
`src/lib/categories.ts`/`EventCategory`) through **reusable cultural
packs**, not a single hardcoded tradition. The live `occasion` vocabulary
recovered in Stage 0 (`haldi`/`sangeet_mehendi`/`wedding_day`/`reception`)
is a Hindu-wedding-specific placeholder inherited from whatever produced
it, not this permanent model — see the payment/publication and occasion
notes above. Redesigning the occasion/cultural-pack model is scoped to a
later stage.

## Stage 1 — Local Supabase integration-test foundation (2026-09-09)

Testing infrastructure only — no admin role, no RLS policy change, no
publication/payment separation, no generator UI. Added
`tests/integration/` (45 tests across `schema.test.ts`,
`ownership-rls.test.ts`, `published-invite.test.ts`), `supabase/config.toml`
(new — `supabase init`, ports moved to the 55xxx range, see its own
comment and `tests/integration/README.md`'s troubleshooting section for
why), `vitest.integration.config.ts` (a config separate from
`vitest.config.ts` on purpose, so `npm test` stays fast/dependency-free),
and two new npm-script-only `devDependencies`: `pg`/`@types/pg` (a plain
Postgres client, used only for direct `information_schema`/`pg_catalog`
introspection in `schema.test.ts`). The Supabase CLI itself is a
documented prerequisite, not an npm dependency — see
`tests/integration/README.md`.

**These tests run against a local, disposable Docker-backed Postgres
only** — `npm run db:start` / `npm run test:db` — never the live project.
`tests/integration/helpers/local-env.ts` never reads `.env.local` or any
live credential at all (the only source of connection info is
`supabase status`, asking the local Docker daemon what it started) and
refuses to return anything unless every resolved URL is loopback-only;
see that file and `tests/integration/README.md`'s "How these tests are
guaranteed not to target production" for the full mechanism.

**A real bug in Stage 0's reconstruction was found and fixed by this
stage's own validation**, exactly the kind of thing text-pattern
guards can't catch: `20260905091530_generator_payment_publish_split.sql`'s
`create or replace function get_published_invite(...)` failed against a
real, freshly-migrated Postgres with `cannot change return type of
existing function (SQLSTATE 42P13)` — `create or replace function` cannot
change an existing function's `returns table (...)` column list (7 columns
from `auth_ownership` → 10 columns here); only `drop function` first
allows that. Fixed by adding `drop function if exists
get_published_invite(text);` immediately before the `create or replace`
in that file. The function's body is unchanged and still matches the live
project exactly (verified via `pg_get_functiondef()` during Stage 0) —
only the missing statement needed to actually *reach* that state from an
empty database was added. The real, lost browser-generator-v1 migration
must have done the equivalent, or the live database itself could never
have reached its current state either. All seven migrations now apply
cleanly, in order, to a fresh local database — proven repeatedly during
this stage (`npm run test:db`, `npm run db:reset`, and a full
stop/start cycle all exercised).

**Known, tracked defect captured as an explicit regression guard, not
fixed:** three tests in `published-invite.test.ts` assert the CURRENT
payment/publication coupling behavior (published-but-unpaid stays
invisible; paid-but-unpublished stays invisible; only paid-AND-published
is visible) — intentionally documenting the existing defect from Stage 0
rather than correcting it, per this stage's explicit scope. Update these
assertions (don't delete them) when that fix eventually lands.

`src/lib/rls-policy.test.ts` (text-pattern guard) is unchanged and kept
as a secondary, fast, Docker-free check — see
`tests/integration/README.md`'s comparison table for what each kind of
test can and can't prove. All 117 pre-existing unit tests still pass
unmodified.

## Stage 2 — single-admin identity and security boundary (2026-09-09)

A database-backed administrator identity, the minimum RLS an
administrator needs to manage `requests`/`templates`/
`invite_payment_records`, and a server-protected `/admin` placeholder
that proves the boundary works end to end. **No generator, request-
management interface, template editor, invitation editor, payment
interface, or publication workflow was built** — those remain explicitly
out of scope; see "Recommended Stage 3 scope" below.

### Architecture

- **`app_admins`** (new table, `supabase/migrations/20260909120000_admin_identity.sql`)
  — one row per administrator, keyed to `auth.users.id`. RLS enabled;
  exactly one policy exists on it (`select`, gated on `is_admin()`), and
  **no insert/update/delete policy exists for any role at all, including
  an administrator's own client.** Granting admin membership is
  structurally impossible through the Supabase client SDK — see
  "Bootstrapping the first administrator" in
  `supabase/migrations/README.md` for the one way it actually happens: a
  trusted, service-role/direct-database write, run manually by a human.
  Adding a second, third, ... administrator is "insert one more row" —
  no schema change, ever.
- **`is_admin()`** (SECURITY DEFINER, `search_path = ''`, fully-qualified
  `public.app_admins`) — the one hardened check. SECURITY DEFINER is
  necessary here, not a stylistic choice: `app_admins` has no self-
  referential SELECT policy an ordinary caller could use (only the
  `is_admin()`-gated one, which would be circular for `is_admin()` itself
  to depend on), so a SECURITY INVOKER version would see zero rows for
  literally everyone and always return `false` — the same class of bug
  `can_insert_rsvp()` (Round 5, `20260901114159_auth_ownership.sql`) was
  built to avoid. `auth.uid()` is `NULL` for anonymous callers, and
  `null = user_id` is never true under SQL's three-valued logic, so
  anonymous and ordinary authenticated callers both get `false` with no
  special-casing.
- **Server-side authorization**: `src/lib/auth/admin.server.ts`'s
  `checkAdmin()` — the only place this app decides "is the current caller
  an administrator." Calls `is_admin()` through the session-aware server
  client (real cookies, real RLS), fails **closed** on every edge case
  (no session, Supabase misconfigured, the RPC itself errors) — never
  defaults to `true`. Its decision logic is extracted into a pure
  function, `deriveAdminCheckResult()`, exhaustively unit-tested in
  `admin.server.test.ts` — the same pure-core/thin-I/O-wrapper pattern
  already used by `src/lib/ownership.ts` and `src/lib/paypal-verify.ts`.
- **`/admin`** (`src/app/admin/layout.tsx` + `page.tsx`) — the layout is
  the actual boundary: it calls `checkAdmin()` on every request, redirects
  a signed-out visitor to `/login?next=/admin` (reusing the existing
  `sanitizeRedirectPath()` — no new redirect-validation logic was
  written), renders a plain "Access denied" message for an authenticated
  non-admin, and only then renders `children`. Any future page under
  `src/app/admin/*` inherits this automatically — it's the reusable
  authorization boundary the objective asked for, not a one-off check
  copy-pasted per page. `page.tsx` itself does no check of its own; it
  trusts the layout, matching how every other route in this app already
  works (one boundary, not one per page).
- **`src/proxy.ts`** — `/admin` was added to `PROTECTED_PREFIXES` next to
  `/dashboard`/`/survey`: an *optimistic*, session-presence-only bounce to
  login for a visitor with no session cookie at all. This is explicitly
  NOT an admin check — Proxy has no business doing a database round trip
  (see the file's own comment, and Next's authentication guide, read
  during Stage 0: Proxy "should not be your only line of defense" and
  isn't meant for slow data fetching). Deleting `src/proxy.ts` entirely
  would not create a security hole — `/admin/layout.tsx` alone still
  correctly gates every request.

### Authentication vs. authorization, and why a webpage is never the boundary

**Authentication** answers "who is this?" — Supabase Auth (GoTrue),
unchanged by this stage, already answers it: a valid session cookie means
a real, signed-in `auth.users` row. **Authorization** answers "what is
this identity allowed to do?" — that is what Stage 2 actually adds.
Before this stage, "signed in" and "authorized as owner" were already
correctly kept separate for invitations (`src/lib/ownership.ts`); Stage 2
extends the same discipline to a new, coarser-grained identity
("administrator") rather than conflating "has a session" with "is
allowed to see `/admin`."

**The `/admin` page existing, or being reachable, or rendering a nice UI,
proves nothing about whether a given caller may see it.** The real
boundary is Postgres RLS via `is_admin()` — the same principle this
project has followed since the very first `auth_ownership` migration:
`src/proxy.ts`'s redirect is convenience, `checkAdmin()`'s server-side
call is a real check, but the fact that a database round trip is even
*possible* for a given caller (RLS letting them see/act on a row) is the
only thing that can't be talked around by skipping the page, calling an
API route directly, or a future bug in the page component's own logic.
Concretely: even if `src/app/admin/page.tsx` were deleted and every
`/admin/*` route removed from the app entirely, `app_admins`/`requests`/
`templates`/`invite_payment_records` would still correctly refuse every
non-admin caller — the database enforces this independent of whether any
UI exists to exercise it. `tests/integration/admin.test.ts` proves this
directly by calling the database as `anon`/`authenticated`/admin clients,
never through the Next.js app at all.

### What's still NOT applied to the live project

`20260909120000_admin_identity.sql` exists only in this repository and
against the local Supabase stack — it has **not** been applied to
`ravfwnqfxngphncuyyxo`, and no live administrator was created, per this
stage's explicit safety restrictions. Every database interaction this
stage performed — writing the migration, running `npm run db:reset`
repeatedly, all 69 integration tests (45 pre-existing from Stage 1, 3 new
assertions added to `schema.test.ts` to describe the new table/function/
policies, and 21 new in `admin.test.ts`) — targeted the local, disposable
stack exclusively (see
`tests/integration/helpers/local-env.ts`'s loopback-only guard, unchanged
from Stage 1). Applying this migration to the live project, and running
the manual bootstrap procedure for the real first administrator, are
follow-up actions for the owner to perform deliberately — see
`supabase/migrations/README.md`'s "Bootstrapping the first administrator"
section for the exact, safe procedure. No UUID, password, token, or
service-role key was read, printed, or committed anywhere in this stage.

### Remaining known defect, unchanged by this stage

The payment/publication coupling defect from Stage 0
(`get_published_invite()` still hard-ANDs on `paid`, `published_at` never
substitutes for it — see the Stage 0 section above and
`20260905091530_generator_payment_publish_split.sql`'s header) is
**untouched by Stage 2**. Nothing in the admin identity or authorization
work reads or writes `invites`/`payments`, and no policy on those tables
changed. Fixing this remains explicitly scoped to a later, dedicated
stage — not folded into this one, and not implied to be "next" just
because an admin identity now exists to eventually act on it.

## Key files

| Area | Path |
|---|---|
| i18n system | `src/lib/i18n/translations.ts`, `src/lib/i18n/LocaleContext.tsx` |
| PayPal server-side | `src/lib/paypal.ts`, `src/lib/paypal-verify.ts`, `src/lib/payments.server.ts`, `src/app/api/paypal/**` |
| Paywall UI | `src/components/invite/PaywallPanel.tsx` |
| DB schema (all migrations applied to `ravfwnqfxngphncuyyxo` 2026-09-01) | `supabase/schema.sql`, `supabase/migrations/` |
| AI generation endpoint | `src/app/api/generate/route.ts` |
| Auth (client state) | `src/lib/auth/AuthContext.tsx` |
| Auth (login / callback) | `src/app/login/page.tsx`, `src/app/auth/callback/route.ts` |
| Open-redirect guard | `src/lib/safe-redirect.ts` (`sanitizeRedirectPath`) |
| Route protection | `src/proxy.ts` (Next 16's rename of `middleware.ts`) |
| Ownership logic (unit-tested) | `src/lib/ownership.ts` |
| Supabase clients (browser/server/admin) | `src/lib/supabase/client.ts`, `server.ts`, `admin.ts` |
| Shared query logic (client-agnostic) | `src/lib/storage-queries.ts` — includes `PublicInvite`/`fetchPublicInvite()`, the sanitized non-owner read |
| Browser-only storage ops | `src/lib/storage.ts` |
| Server-only storage ops | `src/lib/storage.server.ts` |
| Tests (`npm test`) | `src/lib/ownership.test.ts`, `storage.test.ts`, `storage-queries.test.ts`, `storage.server.test.ts`, `rls-policy.test.ts`, `safe-redirect.test.ts`, `paypal-verify.test.ts`, `payments.server.test.ts`, `src/app/api/paypal/orders/route.test.ts`, `src/app/api/paypal/orders/[orderId]/capture/route.test.ts` |
| Local dev server config | `.claude/launch.json` (`npm run dev`, port 3000) |

## Repo

- **Enveloped** (this project): [github.com/sarva-uttam/enveloped](https://github.com/sarva-uttam/enveloped) — private
  (this line previously said `monsieur-zordi/enveloped`, which doesn't
  match the actual `git remote -v` — corrected while updating this file)
