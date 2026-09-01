# Review Brief — Enveloped

This brief is for an AI (or human) doing an independent review of this
codebase, with GitHub access to browse/clone the repo directly. It gives
context that isn't visible from the diffs alone — product intent, decisions
made along the way, and specific areas worth scrutinizing.

**Repo:** https://github.com/sarva-uttam/enveloped
**Branch:** `master`
**Relevant commits (most recent work):** see the auth & ownership batch
(described below), `5719d11`, `04922e4`, `f5162ea` (the initial `9c6ab27`
is the untouched `create-next-app` scaffold)

> ⚠️ **This repo is currently private.** For the reviewing AI to actually
> browse it, its GitHub account needs access — add it as a collaborator, or
> temporarily make the repo public if that's acceptable, or supply a PAT.
> That step wasn't done as part of preparing this brief.

## What this is

Enveloped is a digital invite platform, primarily for weddings and events.
Flow: a host answers a survey → AI generates the invite's wording/design →
host picks a pricing tier → pays via PayPal → the invite unlocks and can be
shared with guests as a personalized link (not a raw generic URL).

Stack: Next.js 16 (App Router), Supabase (Postgres + storage), PayPal
(server-side order create/capture), Vercel AI SDK for generation, plain
CSS/Tailwind for styling.

`PROJECT_STATUS.md` in the repo root has the fuller build/pending-work
breakdown — read that first for the "what's done vs. not done" picture.
This brief is narrower: it's about what to *scrutinize*.

## Update — 2026-09-01: migrations are live, RLS + PayPal verified against real infra

All three pending migrations (payment-gating columns, `auth_ownership`,
`payment_integrity`) are now **applied to the live Supabase project
`ravfwnqfxngphncuyyxo`** and their security-critical behavior has been
exercised against the real database and the real PayPal **sandbox** API
— including as genuine `anon` / `authenticated` / `service_role` REST
callers, not just the privileged connection. Full detail and the exact
checks run are in `PROJECT_STATUS.md` → "Round 7". The "not verified
against real Postgres / PayPal" caveats throughout the scrutiny list
below are now **mostly closed** — the wording is left intact for
history, with per-item notes on what remains. The **one** thing still
unverified end-to-end: the PayPal *wallet happy path* (a real sandbox
buyer approving checkout → real `COMPLETED` capture →
`verifyCaptureResponse()` against a genuine body). Needs a browser +
sandbox buyer account; still worth a reviewer's eyes.

## Context not visible from the code alone

- **AI branding is intentionally downplayed.** The product is AI-generated,
  but per the product owner's explicit request, the copy avoids saying so
  overtly. This was a deliberate choice, not an oversight — don't flag
  "doesn't mention AI clearly" as a bug.
- **Homepage intentionally hides prices.** Tier names/descriptions show on
  the homepage; dollar amounts only appear on `/pricing`. Also deliberate.
- **PayPal is sandbox-first by design.** Live credentials aren't configured
  yet on purpose — the owner is testing the flow risk-free before switching
  `NEXT_PUBLIC_PAYPAL_ENV`/`PAYPAL_API_BASE_URL` to production.
- **i18n is intentionally partial.** The language switcher (English,
  French, Hindi, Tamil, Telugu, Marathi, Kreol Morisien) currently only
  translates the navbar and hero, by design — it's being expanded section
  by section. Untranslated sections falling back to English elsewhere is
  expected, not a bug, for now.
- **Translation confidence varies.** French is solid. Hindi/Tamil/
  Telugu/Marathi were machine-translated, not native-reviewed. Kreol
  Morisien was supplied by the product owner via ChatGPT — worth a
  language-quality look if the reviewer is equipped for it, separate from
  a code review.
- **Auth & ownership was just added** (Supabase Auth via email magic
  link, `owner_id` on invites, RLS scoped to ownership). This directly
  fixed two real, already-shipped bugs this brief previously flagged:
  invites had fully-public RLS (anyone could write/read anything), and
  `InviteClient.tsx` decided "is this viewer the owner" by checking
  whether `?guest=` was *absent* from the URL — meaning stripping that
  param off a shared link made you "the owner." Both are fixed. See
  `PROJECT_STATUS.md`'s "Auth & ownership foundation" section for the
  full design. **As of 2026-09-01 the `auth_ownership` migration IS
  applied to the live project** and its RLS was verified as a real
  `anon`/`authenticated` caller — see the "Update — 2026-09-01" block at
  the top and `PROJECT_STATUS.md` → "Round 7".
