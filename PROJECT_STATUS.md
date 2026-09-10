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

## Stage 3 — separate publication from payment (2026-09-09)

Fixes exactly the Stage 0 defect flagged above.
`supabase/migrations/20260909150000_publication_payment_split.sql`
(new, forward-only — none of the eight prior migrations are rewritten)
makes `published_at` the sole public-access gate for an invitation.
`paid` continues to record payment status only.

### Publication lifecycle

`invites.published_at` — `null` until an administrator explicitly
publishes the invitation; a real timestamp from then on, until an
administrator explicitly unpublishes it. Nothing else ever sets it:

- `publish_invite(p_invite_id uuid)` and `unpublish_invite(p_invite_id
  uuid)` (both SECURITY DEFINER, both require `is_admin()` internally,
  both `grant execute ... to authenticated` with an explicit `revoke
  ... from anon`) are the only two ways it changes. `publish_invite()`
  sets it to exactly `now()`; `unpublish_invite()` sets it to exactly
  `null`. Neither ever touches `paid`/`paypal_order_id`.
- The `invites_reject_client_paid_update` trigger (originally from
  `20260901114212_payment_integrity.sql`) now also protects
  `published_at`, hardened with a transaction-local flag
  (`enveloped.publish_action`) rather than a bare `is_admin()` check —
  see "A gap found and closed while writing this migration" below for
  exactly why that distinction matters.

### Payment lifecycle

Unchanged by this stage. `paid`/`paypal_order_id` remain
service-role-only, set exclusively by `markInvitePaid()`
(`src/lib/storage.server.ts`) after a verified PayPal capture
(`src/app/api/paypal/orders/[orderId]/capture/route.ts` — its
verification logic, `src/lib/paypal-verify.ts`, is untouched). Confirmed,
not just asserted: `markInvitePaid()`'s update payload has no
`published_at` key, and — independently — the trigger above would reject
`published_at` being set together with `paid` from anything but a
genuine admin/service-role path anyway. `invite_payment_records` (the
offline-payment ledger — cash, bank transfer, mobile money, or a
manually-recorded PayPal payment) remains exactly what Stage 0 recovered
it as: a record-keeping table with admin-only RLS (Stage 2), still not
wired to any write path in the app. No offline-payment UI was built this
stage — recording an offline payment today means a direct, trusted
insert into that table, the same tier of operation as the admin-bootstrap
procedure in `supabase/migrations/README.md`.

### Why independent

The owner's explicit business rule, implemented exactly: payment must
never automatically publish an invitation, and publication must never
automatically mark an invitation paid. An administrator may publish an
invitation that hasn't been paid for yet (e.g. a comped or trust-based
arrangement); a paid invitation stays private until an administrator
actively publishes it (e.g. final review before it goes out to guests).
The two states are tracked, changed, and authorized completely
separately — there is no code path anywhere in this stage where setting
one has a side effect on the other.

### Who can publish

Only a user with a row in `app_admins` (Stage 2), calling
`publish_invite()`/`unpublish_invite()` through their own authenticated
session — never the service-role key from the browser, never the
invitation's owner (an owner has no special access to these functions;
owning an invitation and being an administrator are unrelated). A
minimal proof of this reaching all the way to the database, not a UI: no
admin publishing interface was built this stage (out of scope, see
"What was not built" below) — the RPC + authorization is what exists;
`src/app/admin/` still shows only Stage 2's placeholder page.

### A gap found and closed while writing this migration

