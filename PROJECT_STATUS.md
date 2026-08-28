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

## Pending — needs a human to do these, not just code

1. **Run the auth & ownership migration.**
   `supabase/migrations/20260828000000_auth_ownership.sql` has **not**
   been applied to the live database — until it is, invites have no
   `owner_id` column and the old fully-public RLS policies are still
   active (meaning the ownership bug this batch fixes at the app layer
   isn't yet closed at the database layer). Steps:
   - Supabase dashboard → SQL Editor → paste the file's contents → Run.
   - Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Project Settings >
     API) — the PayPal capture route needs it now; it's already
     referenced (blank) in both `.env.local` and `.env.example`.
   - **Existing invites** (created before this batch) will have
     `owner_id = null` after the migration. They stay publicly viewable
     by guests (unchanged), but won't appear in anyone's dashboard and
     can't be edited/deleted by anyone — there's no account to
     retroactively attach them to. If any of those need to be reachable
     from a dashboard, that's a manual decision (e.g. a one-off script
     backfilling specific rows to a specific `owner_id`), not something
     to automate silently.
   - Confirm both `resolve_invite_guest` and `get_published_invite` show
     up under Database > Functions with `EXECUTE` granted to `anon` —
     between them, that's the entire non-owner read path (guest
     personalization, and the invite content itself) post-migration.
2. **Add PayPal credentials.** `.env.local` needs
   `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from
   [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/applications)
   (start with a **Sandbox** app, not Live). Until set, the paywall
   correctly shows "Payments aren't available right now" rather than
   breaking. `PAYPAL_API_BASE_URL` and `NEXT_PUBLIC_PAYPAL_ENV` in
   `.env.example` document the sandbox→live switch.
3. **Run the payment integrity migration.**
   `supabase/migrations/20260829000000_payment_integrity.sql` has **not**
   been applied to the live database — until it is, there's no `payments`
   table and the `invites_reject_client_paid_update` trigger doesn't
   exist, so the code-level fixes described in "Payment integrity
   foundation" above aren't actually enforced yet in production. Steps:
   Supabase dashboard → SQL Editor → paste the file's contents → Run
   (same process as the auth_ownership migration above; this one assumes
   that migration is already applied, since it references
   `invites.owner_id`). Also add `PAYPAL_MERCHANT_EMAIL` (Project's
   PayPal account email) to `.env.local` if you want the payee-match
   check enabled — optional, every other verification check applies
   regardless.
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
8. **RLS is reviewed and covered by two kinds of test, still not
   integration-tested against real Postgres — treat this as the single
   highest-priority pre-production item, not routine polish.**
   `src/lib/storage-queries.test.ts` tests the actual query logic
   (mocked client) both storage.ts and storage.server.ts share;
   `src/lib/rls-policy.test.ts` is a text-pattern regression guard over
   the migration SQL itself — it says plainly in its own header that
   this isn't proof the RLS is correct, just a guard against silently
   reverting a known-fixed bug. That caveat isn't hypothetical: round 4
   of this migration's own `invite_rsvps` insert policy fix passed
   review-by-reading and every text-pattern test, and was STILL broken
   (inline RLS-subquery recursion silently rejected every legitimate
   anonymous RSVP — see "Round 5" above). A Docker-based local Supabase
   instance was attempted for this round specifically to close that gap
   with a real integration test and genuinely isn't available in this
   environment (see Round 5's note) — this remains open. Actually
   running the full migration against a real (or local Docker) Postgres
   — `supabase start` locally, or `supabase test db` — is not optional
   polish at this point; do it before trusting any of this in
   production.

## Key files

| Area | Path |
|---|---|
| i18n system | `src/lib/i18n/translations.ts`, `src/lib/i18n/LocaleContext.tsx` |
| PayPal server-side | `src/lib/paypal.ts`, `src/lib/paypal-verify.ts`, `src/lib/payments.server.ts`, `src/app/api/paypal/**` |
| Paywall UI | `src/components/invite/PaywallPanel.tsx` |
| DB schema (+ pending migrations) | `supabase/schema.sql`, `supabase/migrations/` |
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