- **PayPal integrity was the deferred item this brief previously
  flagged — now addressed at the code level**, see "Round 6" below and
  "Payment integrity foundation (PayPal)" in `PROJECT_STATUS.md` for the
  full design. **As of 2026-09-01 the `payment_integrity` migration IS
  applied to the live database** — the `payments` table, its RLS, and
  the `invites_reject_client_paid_update` trigger were verified as real
  `anon`/`authenticated`/`service_role` callers, and the PayPal
  order-create + capture routes against the real sandbox API. See the
  "Update — 2026-09-01" block above.
- **A second round found and fixed one more real leak, then a third
  found the fix was still incomplete**:
  - Round 2: the original `invites` read policy was `using (true)`
    unconditionally — an UNPAID invite's full content was sent to any
    caller, and "not live yet" was UI-only, not a real data boundary.
    "Fixed" to `paid = true OR auth.uid() = owner_id` — a table-level
    policy. Same round: every server-side caller of invite-reading code
    (the PayPal `orders` Route Handler, `generateMetadata`) was moved off
    the browser Supabase client onto the session-aware server client.
  - Round 3: the round-2 table policy was STILL wrong — `invites.answers`
    is the raw survey input, including `guestNames` (the host's
    plain-text guest list, distinct from and never protected the same
    way as the `invite_guests` table) plus `partnerNames`/`venue`/
    `city`/`colorMood`/`extraDetails`. A `paid = true` table policy still
    means `select("*")` ships all of that to any guest on a published
    invite. RLS is row-level, not column-level, so this genuinely
    couldn't be fixed as a table policy at all — the raw `invites` table
    now has NO public read policy, period (owner-only), and every
    non-owner read goes through a new `get_published_invite()` SECURITY
    DEFINER function that hand-picks a minimal column set instead. Same
    round: `resolve_invite_guest()` was found to have no `paid` check at
    all (a guest link to an unpublished invite could still resolve a
    real name/teaser through it), and `submitRsvp()` — which read the
    now-owner-only raw table directly — was moved onto the new sanitized
    function too, gaining a `paid` check it didn't have before as a
    side effect.
  - The read logic itself is deduplicated into
    `src/lib/storage-queries.ts` (client-agnostic, takes an injected
    client) so `storage.ts` and `storage.server.ts` share one
    implementation instead of two to keep in sync — that's where
    `fetchPublicInvite()` (the sanitized read) and `fetchInvite()` (the
    now-owner-only full read) both live.
  - Round 4 (pre-merge review of `review/auth-ownership-foundation`,
    three more real issues, none overlapping the guest-list/answers work
    above): (1) `/login`/`/auth/callback`'s `next` redirect parameter was
    a genuine open redirect — `next = "@evil.com"` defeats the naive
    `${origin}${next}` prefixing (turns into a valid URL whose real host
    IS evil.com); fixed with `sanitizeRedirectPath()`
    (`src/lib/safe-redirect.ts`), a strict allowlist validator. (2) the
    `invite_rsvps` insert policy was `with check (true)` — unconditional;
    the app's `submitRsvp()` paid-check was never a real boundary since
    the anon key is public and can be driven directly; the database now
    requires the referenced invite to be paid and any supplied guest_id
    to belong to that same invite. (3) both SECURITY DEFINER functions
    used `search_path = public` with unqualified table references —
    `public` is exactly the schema most setups leave writable, so this
    was a real search_path-hijacking exposure; both now use
    `search_path = ''` with every table reference schema-qualified
    (`public.invites`, `public.invite_guests`).
  - **Round 5: round 4's own RSVP fix was itself broken** — the
    subtlest bug found across all five rounds, worth reading closely.
    Round 4 wrote the `invite_rsvps` insert policy's paid/guest_id
    checks as inline `exists (select 1 from invites ...)` subqueries
    directly in the policy. That's broken: an RLS policy's own
    subqueries are themselves subject to RLS on whatever they reference,
    and `invites`/`invite_guests` are BOTH owner-only for SELECT as of
    round 3 — an anonymous guest has zero row visibility into either, so
    those subqueries would return no rows and the check would fail
    UNCONDITIONALLY, rejecting every legitimate anonymous RSVP,
    regardless of the real data. It read correctly, and passed every
    round-4 text-pattern test (which checked for the right substrings
    being present, not for whether they'd evaluate correctly under RLS).
    Fixed with the same SECURITY DEFINER pattern as the other two
    functions: `can_insert_rsvp(p_invite_id, p_guest_id) returns
    boolean`, hardened the same way (`search_path = ''`, qualified
    `public.*` tables, explicit revoke/grant). The policy is now `with
    check (can_insert_rsvp(invite_rsvps.invite_id, invite_rsvps.guest_id))`.
    A local Supabase/Postgres integration test was attempted for this
    round specifically (to verify this class of bug can't hide behind
    text-pattern tests again) and is genuinely unavailable in this
    environment — Docker Desktop's backend process exits ~60s after
    launch, consistent with missing virtualization support in this
    sandbox. This is now the top scrutiny item — see #9 below.

## Specific areas to scrutinize

1. **PayPal payment integrity** (`src/lib/paypal.ts`,
   `src/lib/paypal-verify.ts`, `src/lib/payments.server.ts`,
   `src/app/api/paypal/**`, `src/components/invite/PaywallPanel.tsx`):
   as of round 6, the `paid` flag is only ever set from a verified
   server-side capture response — see "Round 6" and scrutiny item #10
   below for the full detail on what's now checked and what's still
   worth independently confirming. **2026-09-01: order-create + capture
   are now exercised against the live DB and the real PayPal sandbox
   API** (all but the wallet approval + genuine `COMPLETED` body) — see
   scrutiny item #10 and `PROJECT_STATUS.md` → "Round 7".
2. **Supabase RLS on the `paid` column** (`supabase/schema.sql`,
   `supabase/migrations/20260828000000_auth_ownership.sql`,
   `supabase/migrations/20260829000000_payment_integrity.sql`): as of
   round 6, an authenticated owner can no longer flip
   `paid`/`paypal_order_id` on their OWN invite directly via the client
   SDK either — a new `invites_reject_client_paid_update` trigger raises
   an exception on any such change unless the connection is
   `service_role`. This is the gap round-6's own prior text here flagged
   as open; see scrutiny item #10 for what's worth independently
   confirming. **2026-09-01: verified on the live DB** — a real
   `authenticated` owner's direct `UPDATE invites SET paid = true` is
   rejected by the trigger (`P0001`), a non-gated column update by the
   same owner succeeds, and the `service_role` path (`markInvitePaid()`)
   succeeds.
3. **Guest-facing paywall gate AND the sanitized-payload boundary**
   (`src/app/invite/[id]/`, `InviteClient.tsx`,
   `src/lib/storage-queries.ts`'s `fetchPublicInvite()`/
   `get_published_invite()`): two things worth independently confirming:
   (a) an unpaid invite truly can't leak its content to a guest — check
   both the initial server render and client-side fetching; (b) a
   *published* invite's guest-facing read truly never includes
   `answers`/`guestNames`/`owner_id`/`paypal_order_id` — `InviteClient.tsx`
   now fetches BOTH the owner-scoped `getInvite()` (only ever succeeds
   for the real owner) and the sanitized `getPublicInvite()` in parallel
   and uses whichever one actually resolved; worth tracing that logic
   specifically, since it's the newest and most structurally different
   part of this batch. This is enforced by RLS + a SECURITY DEFINER
   function now, not app-layer UI logic — worth confirming that holds
   once the migration is actually applied, since right now it's reviewed
   plus covered by a text-pattern regression test
   (`src/lib/rls-policy.test.ts`) and mocked-client unit tests
   (`src/lib/storage-queries.test.ts`), not exercised against real
   Postgres. Also worth a fresh look at `src/lib/ownership.ts`'s
   `resolveViewerRole()` specifically — that's the single source of truth
   for "is this viewer the owner," and it's meant to be exhaustively
   unit-tested (`ownership.test.ts`) rather than trusted by inspection
   alone; a second pass at both the function and its test coverage is
   worth the time.
4. **Migration/schema drift risk** — partially addressed. A real
   `supabase/migrations/` directory now exists (the auth_ownership
   migration lives there as a proper versioned, timestamped file); the
   older payment-gating migration is still just an inline SQL block at
   the bottom of `schema.sql`, not moved into that folder — worth
   deciding whether to retrofit it in for consistency, and whether the
   project should actually adopt the Supabase CLI's migration tooling
   (`supabase migration up` / `db push`) rather than manual SQL-editor
   pastes, now that there's a real folder structure for it.
5. **RLS is reviewed but not integration-tested — treat as a hard
   pre-production blocker, not routine polish.** The auth_ownership
   migration's policies are covered by two kinds of test, neither of
   which stands up a real Postgres: `src/lib/storage.test.ts` and
   `storage-queries.test.ts` verify the app-layer logic against a mocked
   Supabase client; `src/lib/rls-policy.test.ts` is a text-pattern
   regression guard that reads the migration SQL and asserts the
   security-critical conditions are present. That caveat isn't
   hypothetical: round 4's own `invite_rsvps` insert policy fix passed
   review-by-reading AND every text-pattern test from that round, and
   was still broken — an RLS-subquery-recursion bug that would have
   silently rejected every legitimate anonymous RSVP (see "Round 5"
   above). A Docker-based local Supabase instance was specifically
   attempted to close this gap with a real integration test and isn't
   available in this environment (Docker Desktop's backend exits ~60s
   after launch). Concretely, once Postgres access exists: try the
   `invite_rsvps` insert policy as the `anon` role directly — a valid
   insert against a paid invite with no guest_id should succeed; against
   a paid invite with a guest_id from a DIFFERENT invite should fail;
   against an unpaid invite should fail. None of that is exercised
   against a real database anywhere in this batch.
   **2026-09-01 update:** this is now done — the three `anon` RSVP-insert
   cases (paid/no-guest → allowed, cross-invite guest → rejected, unpaid
   → rejected) were run against the live database as a real `anon`
   caller and all passed. See `PROJECT_STATUS.md` → "Round 7".
6. **`src/app/api/generate/route.ts`**: error handling when the AI
   Gateway/provider call fails or isn't authenticated — does it fail
   gracefully for the user, or leak internal error detail?
7. **i18n architecture** (`src/lib/i18n/`): it's a client-only
   `localStorage`-based switcher with no SSR/URL-based locale routing —
   worth flagging if that has SEO or first-paint (flash of English before
   hydration) implications worth addressing later.
8. General Next.js App Router correctness — server vs. client component
   boundaries, especially around `Navbar`/`Hero` which were converted to
   client components specifically to support the language switcher, and
   now also `src/proxy.ts` (this project's Next 16 `middleware.ts`
   equivalent) and the three-way Supabase client split in
   `src/lib/supabase/` (browser/server/admin) — worth confirming the
   `server-only` guard on `admin.ts` actually does what it's supposed to
   and the service-role key can't end up in a client bundle. (An earlier
   revision of this brief flagged `storage.ts`'s browser client being
   reused from a server Route Handler as a fragility worth a second look
   — that's now fixed, not just flagged: every server-side caller uses
   `storage.server.ts` and the session-aware server client instead. Grep
   for `from "@/lib/storage"` vs `from "@/lib/storage.server"` to confirm
   nothing server-side still imports the browser-facing module.)
