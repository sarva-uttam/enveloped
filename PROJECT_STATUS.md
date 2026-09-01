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
  boundary (`supabase/migrations/20260828000000_auth_ownership.sql`) —
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
  (`supabase/migrations/20260829000000_payment_integrity.sql`) — one row
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
| `20260901114159` | `auth_ownership` | `supabase/migrations/20260828000000_auth_ownership.sql`, verbatim |
| `20260901114212` | `payment_integrity` | `supabase/migrations/20260829000000_payment_integrity.sql`, verbatim |

> **Migration-history version drift — known, low-impact, worth fixing
> before adopting `supabase db push`.** `apply_migration` stamped its own
> timestamps (`20260901…`), so the recorded `schema_migrations` versions
> do **not** match the `supabase/migrations/*.sql` filenames
> (`20260828…`, `20260829…`), and `payment_gating` still has no file at
> all (it lives only inline in `schema.sql`). The current workflow is
> manual SQL application, so this is informational today. But if the
> project ever switches to `supabase db push` / `supabase migration up`,
> the CLI will see `20260828000000_auth_ownership` and
> `20260829000000_payment_integrity` as *unapplied* and try to re-run
> them — and several statements in them (`create policy …`, `create
> trigger …`) are **not** `if not exists` and will error on a re-run.
> Reconcile first: `supabase migration repair` to align the version
> rows, and retrofit `payment_gating` into a real numbered file (this is
> REVIEW_BRIEF.md scrutiny item #4).

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
   `supabase/migrations/20260828000000_auth_ownership.sql` verbatim, and
   verified against the live database — see "Round 7" above.
   `SUPABASE_SERVICE_ROLE_KEY` is present and non-empty in `.env.local`.
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
   `supabase/migrations/20260829000000_payment_integrity.sql` verbatim.
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