While designing the trigger's `published_at` exception, an
`is_admin()`-only version was tried first and found insufficient by
testing it directly against this local stack: an administrator who
ALSO happens to own the invitation in question can reach the trigger
through a perfectly ordinary raw `.update()` call (`invites`' owner-
scoped RLS lets an owner's own client update their own row regardless of
admin status — Stage 2 deliberately added no "admin may update any
invite" policy). Under an `is_admin()`-only trigger check, that raw
update would have been accepted with whatever timestamp the client sent
— including a backdated one — silently defeating the "`publish_invite()`
always sets `now()`, never a client-supplied value" guarantee. Verified
directly: with the simpler version, an admin who owned an invite could
set `published_at` to an arbitrary past date via a plain `.update()`,
bypassing the function entirely.

Fixed with a transaction-local `set_config('enveloped.publish_action',
'granted', true)` flag, set by `publish_invite()`/`unpublish_invite()`
immediately before their own `UPDATE` and checked by the trigger instead
of re-deriving admin status on its own. The practical effect:
`published_at` can now be changed ONLY by code running inside those two
functions — never by any raw client update, regardless of who the caller
is or what RLS would otherwise let them touch. Verified fixed against
this same local stack before the migration was considered done — see
`tests/integration/publication-authorization.test.ts`'s "even an
ADMINISTRATOR's own client cannot set published_at via a raw table
update" test.

A second, smaller platform-default surprise was hit and fixed the same
way Stage 2 already documented for table grants: Supabase grants EXECUTE
on every newly-created `public.*` function to `anon`/`authenticated`/
`service_role` by default (`ALTER DEFAULT PRIVILEGES`), which
`revoke all on function ... from public` does NOT undo (that only
removes the implicit "every role" grant, not this separate, role-
specific one). `publish_invite()`/`unpublish_invite()` add an explicit
`revoke execute ... from anon` so "unavailable to anonymous users" is
literally true (unreachable), not merely "reachable but always rejected
by the internal `is_admin()` check."

### Legacy-row backfill

Runs once, inside the migration, between disabling and re-enabling the
`published_at` trigger (a raw migration-context connection has neither
`service_role` standing nor the `enveloped.publish_action` flag, so it
would otherwise be rejected by the very protection this migration just
added). Four rules, matching the documented compatibility principle
exactly:

1. **Paid, non-generator invitations that were publicly visible under
   the OLD rule** (`generator_kind is null` reduced the old guard to
   simply `paid` — so `paid = true and generator_kind is null` is
   exactly the set of rows that were already guest-visible a moment
   before this migration ran) **receive a backfilled `published_at`**,
   so an already-shared guest link doesn't silently go offline. The
   value prefers, in order: (1) the matching captured PayPal payment's
   own `updated_at` (`payments.status = 'captured'` for that
   `invitation_id`) — the real, verified moment payment succeeded; (2)
   otherwise the invite's own `updated_at` — the best remaining signal
   for a row that predates the `payments` table. Never `now()` (a
   fabricated "just now" for something possibly shared long ago), never
   `created_at` (invite creation time, not payment time).
2. **Generator invitations that already have `published_at`** — untouched
   by construction (the backfill's `WHERE` clause only ever targets rows
   where `published_at IS NULL`).
3. **Paid generator invitations without `published_at`** — untouched by
   construction too (`WHERE` requires `generator_kind IS NULL`); these
   were never guaranteed public before Stage 3 either, so auto-publishing
   them now would be a new grant of visibility this migration must not
   make unilaterally.
4. **Unpaid invitations** — never touched, published or not (`WHERE`
   requires `paid = true`).

Tested against seeded rows on the local stack, not live data (see
`tests/integration/legacy-backfill.test.ts` below) — the live project has
no rows this rule would even apply to today (Stage 0's Round 7 recorded
exactly 4 live rows, all `paid = false`), but the migration is written
generically, not against today's specific live snapshot.

### PayPal and offline-payment behavior

- **PayPal capture confirmed to only record payment state** — see the
  "Payment lifecycle" note above. `src/lib/paypal-verify.ts`'s
  verification logic (order id, `custom_id`, capture status, currency,
  exact amount, optional payee) is completely untouched by this stage.
- **PayPal remains sandbox-only and fixed-tier-priced** — this stage does
  NOT remove or change `src/lib/tiers.ts`'s fixed Bronze/Silver/Gold/
  Platinum pricing, and does NOT add support for a concierge
  `requests.agreed_price` PayPal flow. `POST /api/paypal/orders` still
  prices strictly from the invite's stored `answers.tier` against the
  fixed table — a concierge sale at an arbitrary agreed price still has
  no PayPal path at all; recording such a payment today means a direct,
  trusted `invite_payment_records` insert (see "Who can publish" above
  for the equivalent trust tier). Building real concierge-price PayPal
  support is explicitly future work, not started here.
- **`invite_payment_records` stays record-keeping only** — Stage 2 gave
  administrators RLS access to it; this stage does not add any UI or
  app-layer write path to it. No behavior change there.

### What was not built (explicitly out of scope this stage)

Per the objective: no generator UI, no request-management UI, no private
preview system, no cultural packs, no invitation redesign, and no
complete admin publishing interface. `src/app/admin/` is still exactly
Stage 2's placeholder — this stage proves the database operation and its
authorization work end to end via `tests/integration/`, not via any new
page or button.

### Production rollout and rollback

Neither `20260909120000_admin_identity.sql` nor
`20260909150000_publication_payment_split.sql` has been applied to the
live project (`ravfwnqfxngphncuyyxo`) — both exist only in this
repository and against the local Supabase stack, verified there
repeatedly (`npm run test:db`, full stop/start/reset cycles). Applying
either to production requires, at minimum:

1. Reviewing both migrations against the CURRENT live schema (a
   `list_migrations` check — Stage 0/1's reconciliation is what makes
   this possible to do confidently) before running them, since the live
   project may have drifted further since 2026-09-09.
2. Running `20260909120000_admin_identity.sql` first (Stage 3 depends on
   `is_admin()` existing), then bootstrapping the real first
   administrator per `supabase/migrations/README.md`'s procedure, before
   or immediately after applying `20260909150000_publication_payment_split.sql`
   — an administrator must exist to exercise `publish_invite()` at all,
   though the migration itself does not require one to exist to apply
   cleanly.
3. Understanding the real behavior change to the self-service flow
   BEFORE applying: today, a self-service PayPal payment does not
   directly gate anything at the database level (the app's own UI reads
   `paid`, not `published_at`), but once this migration is live, a
   self-service payer's invite will need an administrator to publish it
   — payment alone will no longer make it guest-visible. This is the
   owner's explicit rule ("payment must never automatically publish"),
   not a regression, but it is a real, user-facing change to how the
   self-service product currently behaves and should not surprise
   whoever is fielding support requests when it ships.
4. Running the legacy backfill's effect against the real live rows
   mentally (or on a copy) first — trivial today (all 4 known live rows
   are unpaid, so the backfill is a no-op for all of them right now),
   but re-check before applying if the live row count/state has changed.
5. **Rollback**: both migrations are additive (new table, new columns,
   new functions, a widened trigger) — nothing destructive to roll back
   by dropping data. If `20260909150000` needs to be reverted after
   applying, the safe path is a new forward-only migration that restores
   `get_published_invite()`/`resolve_invite_guest()`/`can_insert_rsvp()`
   to their `20260905091530`-era bodies (gate on `paid` again) — never
   editing this file in place post-application, consistent with this
   project's "forward-only, never rewrite an applied migration" rule
   throughout. `published_at` values written in the meantime (via real
   `publish_invite()` calls, or the backfill) would NOT be
   automatically cleared by such a rollback and would need an explicit
   decision about what to do with them.

## Stage 4 — server-rendered public invitation foundation (2026-09-09)

Replaces the client-only `/invite/[id]` loading architecture with a
server-rendered one. No database change — Stage 3's schema and RLS are
untouched; this stage is entirely application-layer. No visual redesign,
no composition schema/component registry (still future work).

### The problem this replaces

Before this stage, `src/app/invite/[id]/page.tsx` rendered nothing but
`<InviteClient />`, a fully client-side component. Every visit — guest,
owner, demo, doesn't matter — hit a blank screen until: `AuthProvider`
resolved `supabase.auth.getUser()` (a real network round trip, gating
render even for a public page nobody needed authenticated for), AND
both `getInvite()` (owner-only) and `getPublicInvite()` (sanitized) had
resolved client-side, AND, if a `?guest=` param was present, a third
sequential fetch (`getGuestEntry()`) had also resolved. Only once ALL of
that settled did `resolveViewerRole()` decide what to show — meaning the
actual invitation wording was never present in the HTML a crawler,
a slow connection, or JavaScript-disabled browser ever saw, and even a
fast connection saw nothing for at least one full round trip.

### New architecture

`src/app/invite/[id]/page.tsx` is now an async Server Component. Per
request (never cached or shared — `export const dynamic =
"force-dynamic"`, explicit rather than incidental):

1. Validates `id` (and `guest`, if present) against `isValidSlug()`
   (`src/lib/invite-view-model.ts`) — a conservative allowlist
   (`^[a-z0-9][a-z0-9-]{0,127}$`) matching every real slug shape this app
   generates. An invalid shape never reaches a database call at all —
   "high-confidence input validation", not passing arbitrary route/query
   values through.
2. Fetches ONLY the sanitized public read (`getPublicInviteServer()`) and,
   when relevant, the sanitized guest resolution
   (`getGuestEntryServer()`) — never `getInviteServer()` (the owner-only
   read) and never `supabase.auth.getUser()`. Both calls are wrapped in
   one `React.cache()`-memoized helper (`loadInviteData`) so
   `generateMetadata()` and the page component share a single underlying
   fetch per request instead of duplicating it — the same request-scoped
   (never cross-request) memoization pattern already used for
   `checkAdmin()` in Stage 2.
3. Builds an `InviteViewModel` (`src/lib/invite-view-model.ts`,
   `buildPublicInviteViewModel()`/`buildDemoInviteViewModel()`) — a pure,
   dependency-free function, exhaustively unit-tested on its own,
   completely separate from any React/Next.js code. Returns `null` for
   EVERY reason an invitation might not be viewable — doesn't exist,
   exists but unpublished, or the RPC otherwise returned no content —
   collapsed into one path on purpose: "one safe unavailable response"
   falls out of the code structure itself rather than needing separate
   branches to keep in sync. `InviteViewModel` is deliberately narrow and
   flat (inviteId/guestId/guestName/tier/content/eventDate/song/isDemo)
   — the seam a future versioned composition renderer (still not built)
   will replace, not the presentation components, which never see
   anything richer than this.
4. Renders either `PublicInviteView` (the model exists) or
   `UnavailableInvite` (it doesn't) inside a `<main>` landmark — the
   ONLY two possible outcomes, both plain server-rendered JSX (HTTP 200
   either way — neither ever called Next's `notFound()`, matching the
   pre-existing behavior of the old NotFound/NotPublishedYet components
   this replaces).

### Server/client split

**Server-rendered, no "use client":** `page.tsx`,
`src/components/invite/PublicInviteView.tsx` (the invitation's static
content — headline, welcome message, event details, closing line — a
faithful restructuring of the deleted `InviteCanvas.tsx`'s markup, not a
redesign), `src/components/invite/UnavailableInvite.tsx`,
`src/components/site/FloatingMotif.tsx` (had no client-only behavior at
all — hooks, browser APIs, nothing — so its "use client" directive was
simply removed; it renders identically either way and is now part of the
initial HTML on Gold/Platinum invites instead of appearing only after
hydration).

**Client islands, unchanged in behavior:** `Countdown` (a real
`setInterval`), `RsvpForm` (form state + submission), `MusicToggle`
(toggle state), `OpeningBurst` (canvas-confetti, an imperative browser
API). **New client island:** `AnimateIn.tsx` — a thin framer-motion
wrapper around the existing scroll-reveal animation, taking already-
rendered content as `children`. This is what keeps Framer Motion off the
actual content-RENDERING path while preserving the existing entrance
animation: a Client Component's `children`, when it originates from a
parent Server Component's render, is not re-executed on the client —
it's already-rendered content this component only wraps with motion
timing. The text is in the initial HTML either way; `AnimateIn` only
controls when it becomes visually revealed once JS hydrates.

**Retired:** `src/components/invite/InviteCanvas.tsx` (deleted) — its
entire rendering responsibility moved to `PublicInviteView`, and nothing
else imported it.

**Retained, but disconnected from the public route:**
`src/app/invite/[id]/InviteClient.tsx`, trimmed and now exporting
`OwnerPreview` (previously the default export, previously also handling
the guest path). `page.tsx` does not import it. See its own extensive
header comment for the full reasoning, summarized here: the owner's
management view (paywall/awaiting-publication status, share panel,
per-guest link list) depends on knowing who's signed in and on
`PaywallPanel`, which loads the PayPal SDK — mounting either
unconditionally on the public route, even just to check "is this viewer
the owner", would ship owner-management and PayPal-loading code to every
guest visitor, which this stage's performance requirements explicitly
rule out. Kept (not deleted) because its behavior hasn't been moved
anywhere else yet — see "Remaining risks" below for the real, deliberate
consequence of this.

### Public-data and guest-token security

Unchanged data boundary from Stage 3 (`get_published_invite()`/
`resolve_invite_guest()`, gated on `published_at`), newly enforced at
the application layer too: `InviteViewModel` structurally cannot carry
`answers`/`owner_id`/`paypal_order_id`/private payment records/
administrator information/`paid` itself — those keys don't exist on the
type, proven by `invite-view-model.test.ts` asserting the model's exact
key set, and by `page.test.tsx` rendering a deliberately "leaky" mocked
`PublicInvite` (extra `ownerId`/`paypal_order_id`/raw `answers` fields
simulating a hypothetical future bug) and asserting none of it appears
in the rendered HTML. An invalid or non-matching guest token resolves to
`guestEntry: null`, which `buildPublicInviteViewModel()` treats
identically to "no token supplied" — the base invitation still renders,
unpersonalized, never an error or a different code path a prober could
distinguish. A published invitation with NO guest token still renders in
full — existing, intended behavior, confirmed and preserved: the current
data model has no "guest-only, base link forbidden" flag on an
invitation (Platinum's per-guest links are an additional personalization
layer, not an access restriction), and this stage does not invent one.

### RSVP under the Stage 3 publication rules

Preserved exactly, and re-verified explicitly: `PublicInviteView` passes
`RsvpForm` only `inviteId` (the slug) and `guestId` (from a resolved
guest entry, never a raw token) — the same minimal shape as before this
stage, confirmed by `invite-view-model.test.ts` (the only thing that
determines what `RsvpForm` ever receives) and by `page.test.tsx`
(confirms the RSVP section appears/doesn't per tier as expected). The
actual accept/reject decision remains entirely database-side —
`can_insert_rsvp()` (Stage 3) re-verifies both IDs regardless of what the
client sends; nothing here trusts them. An unpaid but published
invitation still allows RSVP; a paid but unpublished one is still
inaccessible and still rejects RSVP — proven at the database level
already by `tests/integration/published-invite.test.ts` (Stage 3,
unmodified, still passing), and at the application level by this stage's
`page.test.tsx` ("paid + unpublished does NOT render").

### Metadata

`generateMetadata()` no longer falls back to `getInviteServer()` (the
owner-only read) at all — a deliberate, small behavior change from
before this stage, where an OWNER's own unpublished invite would show
its real title/description in their own browser tab (since RLS meant
only the true owner's request could ever succeed there). Now, metadata
comes exclusively from the same sanitized public read the page itself
uses, via the same `React.cache()`-shared `loadInviteData()` call — an
unpublished invitation's metadata is `{}` regardless of who's asking,
falling back to the root layout's generic title/description, matching
"unpublished/unavailable invitations must not leak... through page
title/description/Open Graph". A valid guest token still leads the
title with their click-teaser line, exactly as before.

### Performance

The measurable change: `renderToStaticMarkup()`-rendered output now
contains the full invitation wording — headline, welcome message, event
details, closing line — with zero data fetching required first
(`page.test.tsx` proves this directly: the HTML string already contains
"Priya & Devansh" etc. from a single awaited call to the page function,
no `useEffect`/client fetch involved). The old three-fetch client
waterfall (owner read + public read, always both; guest resolution,
conditionally) and the `AuthProvider`-gated blank screen are both gone
from the public rendering path entirely.

Bundle composition, verified by building both this stage and the Stage 3
commit (`363c23d`) in an isolated worktree and diffing
`.next/diagnostics/route-bundle-stats.json` plus grepping
`.next/static/chunks/`: at Stage 3, `/invite/[id]`'s first-load JS was
882,497 bytes across 9 chunks, and one of those chunks — genuinely part
of the invite route's own first-load set, not a coincidentally-shared
one — contained the literal strings `sandbox.paypal.com` and
`web-sdk/v6/core` (`PaywallPanel`'s PayPal SDK loader), confirming
PayPal-related code was shipped to every guest's browser. At this stage,
`/invite/[id]` is 864,866 bytes across the same 9-chunk count (~17.6 KB
smaller), and grepping the ENTIRE `.next/static/chunks/` directory for
`PaywallPanel`/`sandbox.paypal.com`/`OwnerPreview`/`AwaitingPublication`
returns zero matches anywhere in the build — not lazy-loaded, not
deferred, genuinely absent, because nothing in the route tree imports
`InviteClient.tsx` anymore and Next's bundler excludes what nothing
references.

### Accessibility foundation (not the full redesign)

Added or fixed, all low-risk and visually unchanged: a `<main>` landmark
around the page's content (there wasn't one before); `FloatingMotif`'s
decorative emoji now `aria-hidden="true"` (previously announced to
screen readers on every render, on both this page and the homepage's
Hero, since this is a shared component); the gallery color-swatch grid
also `aria-hidden="true"`; event details now a real `<dl>`/`<dt>`/`<dd>`
instead of two stacked, semantically-unrelated `<div>`s; RSVP's accept/
decline buttons expose `aria-pressed` (previously color-only selection
state); the RSVP name input gets a real `aria-label` (previously
placeholder-only, which disappears once typing starts and isn't a
reliable accessible name); the RSVP confirmation uses `role="status"` so
it's announced automatically; `MusicToggle` exposes `aria-pressed`;
every interactive control (RSVP buttons/input, MusicToggle, the
retained `CopyLink` in `OwnerPreview`) gained a `focus-visible` ring
where one wasn't already present. `Countdown` gained a static
`aria-label`/`role="group"` — deliberately NOT `aria-live`, since
announcing a per-second-updating countdown to assistive tech would be
disruptive, not helpful; this is a considered choice, not an oversight.
No reduced-motion support and no full animation redesign — still
explicitly future work.

### What was not built (explicitly out of scope this stage)

Per the objective: no visual redesign, no versioned composition schema
or component registry (`InviteViewModel` is the seam that will connect
to one later, not an implementation of one), no private/guest preview
system, no cultural packs, no changes to pricing or PayPal behavior
(`src/lib/tiers.ts` and the PayPal order/capture routes are untouched),
and `/survey` remains fully reachable and functional — the self-service
flow is preserved exactly, unaffected by any of this stage's changes.

### Remaining risks

The one real, deliberate trade-off from this stage: an OWNER visiting
their own invitation's URL while signed in now sees exactly what a guest
would (the public view, or the unavailable state) — they have
temporarily lost the paywall/awaiting-publication status message and the
share panel/guest-link list that used to appear on this same URL. This
is documented in `InviteClient.tsx`'s own header comment and is a direct
consequence of this stage's performance requirement (never load owner-
management/PayPal code on the public guest page) combined with not
building a replacement surface for it yet. The owner can still see and
delete their invites from `/dashboard`; they cannot yet get the
paywall/share-panel experience anywhere. A dedicated owner-management
surface (a distinct authenticated route, e.g. `/dashboard/invite/[id]`,
rather than overloading the public URL again) is the recommended fix —
see "Recommended Stage 5 scope" for how this relates to (but is
distinct from) the guest-facing private preview work already planned
for Stage 5.

**Resolved in Stage 5** (see that section below): `/dashboard/invite/[id]`
now exists, re-hosting this exact behavior with the ownership check
moved server-side. `InviteClient.tsx` itself is deleted as of Stage 5 —
its behavior was genuinely moved, not left disconnected — so the
specific file reference above is now historical.

## Stage 5 — secure private preview and owner-management separation (2026-09-10)

Adds tokenized, read-only private preview links (`/preview/[token]`) so a
concierge client can review an invitation — published or not — without
an account, and a dedicated authenticated owner-management route
(`/dashboard/invite/[id]`) that re-hosts what Stage 4 disconnected from
the public invitation page. One new, forward-only migration; no change
to any prior migration, to `published_at`'s role as the sole public
gate, or to `paid`'s independence from it. Neither this stage's
migration nor Stage 2/3's is applied to the live project.

### Preview-token architecture

A preview credential is a single, cryptographically random 256-bit
value (`node:crypto`'s `randomBytes(32)`, base64url-encoded — 43
characters, directly usable as a `/preview/[token]` path segment with no
escaping), generated ONLY in trusted Node server code
(`src/lib/preview-tokens.server.ts`) and never anywhere in SQL. Only its
SHA-256 hex hash is ever stored (`invite_previews.token_hash`) — the raw
token exists in memory for exactly as long as it takes to hash it and
return it once to the administrator who created it, then is gone: never
logged (verified by `preview-admin.server.test.ts`'s "never logs the raw
token, on any path" test), never written to any table, never persisted
in the browser beyond one component's in-memory state
(`PreviewLinkTool.tsx`, no `localStorage`/`sessionStorage` write
anywhere in it).

Creation and verification deliberately hash in two different places, for
two different reasons: creation hashes in Node, BEFORE the raw token is
ever sent to Postgres at all — not even as a transient RPC argument that
could appear in a connection-level query log — because that path is a
trusted, authenticated, low-volume administrator action where keeping
the raw token out of the database entirely is the stronger guarantee.
Verification (`get_invite_preview(p_token text)`) instead accepts the
RAW token and hashes it INSIDE the SECURITY DEFINER function itself,
using Postgres's own `pgcrypto` (`encode(digest(p_token, 'sha256'),
'hex')`) — because that path is anonymous-reachable and high-volume (any
guest with a valid link, or an attacker guessing), and a single, minimal-
surface, atomic hash-and-compare inside one trusted function is the
safer shape for something `anon` can invoke arbitrarily, rather than
trusting every future caller to hash correctly before calling. Both
computations independently produce byte-identical output for the same
input (verified directly by `tests/integration/private-preview.test.ts`'s
first test, and by `preview-tokens.server.test.ts` against Node's own
`createHash`) — this is what makes a token created one way actually
redeemable the other way.

`isValidPreviewTokenFormat()` (same file) rejects anything that isn't
exactly 43 base64url characters before a route ever calls the database —
the same "high-confidence input validation before a DB call" principle
Stage 4 established for `isValidSlug()`.

### Database migration and RLS

One new table, `invite_previews` (`supabase/migrations/
20260910120000_private_preview_links.sql`): `invite_id` is the PRIMARY
KEY (not just unique) — "one active preview link per invitation" is
enforced structurally, not by convention, since a second row for the
same invitation is literally impossible to insert. `token_hash` is
`unique` (efficiently searchable via a real index, and a second,
schema-level collision guarantee). `revoked_at` (nullable — null means
active) and `rotated_at`/`created_at`/`created_by` cover the required
audit timestamps. RLS is enabled with **zero policies for any role** —
the same deny-all-by-construction posture as `app_admins` (Stage 2):
anonymous and ordinary-authenticated reads, and ALL direct writes
(insert/update/delete), are denied for everyone, including an
administrator's own ordinary client — proven directly by
`tests/integration/private-preview.test.ts`'s RLS section, including the
specific case of an administrator attempting a raw insert and still
being rejected. Every legitimate operation goes through one of four
`SECURITY DEFINER` functions instead, each independently re-checking
`is_admin()` (writes) or a hashed-token match (the one read), matching
this project's established `set search_path = ''` / fully-qualified
`public.*` pattern against search-path hijacking.

`get_invite_preview()` never gates on `published_at` — token possession
is the entire authorization for a preview, by design ("work for
unpublished and published invitations"). It returns the same shape of
restraint as `get_published_invite()` (no `answers`/`owner_id`/
`paypal_order_id`, and here also no `token_hash`, structurally — these
are not in the function's `returns table (...)` at all), plus
`published_at` itself (returned, not gated on) so the preview page can
honestly show whether the invitation is also live at its own public URL.
`get_published_invite()`'s own definition is untouched by this
migration — a preview token has zero effect on what the ordinary
`/invite/[id]` path returns, proven directly by an integration test.

### Token creation, rotation, and revocation

`src/lib/preview-admin.server.ts` — `createPreviewLink()`,
`rotatePreviewLink()`, `revokePreviewLink()`, each: re-verifies
`checkAdmin()` (the same real, database-backed `is_admin()` check every
other admin surface in this project uses) before doing anything else;
generates/hashes a token only on success; calls the matching
`admin_*_invite_preview()` SQL function through the SESSION-AWARE server
client (never the service-role client — the service-role key is never
referenced by this module, let alone sent to a browser); fails CLOSED
on every error path (`ok: false` with a specific reason — `not-admin`,
`already-exists`, `invite-not-found`, `not-found`, or `database-error` —
never a default success). The raw token is returned exactly once, from
the return value of a successful create/rotate call, and nowhere else.

Reachable through one minimal, deliberately bare admin-only control:
`src/app/api/admin/invite-previews/route.ts` (re-checks `checkAdmin()`
itself too, defense-in-depth) plus `src/app/admin/PreviewLinkTool.tsx` —
paste an invitation's internal uuid, click Create/Rotate/Revoke, the raw
token (as a full `/preview/...` URL) is shown once in component state
and never persisted anywhere in the browser either. This is explicitly
NOT the request-management UI or the concierge admin editor — no
invitation search/browse exists; an administrator supplies the uuid
directly, permitted by this stage's own scope ("a minimal admin-only
control may be added if required, but avoid designing the generator
interface").

### Preview route behavior

`src/app/preview/[token]/page.tsx` — its own route, not folded into
`/invite/[id]` (the task's own instruction, followed literally: one URL
shape, one credential type, no risk of a preview token ever interacting
with `?guest=` handling or a future public-route caching decision).
Async Server Component, `force-dynamic`, never calls
`supabase.auth.getUser()` (there is no code path in this file that could
even check a session — "never require the client to sign in" is a
structural fact here, not a UX choice), never imports `getInviteServer()`
or anything admin-related. Validates token format before the one
database call (`getInvitePreviewServer()` → `get_invite_preview()`),
builds an `InviteViewModel` via the new `buildPreviewInviteViewModel()`
(`src/lib/invite-view-model.ts`) — reusing the SAME `PublicInviteView`
presentation component the public and owner-management routes use, so a
preview is a genuinely faithful rendering of what guests will eventually
see, not a separately-maintained approximation. `PreviewBanner.tsx`
(server-rendered, no client JS) shows the required "Preview" indicator
and honestly reflects whether the invitation is also independently
published — computed from the RPC's own `published_at`, nothing
sensitive disclosed beyond what the link's own possessor already has
access to.

An invalid, malformed, rotated, or revoked token all produce the
IDENTICAL response — `UnavailableInvite` (Stage 4's existing "one safe
unavailable response" component, reused as-is, with a
`homeHref`/`homeLabel` addition that changes only where its one link
goes, never what it says) — proven by a test asserting a malformed-token
render and a valid-but-rejected-token render are byte-for-byte the same
HTML.

RSVP is enabled or disabled based on the invitation's REAL publication
state, not on being in preview mode at all: `InviteViewModel` gained an
`isPublished` field (true for every pre-Stage-5 caller — the public
route and demo invites — a no-op change there, confirmed by the existing
Stage 4 test suite passing unmodified in substance) that
`buildPreviewInviteViewModel()` sets to the actual `published_at`
result. `PublicInviteView` now gates its RSVP section on `isPublished`,
not just tier — an unpublished invitation viewed via a preview token (or
by its own owner before publication, see below) never gets a working-
looking RSVP form that would only fail server-side anyway; a published
invitation viewed the same way still allows RSVP, exactly as it would at
its own public URL. Guest personalization is structurally impossible
through this path — `get_invite_preview()` has no guest-token parameter
at all, and `buildPreviewInviteViewModel()` always sets `guestId`/
`guestName` to `undefined`. The raw token itself is never threaded into
any component prop — `page.tsx` uses it only as a local variable to make
one database call, then discards it; only the already-sanitized `model`
(built server-side) is passed to `PreviewBanner`/`PublicInviteView`.

### Metadata and privacy protections

`generateMetadata()` for `/preview/[token]` is a plain, synchronous,
constant function — it never reads the token and never touches the
database, so there is no code path by which a real headline, date, or
name could ever reach a `<title>`, a social-preview card, or a synced
browser-history tab title. Sets `robots: { index: false, follow: false
}` and `referrer: "no-referrer"` unconditionally; omits the `openGraph`
block entirely rather than filling it with generic text, so a link-
unfurling bot has nothing invitation-shaped to render. `/dashboard/
invite/[id]` also sets `robots: { index: false, follow: false }` — an
authenticated management surface, not content meant to be discovered.
No `sitemap.ts`/`robots.ts` exists anywhere in this project (confirmed
by search before writing this section), so "do not include preview URLs
in a sitemap" is trivially, structurally true — there is nothing that
enumerates routes for one to list. No analytics integration exists in
this project either (confirmed by the same search) — "ensure tokens
cannot leak through analytics" has nothing to guard against yet, but is
worth re-checking the day analytics is actually added, since a naive
`pathname`-based event would capture the raw token verbatim.

**Infrastructure access logs are explicitly NOT covered by any of the
above and must be treated as sensitive.** Vercel's (or any other
host's/CDN's/reverse proxy's) request/access logs record the full
request path, including a preview token — noindex/nofollow/referrer
policy only affect browser and crawler behavior, not what infrastructure
itself logs. Anyone with access to those logs can read a token verbatim
for as long as the log retention window keeps it. This is a real,
inherent property of putting a bearer credential in a URL path (the only
practical way to make a link "just work" with no login), not a defect
this stage introduces — but it is why rotation/revocation exist as real,
immediately-effective operations rather than decorative ones, and it
belongs explicitly in any future production runbook for who may access
raw infrastructure logs.

### Owner-management route behavior

`src/app/dashboard/invite/[id]/page.tsx` — the real authorization
boundary, server-side, checked in this exact order: (1) is there a real
session at all (`createServerSupabaseClient()` + `auth.getUser()`) — if
not, `redirect()` to `/login?next=...` (the existing, already-audited
`sanitizeRedirectPath()`, so this redirect target can't be turned into
an open redirect either); (2) does `getInviteServer(id)` — the
OWNER-ONLY read, gated by `invites`' own `owner_id` RLS policy from
Stage 0/Auth — return a row for the now-confirmed signed-in caller? A
different, genuinely authenticated user's request for someone else's
invite gets exactly the same `null` here as a slug that doesn't exist at
all, and BOTH render the identical `UnavailableInvite` response (with
`/dashboard`-scoped copy) — "another authenticated user must receive a
safe denied/not-found response," never a distinguishable one, proven by
a test asserting the two renders are byte-identical. `proxy.ts`'s
existing `/dashboard/:path*` optimistic redirect still covers this route
too (it's a prefix match), but is not what this page relies on — deleted
entirely, this page would still correctly gate every request on its own.

`OwnerManagementBar.tsx` (Stage 4's `OwnerPreview`, hardened and
relocated — `InviteClient.tsx` is deleted this stage, its behavior
genuinely moved rather than merely disconnected) no longer performs its
own ownership check: Stage 4's version independently fetched via the
browser client and treated "did that return a row" as a second,
redundant, client-side authorization decision. It now trusts a
server-verified `initial` prop completely — a new, deliberately narrow
`OwnerInviteViewModel` (`src/lib/owner-invite-view-model.ts`: `inviteId`/
`tier`/`paid`/`publishedAt`/`guestList` only, never the raw `answers`
survey blob or `content`) built server-side from the same
`getInviteServer()` call that already proved ownership. The one
remaining client-side fetch (`getInvite()`, after a completed PayPal
payment, to refresh the UI) is a legitimate post-action refresh, not a
second authorization boundary — and its result is narrowed through the
same `buildOwnerManagementViewModel()` builder before ever reaching
component state, so the wider raw invite value never lives in state,
only in a local variable for the instant it takes to narrow it. The
invitation's own content is rendered via the SAME `PublicInviteView`
component the public and preview routes use, built from a new
`buildOwnerInviteViewModel()` (`src/lib/invite-view-model.ts`) — an
owner previewing their own unpublished invitation sees genuinely the
same rendering their eventual guests will.

### Public-route isolation

`/dashboard/invite/[id]` is a fully separate route from `/invite/[id]`
and `/preview/[token]` — neither imports anything from it, in either
direction. Verified two ways against the actual production build (not
just reasoned about): (1) each route's real RSC client-reference
manifest was decoded directly — `/invite/[id]` and `/preview/[token]`
resolve to the IDENTICAL four client chunks; `/dashboard/invite/[id]`
resolves to those same four PLUS one additional chunk, and only that one
extra chunk contains the strings `OwnerManagementBar` and
`sandbox.paypal.com` (grepped across every chunk in `.next/static/
chunks/` — those strings appear in exactly one file, total, across the
whole build). (2) `.next/diagnostics/route-bundle-stats.json`'s own
first-load byte counts: `/invite/[id]` and `/preview/[token]` are both
865,593 bytes across 9 chunks — byte-for-byte identical, not just close
— while `/dashboard/invite/[id]` is 875,304 bytes across 10 chunks. This
is Next's bundler doing what it always does (exclude a module with zero
importers from a given route's build), the same mechanism Stage 4
already relied on and verified — Stage 5 re-verifies it holds for the
now-three-way split (public / preview / owner-management) instead of
Stage 4's two-way one.

### What was not built (explicitly out of scope this stage)

Per the task: no composition generator, no request-management UI, no
final invitation animation system, no cultural packs, no approval
workflow. `PreviewLinkTool.tsx` is the one, explicitly-permitted minimal
exception — deliberately not a search/browse interface. Pricing/PayPal
behavior is unchanged (`src/lib/tiers.ts` and the PayPal order/capture
routes are untouched). `/survey` remains fully reachable, unaffected.

### Remaining risks and decisions

- **Infrastructure access logs remain the one channel these protections
  don't cover** (see above) — a real production rollout needs an
  explicit decision about who can read raw request logs and for how
  long, before real preview links are issued.
- **No expiry.** A preview link is valid until an administrator
  rotates or revokes it — there is no automatic time-based expiration.
  This matches the task's scope (rotation/revocation were required;
  expiry was not) but is worth a deliberate decision before production
  use, not a silent gap.
- **The minimal admin control has no invitation lookup/search.** An
  administrator must already know (or separately look up, e.g. via the
  local database directly) an invitation's internal uuid to issue a
  preview link for it — acceptable for this stage's scope, not for a
  real concierge workflow, which needs the (explicitly out-of-scope)
  request-management UI.
- **One preview link per invitation, not per reviewer.** If a concierge
  client shares their preview link further, there is no way to tell
  multiple viewers apart or revoke just one of them — rotating/revoking
  affects the single shared link entirely. Acceptable for a first
  version; a future iteration could consider per-recipient tokens if
  that need materializes.

### Recommended Stage 6 scope

The concierge approval workflow that connects these two pieces: a
client-facing way to approve/reject from their preview view (still none
today — a preview is read-only, as required), and the request-management
UI that would let an administrator find an invitation to issue a preview
link for without needing its raw uuid.

## Stage 6 — versioned composition schema, renderer registry, and wedding-first cultural-pack foundation (2026-09-10)

Builds the deterministic core of the browser invitation generator:

> Structured invitation data → validated composition → trusted component
> registry → server-rendered invitation.

Two new, forward-only migrations. No change to `published_at`'s role as
the sole public gate, to `paid`'s independence from it, or to any prior
migration's behavior except the two CHECK constraints Part C's own scope
specifically targets (see "Event and wedding model" below). Neither
migration is applied to the live project.

### Composition architecture

Before this stage, an invitation's presentation was either the legacy
`GeneratedInviteContent` shape (`content` — headline/subheadline/welcome
message/a flat event-details list/closing line/a suggested palette) or,
for generator-era rows, an entirely unread `composition` jsonb column
(Stage 0 recovered it live but confirmed "no application code in this
repository reads or writes yet"). This stage makes `composition` the
one real, structured representation every invitation renders from —
`InviteViewModel` (Stage 4/5) still exists and is unchanged in shape,
but it now feeds INTO a composition rather than being the thing
rendered directly:

```
raw composition jsonb (or none)
        │
        ▼
resolveComposition(model, rawComposition)   src/lib/composition/resolve.ts
        │
        ├─ rawComposition present  → parseComposition() (Zod) → valid → render it
        │                                                    → invalid → UnavailableInvite (NEVER falls back to legacy)
        │
        └─ rawComposition absent   → adaptLegacyContentToComposition(model)  (always valid)
                        │
                        ▼
        InvitationComposition (validated, trusted)
                        │
                        ▼
        CompositionRenderer  →  registry lookup per section  →  server-rendered HTML
```

The single most important rule (Part F, followed exactly): a REAL,
present composition that fails validation is a hard failure, not a
signal to fall back to `content` — `resolveComposition()`'s own
docstring states this, and `page.test.tsx`'s "an invalid-but-present
composition never falls back to legacy content" class of test (see each
route's test file) proves it. Only the ABSENCE of a composition
triggers the legacy adapter.

### Schema version and validation rules

`src/lib/composition/schema.ts` — `InvitationCompositionSchema`, a
strict, versioned Zod schema. `schemaVersion` is a `z.literal(1)`
today (`COMPOSITION_SCHEMA_VERSION`) — any other value, or a missing
one, fails validation outright (schema.test.ts, "invalid schema
versions fail"). Every object in the document — the top level, every
section, every nested item (schedule entries, gallery items) — is
`.strict()`: an unrecognized key doesn't get silently dropped (Zod's
default), it fails the whole document ("reject unknown dangerous
fields," not "ignore fields we didn't expect").

Safety is structural, not conventional:
- every free-text field goes through `safeText()` — rejects any `<`/`>`
  outright (so no HTML tag of any kind can survive), plus
  `javascript:`-looking and inline-event-handler-looking substrings as
  defense in depth;
- every URL (`mapLink.url`, `gallery[].imageUrl`) goes through
  `safeUrl()` — an allowlist of `https:`/`http:`/`mailto:`/`tel:`
  protocols or an internal `/path`, never `javascript:`/`data:`/
  anything else;
- every "which visual treatment" choice — `themeTokens.paletteId`,
  `designPackId`, `featureConfig.ambientMotif`, `locale`, `dir`,
  `eventCategory`, `weddingContext.occasionId` — is a closed `z.enum(…)`
  built directly from a trusted TypeScript registry (never a
  hand-duplicated list that could drift), so an unregistered value is
  rejected by construction, not by a runtime check that could be
  forgotten;
- section `type` is one of exactly fifteen literal strings
  (`z.discriminatedUnion("type", […])`) — never a free string a
  database row could turn into an arbitrary component/class/import.

Limits (`LIMITS` in schema.ts, Part B's "sensible limits"): short/
medium/long text (200/600/2000 chars), up to 24 sections per
composition, up to 12 schedule entries, up to 12 gallery items — all
centralized in one object so tests assert against the real numbers,
never a second hardcoded copy. No Tailwind class list or raw CSS is
ever accepted anywhere in the schema — `themeTokens` is a palette ID
(resolved server-side against a trusted registry, see "Theme tokens"
below) plus an optional hex-only override, nothing else.

**Trusted section vocabulary** (Part B's starting fifteen, all
implemented): opening, greeting, intro, welcome, story, schedule,
dateTime, venue, mapLink, dressCode, gallery, rsvp, music, closing,
customText. Every section carries a stable `id` (a conservative
lowercase-hyphen slug), a known `type`, Zod-validated `data`, and an
explicit `enabled` boolean — a disabled section is validated exactly
like an enabled one but never rendered (CompositionRenderer.test.tsx).
Order is the array's own order — no separate numeric `order` field to
drift out of sync with it; duplicate section ids are rejected
(`superRefine`), so ordering is always deliberate and unambiguous.

### Event and wedding model

`supabase/migrations/20260910130000_wedding_event_taxonomy.sql` — Part
C. Replaces the permanent Hindu-wedding-only CHECK constraint on
`invites.occasion` (`haldi`/`sangeet_mehendi`/`wedding_day`/`reception`
only, flagged a KNOWN LIMITATION since Stage 0) with a general,
extensible model:

- a new `event_types` lookup table (`id` text primary key — the stable
  MACHINE IDENTIFIER, never display text, as database truth — `label`,
  `is_legacy`, `sort_order`), RLS-enabled with a single public-read
  policy (it's vocabulary, not sensitive), no write policy for anyone
  but a trusted migration/service-role;
- `invites.occasion` becomes a real FOREIGN KEY into `event_types`
  (scalar FKs are fully supported by Postgres directly — the textbook
  fix for a hardcoded enum);
- `templates.occasion` gets the identical fix;
- `requests.requested_occasions` (a text ARRAY, which Postgres cannot
  constrain with a plain FK) gets a `BEFORE INSERT OR UPDATE` trigger
  (`check_requested_occasions_valid()`) validating every array element
  against `event_types`, the array-shaped substitute for the FK;
- a new `invites.occasion_custom_label` column, usable only when
  `occasion = 'custom'` (its own CHECK constraint, mirrored by
  `WeddingContextSchema`'s `superRefine()` at the application layer —
  the same rule enforced twice, deliberately) — "allow safe custom
  display labels while keeping stable internal identifiers."

The vocabulary itself (`src/lib/composition/event-types.ts`, the single
TypeScript source of truth the migration's seed data mirrors exactly —
`tests/integration/wedding-event-taxonomy.test.ts` asserts the two
never drift apart, in both directions): `engagement`, `haldi`,
`mehendi`, `sangeet`, `civil_ceremony`, `religious_ceremony`, `nikah`,
`wedding_ceremony`, `reception`, `dinner`, `custom` — plus the four
ORIGINAL values preserved verbatim (`haldi`/`reception` folded into the
list above as ordinary, non-legacy entries since they're perfectly
general terms; `sangeet_mehendi`/`wedding_day` kept reachable but
flagged `isLegacy: true`, since the new vocabulary splits/renames them
— an EXISTING row using either legacy id keeps meaning exactly what it
always meant, never reinterpreted, never migrated automatically).
"A wedding may contain multiple events" is supported two ways: several
separate invitations (each its own link, each scoped to one occasion
via `invites.occasion`) for one conceptual wedding, and/or one
invitation's own `schedule` section holding several dated entries, each
optionally tagged with its own `eventTypeId` — neither requires a
"weddings" table of its own, and neither forces a cultural pack to use
every event type it doesn't need (`supportedEventTypeIds` per pack, see
below). `custom` plus `event_types` being a plain lookup table (new
rows, not new migrations) is what keeps this "capable of adding
birthdays and corporate events later without redesigning the core"
(Part C requirement 10) — a birthday-specific event type is a future
INSERT, not a schema change.

### Cultural packs implemented

`src/lib/composition/cultural-packs.ts` — Part D. A pack is METADATA
and STRUCTURAL DEFAULTS only: supported event types, a suggested
section order, wording GUIDANCE (for whoever authors real copy — never
rendered to a guest verbatim, never treated as actual content), a
palette id, a motif id, a motion id, and optional, neutral ceremony
terminology. Two packs are defined this stage:

- **`neutral-classic`** — the respectful default for civil ceremonies,
  interfaith couples, or any wedding (or non-wedding category) that
  doesn't want a specific cultural framing. Wording guidance
  deliberately says: avoid assuming a specific family structure,
  religious tradition, or gendered role.
- **`hindu-wedding`** — a starting point for a multi-event Hindu
  wedding (haldi/mehendi/sangeet/wedding ceremony/reception). Wording
  guidance is explicit that Hindu wedding customs vary widely by region
  and family, and that ritual names/order must be confirmed with the
  client — never invented. `ceremonyTerminology` supplies only common,
  editable naming (e.g. "Haldi", "Mehendi") — no religious claim is
  hardcoded as universal truth, and everything here remains editable by
  the administrator and client when authoring a real composition.

Neither pack produces final visual artwork this stage — both reuse
already-approved, existing palette tokens (`src/lib/composition/theme.ts`
— the same CSS custom-property references `src/lib/tiers.ts` has always
used for the four pricing tiers, plus two new entries for these two
packs, all still resolved server-side from a closed id, never a raw
CSS/class string a composition could carry).

**Future packs, explicitly not registered, not selectable** (documented
in cultural-packs.ts's own comment, so the next addition has an obvious
place to land): Muslim wedding (nikah-centered), Christian wedding,
civil wedding (distinct from neutral-classic if a dedicated framing
proves useful), Mauritian multicultural wedding (the product's own home
market — see the `mfe` Kreol Morisien locale already in
`src/lib/i18n/translations.ts`), birthday, corporate. `designPackId` in
the Zod schema is a `z.enum` built directly from `CULTURAL_PACKS`'s own
keys — a future-pack id is rejected by validation, not merely absent
from a UI, proven directly by schema.test.ts and cultural-packs.test.ts
both asserting every one of the six future ids above is currently
REJECTED.

### Renderer registry and section components

`src/components/composition/registry.tsx` — a plain, static object
literal mapping each of the fifteen known `SectionType` strings to a
statically-imported React component (`src/components/composition/
sections.tsx`). Never a dynamic import, never `require(dbString)`,
never any mechanism that could resolve an arbitrary component name from
data — every value in the registry is a component this file itself
imports by name at the top. `resolveSectionComponent()` is the one,
unconditionally-safe lookup (`undefined` for an unknown type, never a
throw) `CompositionRenderer.tsx` calls — exercised directly (bypassing
TypeScript's own guarantee that this can't normally happen) by
registry.test.ts's "unknown registry types fail safely."

`CompositionRenderer.tsx` replaces the old, monolithic
`PublicInviteView.tsx` (deleted this stage): walks a validated
composition's `sections`, dispatches each enabled one to its registered
component, wrapped in the existing Stage-4 `AnimateIn` scroll-reveal
(active only when `featureConfig.motion` is set). Two sections get
special placement matching the pre-Stage-6 layout: `greeting` renders
un-animated, before the sequence (a personalized banner that should
already be visible); `music` renders as a fixed-position overlay
outside the centered column (unaffected by DOM nesting — `position:
fixed` doesn't care). Nine of the fifteen components
(opening/greeting/welcome/dateTime/schedule/gallery/rsvp/music/closing)
are close structural ports of the deleted component's own markup — same
visible text, same conditions, same per-section classNames — so a
legacy-content invitation renders equivalent output to before (NOT
byte-identical DOM — see sections.tsx's own comment on the one
deliberate structural difference: spacing now lives on the renderer's
wrapper rather than merged into each section's own top-level className,
adding one harmless extra `<div>` per section, invisible to every
existing text/attribute-based test). The other six
(intro/story/venue/mapLink/dressCode/customText) are new, minimal
structural blocks — no legacy invitation ever produces them; they exist
for a real, richer composition to use. No large page-builder dependency
was added — every component is a few lines of plain JSX reusing this
project's existing Tailwind vocabulary.

Used identically by all three rendering surfaces — public
(`/invite/[id]`), private preview (`/preview/[token]`), and
owner-management (`/dashboard/invite/[id]`) — each now builds its own
`InviteViewModel` (unchanged Stage 4/5 logic) plus reads its own raw
`composition` column, resolves the two into a composition via
`resolveComposition()`, and renders through the identical
`CompositionRenderer`. RSVP availability is gated on `canRsvp` (built
from `model.isPublished`, itself unchanged Stage 5 logic) INSIDE the
`RsvpSection` component itself, independent of what a composition's own
`rsvp` section says — a static document has no way to know an
invitation's current publication state, so this is re-checked at render
time regardless, preserving Stage 5's "never enable RSVP for an
unpublished preview" exactly. Guest personalization is injected purely
from render context (`ctx.guestName`), never stored in a section's own
data — a composition is one shared document for every viewer.

### Legacy compatibility

`src/lib/composition/legacy-adapter.ts` — Part F, `adaptLegacyContentToComposition()`.
Explicitly, permanently temporary (its own header comment says so): it
exists only because pre-Stage-6 rows (every self-service invite ever
created, including by the still-fully-functional `/survey` flow) have
`content` but no real `composition`. Field-by-field mapping (documented
exhaustively in the file's own header, exercised by
legacy-adapter.test.ts): headline/subheadline → `opening`; a resolved
guest name → a `greeting` section (present/absent only, never carrying
the name itself); welcomeMessage → `welcome`; eventDate (when set AND
tier isn't bronze — the exact pre-Stage-6 condition) → `dateTime`;
eventDetails → `schedule`, unconditionally; suggestedPalette (gold/
platinum only) → `gallery`, as color-swatch-only items; RSVP (tier
isn't bronze AND isPublished — Stage 5's rule, carried through exactly)
→ `rsvp`; song (gold/platinum only) → `music`; closingLine → `closing`.
Fails safely: the adapter always builds its own draft, then re-validates
it through the same `parseComposition()` every other caller uses before
returning — a defensive check (this function fully controls every
field it writes, there's no untrusted input to reject in the expected
case), proven by legacy-adapter.test.ts's "returns null rather than
throwing" tests using deliberately oversized content. No database
rewrite: existing rows keep `composition: null` forever unless a future
administrator action gives them a real one — the adapter runs on every
request instead, a deliberate, documented trade-off given this stage's
"no full editor UI" restriction.

### Server-side authoring and authorization

`src/lib/composition-admin.server.ts` — Part G, the same fail-closed,
`checkAdmin()`-gated shape as Stage 5's `preview-admin.server.ts`:
- `validateComposition()` — pure, no I/O, the one gate between
  arbitrary data and anything this project stores or renders.
- `buildCompositionFromPack()` — seeds a fresh draft from a trusted
  pack's defaults; returns `null` for any unregistered pack id (the
  OTHER place "future pack identifiers cannot be falsely selected"
  is enforced, not just at Zod-validation time).
- `saveInviteComposition()` — checks `checkAdmin()` FIRST (before
  touching the proposed composition at all — reject an unauthorized
  caller before doing any work on, or revealing anything about, their
  input), then validates, then calls the database function below
  through the SESSION-AWARE server client — never the service-role
  client, so the real authorization decision is `is_admin()` reading
  the caller's own session.

`supabase/migrations/20260910140000_composition_authoring.sql` — Part
G/H:
- extends the existing `reject_client_paid_update()` trigger (already
  guarding `paid`/`paypal_order_id`/`published_at` since Stage 0/3) with
  a THIRD, independent guard: `composition`, `design_spec`,
  `generator_content`, `generator_kind`, `occasion`,
  `occasion_custom_label` can now only change via `service_role` or a
  new transaction-local `enveloped.composition_action` flag — never a
  plain owner/anonymous/unrelated-user PostgREST update, proven directly
  by `tests/integration/composition-authoring.test.ts` against every one
  of those four caller types, including an administrator's OWN raw
  client (composition can only be set through the function below, same
  design as `publish_invite()`/`unpublish_invite()`);
- `admin_save_invite_composition(p_invite_id, p_composition, p_occasion,
  p_occasion_custom_label)` — `is_admin()`-gated, `SECURITY DEFINER`,
  full-replacement semantics (not a partial patch — appropriate for this
  stage's "no editor UI" scope). Does NOT re-validate composition
  SHAPE (that's `validateComposition()`'s job, already done before this
  is ever called) — the one thing it DOES enforce is that `p_occasion`,
  when supplied, is a real, registered `event_types` id.

No public composition API exists — the only caller is the minimal admin
control path this stage adds nothing new to (Stage 5's
`PreviewLinkTool.tsx`/`/admin` remain the only admin-only UI; no
composition-authoring UI was built, per this stage's own restriction).

### Database/RPC changes

`get_published_invite()` (Stage 3) already returned `composition`,
unused until now — no migration change needed there. `get_invite_preview()`
(Stage 5) did NOT yet return it — `20260910140000_composition_authoring.sql`
drops and recreates it (required for a `returns table (...)` shape
change, the same SQLSTATE 42P13 lesson from Stage 1) with `composition
jsonb` added, returned UNCONDITIONALLY (a preview token's own
authorization already doesn't gate on `published_at`, see Stage 5 —
consistent). `PublicInvite`/`PreviewInvite`/`StoredInvite`
(`src/lib/storage-queries.ts`) all gained a `composition: unknown | null`
field, mapped straight through from the RPC/table row, always RAW and
UNVALIDATED — every caller must pass it through
`resolveComposition()`/`parseComposition()` before ever rendering it;
none of the three sanitized reads validates it themselves, by design
(validation is a rendering-time concern, and the exact same raw value
needs to reach the owner's, the guest's, and the preview viewer's
`resolveComposition()` call unmodified).

Confirmed NOT exposed through any public/preview RPC, structurally (not
in either function's `returns table (...)` shape at all): raw request
answers, owner IDs, payment details, PayPal identifiers, admin
membership, preview token hashes, internal notes, or any composition
data for an invitation that isn't published (public RPC) or whose token
doesn't match (preview RPC) — proven directly by
`tests/integration/composition-authoring.test.ts`'s "an UNPUBLISHED
invite's composition is null through the public RPC, even if one is
saved" and the exact-key-set assertions in both that file and the
updated `private-preview.test.ts`.

### Security and bundle isolation

Verified against the real production build, not just reasoned about:
`/invite/[id]` and `/preview/[token]` remain byte-identical in
first-load JS (865,689 bytes, 9 chunks — a ~96-byte increase from Stage
5's 865,593, from the composition renderer's small additional logic,
still smaller than the pre-Stage-4 882,497 baseline);
`/dashboard/invite/[id]` remains the ONLY route whose one extra chunk
contains `OwnerManagementBar`/`sandbox.paypal.com` strings, grepped
across every chunk in the entire build. The three-way isolation Stage 5
established (public/preview/owner) holds exactly as before — Stage 6's
composition renderer is used by all three, but the renderer itself
carries no owner-management or PayPal code, so sharing it introduces no
new leak path.

### What was not built (explicitly out of scope this stage)

Per the task: no full admin drag-and-drop editor (the "minimal admin
control" restriction — no composition-authoring UI exists at all yet,
only the server-only functions a future one would call into, mirroring
how Stage 5's `PreviewLinkTool.tsx` became the UI for
`preview-admin.server.ts`), no approval workflow, no final visual
designs (both cultural packs reuse existing palette tokens), no
advanced animation, no AI generation changes, no media/upload pipeline
(gallery items remain color-swatch-only or, for a future real
composition, a trusted URL — no upload surface was added), no
production deployment.

### Confirmation production was untouched

No migration applied to production, no live administrator bootstrapped,
no production data/user/config modified, `.env.local` untouched, no
secrets printed, no deployment, no merge to `master`, no pull request.
Both of this stage's migrations are verified only against the local
Supabase stack, exactly like Stages 2, 3, and 5's before them.

### Remaining risks and owner decisions

- **The legacy adapter is a standing, permanent-until-migrated cost.**
  Every pre-Stage-6 invitation (and every new self-service one — Part F
  said not to change `/survey`, and this stage didn't) re-derives its
  composition on every single request rather than having one stored.
  Cheap today (pure, dependency-free, no I/O), but a future stage should
  decide whether to eventually backfill real compositions for these rows
  or keep the adapter indefinitely.
- **`buildCompositionFromPack()`'s generated defaults are placeholder
  copy** ("You're Invited", "We would be honored to have you join
  us.") — meant to be edited before publishing, not final wording; there
  is no guard today preventing an administrator from accidentally
  publishing an un-edited default (a future editor surface's job, not
  this stage's).
- **No composition versioning/migration mechanism is exercised yet** —
  `COMPOSITION_SCHEMA_VERSION` is `1` everywhere, and the schema itself
  is the only thing gating it. See "How future schema versions will be
  migrated" below for the intended shape once a `2` actually exists.
- **Cultural-pack wording guidance is advisory only** — nothing enforces
  that an administrator actually follows a pack's own "confirm with the
  client, never invent" guidance; this is a process/training concern
  this stage's scope doesn't reach.

### How future schema versions will be migrated

Not built this stage (no `2` exists yet to migrate to or from), but the
seam is deliberate: `schemaVersion` is a real, validated, required field
on every stored composition (never inferred), so a future
`InvitationCompositionSchemaV2` can coexist with `InvitationCompositionSchemaV1`
in `src/lib/composition/schema.ts`, and `parseComposition()` (or a
`parseCompositionAny()` successor) can branch on the stored
`schemaVersion` before picking which schema to validate against — the
same discriminated-shape pattern this stage's own `SectionSchema`
already uses for section `type`. A future migration would then be a
pure, testable `migrateCompositionV1ToV2()` function (the same shape as
`legacy-adapter.ts`'s `adaptLegacyContentToComposition()`, which is
effectively "migrate legacy `content` to composition v1" already), run
either lazily at read time (like the legacy adapter) or as a one-time
backfill, administrator-triggered through the same
`admin_save_invite_composition()` boundary — never a client-triggered
migration, and never a silent reinterpretation of stored data (the same
principle Part C's event-taxonomy migration already followed for
existing `occasion` values).

### Why arbitrary HTML/CSS/JavaScript is forbidden

Stated as a hard requirement in the task and enforced structurally, not
by convention, for three compounding reasons: (1) this is
GUEST-FACING, publicly-reachable rendering — the public route, the
preview route, and (indirectly, since a composition an owner sees is
the same one their guests eventually will) the owner route all render
whatever a stored composition contains, to an anonymous audience with
no login and no trust relationship with whoever authored it; (2) the
authoring boundary itself (`admin_save_invite_composition()`) is
currently administrator-only, but the schema's safety must not depend
on that staying true forever — a future, more permissive authoring
surface (a client-facing editor, say) must inherit the exact same
guarantees without a design change, which only holds if the schema
itself, not the caller's identity, is what makes injection impossible;
(3) `dangerouslySetInnerHTML` (or any equivalent) is never used anywhere
in this rendering path — every section component receives already-typed,
already-validated fields (a string, a hex color, an enum, a validated
URL) and interpolates them as ordinary React children/attributes, which
React itself escapes — so even a schema bug that let something
HTML-shaped through the Zod layer would still render as inert text, not
executable markup. Three independent layers (validation rejects it,
authorship is trusted, and React's own escaping is the last line of
defense), not one.

### Recommended Stage 7 scope

Two candidate directions, both explicitly out of this stage's own
scope: (1) the concierge approval workflow Stage 5 already recommended
(a client-facing approve/reject surface reading from `/preview/[token]`,
and the request-management UI to find an invitation without its raw
uuid) — now naturally paired with a minimal composition-authoring
control (mirroring `PreviewLinkTool.tsx`'s own minimal shape) so an
administrator can actually call `saveInviteComposition()`/
`buildCompositionFromPack()` through something other than a script; (2)
extending `/survey` (or a new concierge-intake equivalent) to synthesize
a real composition at creation time instead of relying on the legacy
adapter indefinitely — reducing, invitation by invitation, how much
rendering permanently depends on Part F's deliberately-temporary code
path.

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
| Server-rendered public invitation (Stage 4) | `src/app/invite/[id]/page.tsx`, `src/lib/invite-view-model.ts`, `src/components/invite/PublicInviteView.tsx`/`UnavailableInvite.tsx`/`AnimateIn.tsx` |
| Private preview links (Stage 5) | `supabase/migrations/20260910120000_private_preview_links.sql`, `src/lib/preview-tokens.server.ts`, `src/lib/preview-admin.server.ts`, `src/app/preview/[token]/page.tsx`, `src/components/invite/PreviewBanner.tsx`, `src/app/api/admin/invite-previews/route.ts`, `src/app/admin/PreviewLinkTool.tsx` |
| Owner-management route (Stage 5) | `src/app/dashboard/invite/[id]/page.tsx`, `OwnerManagementBar.tsx`, `src/lib/owner-invite-view-model.ts` |
| Stage 5 tests | `src/lib/preview-tokens.server.test.ts`, `preview-admin.server.test.ts`, `src/app/preview/[token]/page.test.tsx`, `src/app/dashboard/invite/[id]/page.test.tsx`, `src/app/api/admin/invite-previews/route.test.ts`, `tests/integration/private-preview.test.ts` |
| Composition schema/vocabulary (Stage 6) | `src/lib/composition/schema.ts`, `event-types.ts`, `theme.ts`, `cultural-packs.ts`, `legacy-adapter.ts`, `resolve.ts` |
| Composition renderer (Stage 6) | `src/components/composition/registry.tsx`, `sections.tsx`, `CompositionRenderer.tsx` |
| Composition authoring (Stage 6) | `src/lib/composition-admin.server.ts` (admin-only; no UI built yet) |
| Event taxonomy migration (Stage 6) | `supabase/migrations/20260910130000_wedding_event_taxonomy.sql` |
| Composition authoring/protection migration (Stage 6) | `supabase/migrations/20260910140000_composition_authoring.sql` |
| Stage 6 tests | `src/lib/composition/schema.test.ts`, `legacy-adapter.test.ts`, `cultural-packs.test.ts`, `event-types.test.ts`, `src/components/composition/CompositionRenderer.test.tsx`, `src/lib/composition-admin.server.test.ts`, `tests/integration/wedding-event-taxonomy.test.ts`, `tests/integration/composition-authoring.test.ts` |

## Repo

- **Enveloped** (this project): [github.com/sarva-uttam/enveloped](https://github.com/sarva-uttam/enveloped) — private
  (this line previously said `monsieur-zordi/enveloped`, which doesn't
  match the actual `git remote -v` — corrected while updating this file)