9. **Rounds 4 and 5, freshest and least-reviewed part of this batch —
   start here.** `src/lib/safe-redirect.ts`'s `sanitizeRedirectPath()` —
   worth trying to find a bypass the 26 existing test cases
   (`safe-redirect.test.ts`) missed, since this is exactly the kind of
   validator where one overlooked edge case reopens the whole class of
   bug. `can_insert_rsvp()` and the `invite_rsvps` insert policy in
   `supabase/migrations/20260828000000_auth_ownership.sql` — this is the
   function that replaced round 4's broken inline-subquery version (see
   "Round 5" above); confirm the SECURITY DEFINER + table-ownership
   reasoning that lets it bypass RLS for its own internal queries is
   actually correct for how this Supabase project's roles/ownership are
   set up. **2026-09-01: this IS now observed working** — `can_insert_rsvp`
   and its policy were exercised against the live database as a real
   `anon` caller (all four cases pass); the SECURITY DEFINER +
   table-ownership bypass reasoning holds in practice. And the
   `search_path = ''` / `public.*` qualification on all three SECURITY
   DEFINER functions now (`resolve_invite_guest`, `get_published_invite`,
   `can_insert_rsvp`) — confirm nothing inside any of the three still
   resolves an unqualified name.
10. **Round 6 (PayPal payment integrity), newest and least-reviewed part
    of this batch — start here.** `src/lib/paypal-verify.ts`'s
    `verifyCaptureResponse()` is the actual security boundary for
    payment integrity — everything upstream of it (auth, ownership,
    idempotency claim) only decides whether to call PayPal at all; this
    decides whether what PayPal returned actually matches the
    invitation/amount/currency the order was created for. Worth
    confirming: (a) every field it checks is genuinely unspoofable by
    the payer (order id, `custom_id`, capture status, currency, exact
    amount, and — when configured — payee); (b) the capture route
    (`src/app/api/paypal/orders/[orderId]/capture/route.ts`) truly never
    uses the client-supplied `inviteId` for anything but an early,
    optional, non-authoritative error message — the invitation
    association is meant to come ONLY from `getPaymentByOrderId()`
    (`src/lib/payments.server.ts`), itself keyed by the PayPal order id;
    (c) the atomic claim (`claimPaymentForCapture`, a conditional
    `status: 'created' -> 'processing'` update) genuinely can't let two
    concurrent requests both proceed to call PayPal's capture endpoint
    for the same order — this reasoning has NOT been verified against a
    real database in this batch, same caveat as the RLS work in rounds
    2-5; (d) the `payments` table's RLS (no insert/update/delete policy
    for anon/authenticated at all) and the new
    `invites_reject_client_paid_update` trigger
    (`supabase/migrations/20260829000000_payment_integrity.sql`) actually
    close the "owner flips their own `paid` flag directly" gap this
    brief previously flagged as scrutiny item #2 — also unverified
    against real Postgres. `custom_id` is set to the invitation's
    **internal uuid**, not the slug — worth confirming nothing
    downstream still expects a slug there. Test coverage:
    `src/lib/paypal-verify.test.ts`, `src/lib/payments.server.test.ts`,
    `src/app/api/paypal/orders/route.test.ts`,
    `src/app/api/paypal/orders/[orderId]/capture/route.test.ts` — all
    against mocked clients/PayPal responses.
    **2026-09-01 update:** (b), (c) and (d) are now verified against the
    live database + real PayPal sandbox — order-create binds tier/amount
    server-side, the atomic claim + `status`-guarded transitions behave,
    the `payments` RLS and `invites_reject_client_paid_update` trigger
    block every anon/authenticated write path, and the idempotent
    "already captured" recovery branch flips `invites.paid` without
    re-calling PayPal and is a true no-op on repeat. Still only unit-
    tested: `verifyCaptureResponse()` against a *genuine* `COMPLETED`
    capture body (needs a browser + sandbox buyer to approve a real
    order). See `PROJECT_STATUS.md` → "Round 7".
11. Anything else that looks like a genuine bug, security gap, or
    accessibility issue — the above is a starting list, not an
    exhaustive one.

## What NOT to flag as issues

- Missing PayPal live credentials and missing `AI_GATEWAY_API_KEY` are
  known, tracked in `PROJECT_STATUS.md`, and waiting on the product
  owner. The Supabase migrations (auth_ownership, payment_integrity, and
  the payment-gating columns) are **applied to the live project as of
  2026-09-01** — see `PROJECT_STATUS.md` → "Round 7". One follow-up
  there: the recorded `schema_migrations` versions don't match the
  `supabase/migrations/` filenames, so reconcile with `supabase
  migration repair` before ever using `supabase db push`.
- PayPal sandbox mode itself (`NEXT_PUBLIC_PAYPAL_ENV=sandbox`, no live
  credentials configured) is deliberate, not a gap — see "Context not
  visible from the code alone" above.
- Sparse i18n coverage beyond nav/hero — also known and in progress.
- Existing invites having `owner_id = null` post-migration (no dashboard
  visibility for them) — known, documented in `PROJECT_STATUS.md`'s
  "Pending" list, a deliberate consequence of retrofitting auth onto data
  that predates it, not a bug to silently paper over.
- The 4 `npm run lint` failures a prior revision of this brief flagged
  (`Countdown.tsx`, `PaywallPanel.tsx`, `Footer.tsx`, `LocaleContext.tsx`)
  are fixed as of the second round — `npm run lint` is clean (exit 0).
  `LocaleContext.tsx` specifically was rewritten to use
  `useSyncExternalStore` instead of effect+setState for reading
  `localStorage` — worth a look since it's a more involved change than
  the other three's one-line fixes.
