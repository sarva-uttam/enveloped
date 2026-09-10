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

## Update — 2026-09-09: Stage 0 repository/live database reconciliation

Before this date, `supabase/migrations/` held only two files and
`supabase/schema.sql` described a database that was **three migrations
behind** the live project — `list_migrations` on `ravfwnqfxngphncuyyxo`
recorded seven applied `schema_migrations` versions; this repository
accounted for only four, and two of those under different filenames. The
three unaccounted-for versions (`requests_and_templates`,
`generator_composition`, `generator_payment_publish_split`, all applied
live on or before 2026-09-05) had added tables `requests`, `templates`,
`invite_payment_records` and eight new columns on `invites`
(`request_id`/`occasion`/`generator_kind`/`design_spec`/
`generator_content`/`composition`/`published_at`/`created_by_admin_id`) —
none of it present anywhere in this repository.

**The source code that produced this schema (a live column comment names
it: `invites.server.ts` / `generateHinduInvite`) could not be found and is
treated as lost** — a documented, exhaustive read-only search covered this
repository's full git history (every ref, reflog, stash, and dangling
object), every other local checkout of this project, and every
locally-retrievable Claude session transcript. See `PROJECT_STATUS.md`'s
"Missing browser-generator-v1 source" for the full account. This means
Stage 0 could reconstruct the **schema** with high confidence (every
object was read directly from the live database) but not the **exact
per-migration statement grouping** for the three 2026-09-05 versions
(medium confidence, inferred from column ordinal position and naming) or
the application code that used these columns at all.

All seven migrations now have a versioned file whose filename matches its
live `schema_migrations` version exactly; `supabase/schema.sql` was
rebuilt from verified live state. See `supabase/migrations/README.md` for
the current file-by-file status and `PROJECT_STATUS.md`'s "Stage 0"
section for the full validation record. **Two known issues, both
pre-existing and neither introduced nor fixed by this reconciliation**
(Stage 0 was documentation/reconciliation only — no behavioral migration
was written or applied): (1) `get_published_invite()` does not actually
decouple payment from publication despite `generator_payment_publish_split`'s
name — every generator-aware column is still gated on `i.paid` as a hard
AND; (2) the recovered `occasion` vocabulary
(`haldi`/`sangeet_mehendi`/`wedding_day`/`reception`) is Hindu-wedding-
specific, not the general, culturally-extensible model the product
direction calls for. Both are new scrutiny items — see #12 and #13 below.

## Update — 2026-09-09: Stage 2 admin identity and authorization boundary

A database-backed administrator identity (`app_admins` + `is_admin()`,
`supabase/migrations/20260909120000_admin_identity.sql`) and a server-
protected `/admin` placeholder (`src/app/admin/`) were added. No
generator, request-management, template-editor, invitation-editor,
payment interface, or publication workflow was built — see
`PROJECT_STATUS.md`'s "Stage 2" section for the full design. **New
scrutiny item — see #14 below.** Key points for a reviewer: `app_admins`
has no insert/update/delete policy for any role at all, including an
administrator's own client — admin membership can only be granted by a
trusted, service-role/direct-database write (see
`supabase/migrations/README.md`'s bootstrap procedure), never through the
app. `is_admin()` is SECURITY DEFINER for the same structural reason
`can_insert_rsvp()` needed to be (Round 5) — worth confirming that
reasoning holds here too. This migration has **not** been applied to the
live project; it exists only in the repository and against the local
Supabase stack from Stage 1.

## Update — 2026-09-09: Stage 3 separates publication from payment

Fixes the payment/publication coupling defect scrutiny item #12 (below)
was written about — `published_at` is now the sole public-access gate
(`supabase/migrations/20260909150000_publication_payment_split.sql`),
`paid` records payment status only. **New scrutiny item — see #15
below.** Also NOT applied to the live project; local-only, same as
Stage 2's migration. One thing worth a reviewer's specific attention:
this migration found and fixed a real gap in its own first draft — an
`is_admin()`-only trigger exception would have let an administrator who
also owns an invitation backdate `published_at` via a raw client update,
bypassing the `publish_invite()`/`unpublish_invite()` functions' `now()`-
only guarantee entirely. Fixed with a transaction-local
`enveloped.publish_action` flag those two functions set immediately
before their own update, which the trigger checks instead of `is_admin()`
directly — worth independently confirming this actually closes the gap
(verified against the local stack in
`tests/integration/publication-authorization.test.ts`, not just
reasoned about).

## Update — 2026-09-09: Stage 4 server-renders the public invitation

Application-layer only, no database change. `/invite/[id]` is now an
async Server Component; the public invitation's wording is present in
the initial HTML instead of requiring client-side auth + two/three
sequential fetches first. **New scrutiny item — see #16 below.**
Worth a reviewer's attention specifically: `src/app/invite/[id]/InviteClient.tsx`
(now exporting `OwnerPreview`) is retained but deliberately NOT imported
by `page.tsx` — an owner visiting their own invite link currently sees
the same public/unavailable view a guest would, having lost the
paywall/share-panel UI that used to live there. This is documented as a
real, deliberate trade-off (see that file's header comment and
PROJECT_STATUS.md's Stage 4 "Remaining risks"), not an oversight — worth
independently confirming it reads as intentional, and that nothing else
in the app still assumes the owner view is reachable at this URL.

## Update — 2026-09-10: Stage 5 adds private preview links and a real owner-management route

One new, forward-only migration (`invite_previews` + four functions —
NOT applied to the live project). **New scrutiny item — see #17 below.**
Resolves Stage 4's disclosed trade-off: `src/app/invite/[id]/InviteClient.tsx`
is now deleted (its behavior moved, not left disconnected) — the owner
view lives at `/dashboard/invite/[id]` instead, with a real server-side
ownership check.

## Update — 2026-09-10: Stage 6 adds a versioned composition schema, trusted renderer registry, and wedding-first cultural-pack foundation

Two new, forward-only migrations (an `event_types` lookup table
replacing the Hindu-wedding-only `occasion` CHECK constraints; a
`composition`-field protection trigger + `admin_save_invite_composition()`
— NOT applied to the live project). **New scrutiny item — see #18
below.** The old monolithic `PublicInviteView.tsx` is deleted; all
three rendering surfaces (public/preview/owner-management) now render
through `CompositionRenderer.tsx` + a per-section-type trusted
component registry, fed either by a real, Zod-validated `composition`
or — for every pre-existing invitation — a legacy adapter synthesizing
one from the old `content` shape on every request (deliberately
temporary, see `legacy-adapter.ts`'s own header).

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
   `supabase/migrations/20260901114159_auth_ownership.sql`,
   `supabase/migrations/20260901114212_payment_integrity.sql`): as of
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
4. **Migration/schema drift risk** — addressed by the Stage 0
   reconciliation (2026-09-09; see "Update — 2026-09-09" above and
   `PROJECT_STATUS.md`'s "Stage 0" section). `supabase/migrations/` now
   holds seven files whose filenames match every version Supabase's
   `list_migrations` records live, including three (`requests_and_
   templates`, `generator_composition`, `generator_payment_publish_split`)
   that existed live since on-or-before 2026-09-05 with no file, and no
   recoverable source, anywhere in this repository before Stage 0. The
   project still does not use the Supabase CLI's migration tooling
   (`supabase db push` / `migration up`) — every migration to date,
   including all seven now on file, was applied by hand (dashboard SQL
   editor or the Supabase MCP `apply_migration`) — see
   `supabase/migrations/README.md` for the current workflow and what
   adopting the CLI would require.
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
   `supabase/migrations/20260901114159_auth_ownership.sql` — this is the
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
    (`supabase/migrations/20260901114212_payment_integrity.sql`) actually
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
12. **`get_published_invite()`'s payment/publication coupling defect**
    (`supabase/migrations/20260905091530_generator_payment_publish_split.sql`)
    — recovered and documented, not fixed, by the 2026-09-09 Stage 0
    reconciliation. Every generator-aware output column is gated
    `i.paid AND (i.generator_kind IS NULL OR i.published_at IS NOT NULL)`
    — `published_at` only ever narrows visibility further for a generator
    invite; `paid` remains a hard, unconditional AND. This directly
    contradicts the concierge-first product requirement that payment
    state and publication state stay independent (a client-approved,
    admin-published invite must not require PayPal payment to become
    visible). `resolve_invite_guest()`/`can_insert_rsvp()` have no
    awareness of `published_at` at all either. Worth confirming this
    reading against the function's live definition directly, and worth
    scoping the correct fix (likely: an OR, not an AND, once "published"
    and "paid" are meant to each independently unlock visibility) before
    any Stage 1+ work builds further on top of the current behavior.
13. **Hindu-wedding-specific `occasion` vocabulary** — `invites.occasion`,
    `templates.occasion`, and `requests.requested_occasions` are all
    CHECK-constrained to exactly `{haldi, sangeet_mehendi, wedding_day,
    reception}` (recovered from live, `supabase/migrations/
    20260905084115_generator_composition.sql`). Per explicit product
    direction, weddings are the primary market but the permanent domain
    model must support general events through reusable cultural packs —
    this fixed enum is not that model and was reproduced verbatim by
    Stage 0 (documentation only, no schema correction). Worth flagging
    early since three separate tables now depend on this exact constraint
    text, which will need a coordinated migration to generalize.
14. **Admin identity and authorization boundary** (Stage 2,
    `supabase/migrations/20260909120000_admin_identity.sql`,
    `src/lib/auth/admin.server.ts`, `src/app/admin/`) — worth confirming
    independently: (a) `app_admins` genuinely has no INSERT/UPDATE/DELETE
    policy for any role — verified in this batch via both a text-pattern
    guard (`src/lib/rls-policy.test.ts`) and real Postgres as
    anon/authenticated/admin callers
    (`tests/integration/admin.test.ts`, tests 8/9 specifically — an
    administrator's own client cannot grant admin rights to anyone,
    including itself); (b) `is_admin()`'s SECURITY DEFINER + empty
    search_path + fully-qualified `public.app_admins` reasoning is sound
    — same pattern as `can_insert_rsvp()`, not a new one; (c)
    `src/app/admin/layout.tsx` genuinely re-derives both authentication
    and admin status from the database on every request rather than
    trusting anything cached/client-supplied, and `src/proxy.ts`'s
    `/admin` entry is genuinely just an optimistic session-presence
    redirect, not a security check masquerading as one; (d) the migration
    is NOT yet applied to the live project — confirm it stays that way
    until the owner deliberately runs the bootstrap procedure in
    `supabase/migrations/README.md`.
15. **Publication/payment split** (Stage 3,
    `supabase/migrations/20260909150000_publication_payment_split.sql`)
    — worth confirming independently: (a) `get_published_invite()`/
    `resolve_invite_guest()`/`can_insert_rsvp()` genuinely gate on
    `published_at` alone now — no residual `paid`/`generator_kind`
    condition anywhere in any of the three (checked in this batch via
    both a text-pattern guard and real Postgres in
    `tests/integration/published-invite.test.ts`, covering all four
    paid × published combinations); (b) `publish_invite()`/
    `unpublish_invite()` genuinely cannot be reached by anon
    (`revoke execute ... from anon` — needed because Supabase's default
    privileges grant EXECUTE to anon on every new function otherwise;
    worth confirming this revoke is still present and effective, not
    just assumed); (c) the transaction-local `enveloped.publish_action`
    flag actually prevents an administrator's own raw client update from
    setting `published_at` — this is the subtlest part of the whole
    migration and the one place a naive `is_admin()`-only trigger check
    would have quietly failed (see the "Update — 2026-09-09: Stage 3"
    note above for the exact gap found); (d) `markInvitePaid()`
    genuinely never sets `published_at`, and the legacy backfill
    genuinely never auto-publishes an unpaid or paid-generator-without-
    published_at row — both asserted in
    `tests/integration/legacy-backfill.test.ts`/
    `publication-authorization.test.ts` against real Postgres, not just
    reasoned about in the migration's comments; (e) this migration is
    NOT yet applied to the live project — confirm it stays that way, and
    see PROJECT_STATUS.md's Stage 3 "Production rollout and rollback"
    section before it ever is.
16. **Server-rendered public invitation** (Stage 4,
    `src/app/invite/[id]/page.tsx`, `src/lib/invite-view-model.ts`,
    `src/components/invite/PublicInviteView.tsx`/`UnavailableInvite.tsx`)
    — worth confirming independently: (a) `page.tsx` genuinely never
    imports `getInviteServer` (the owner-only read) or anything from
    `supabase.auth` — grep for both; (b) `buildPublicInviteViewModel()`
    genuinely collapses every "not viewable" reason (missing, unpublished,
    invalid guest token) into the same `null` result, and `page.tsx`
    genuinely renders the identical `UnavailableInvite` output for all of
    them — `page.test.tsx`'s "a missing invitation and an unpublished one
    render the IDENTICAL safe unavailable HTML" test asserts this by
    direct string equality, worth spot-checking that assertion is
    actually meaningful (not comparing two accidentally-empty strings);
    (c) `InviteViewModel`'s field list is genuinely exhaustive — no path
    by which a raw `PublicInvite`/database row reaches a client
    component's props instead of going through the model; (d) the
    bundle-composition claim in PROJECT_STATUS.md's Stage 4 "Performance"
    section (PayPal/owner-management code absent from every built chunk)
    is reproducible — `npm run build` then `grep -r "PaywallPanel\|sandbox.paypal.com" .next/static/chunks/`
    should return nothing; (e) the owner-preview regression (see the
    "Update — 2026-09-09: Stage 4" note above) is acceptable as a
    temporary state, not something that should have been silently
    avoided by re-mounting `OwnerPreview` on the public route instead.
17. **Private preview links and owner-management separation** (Stage 5,
    `supabase/migrations/20260910120000_private_preview_links.sql`,
    `src/lib/preview-tokens.server.ts`, `src/lib/preview-admin.server.ts`,
    `src/app/preview/[token]/page.tsx`, `src/app/dashboard/invite/[id]/`)
    — worth confirming independently: (a) `invite_previews` genuinely has
    zero RLS policies for any role — try a raw insert/update/select as
    each of anon/an ordinary authenticated user/an administrator's own
    client and confirm every one is denied (the integration test suite
    does this; worth reproducing by hand too); (b) a token's raw value is
    never persisted anywhere — grep the diff for `token_hash` write sites
    and confirm the raw token variable never reaches a table, a log line,
    or `localStorage`/`sessionStorage`; (c) `get_invite_preview()`
    genuinely never gates on `published_at`, and `get_published_invite()`
    is genuinely unmodified by this migration (diff the two); (d)
    rotation/revocation genuinely take effect immediately — the
    integration suite proves this against a real Postgres, worth
    spot-checking the specific assertions rather than trusting the
    migration's own comments; (e) the bundle-isolation claim in
    PROJECT_STATUS.md's Stage 5 "Public-route isolation" section
    (`/invite/[id]` and `/preview/[token]` share byte-identical first-load
    JS; `/dashboard/invite/[id]` is the only route pulling in the
    PayPal/owner-management chunk) is reproducible — `npm run build` then
    compare `.next/diagnostics/route-bundle-stats.json` entries for the
    three routes; (f) `/dashboard/invite/[id]`'s ownership check is
    genuinely server-side and genuinely collapses "doesn't exist" and
    "belongs to someone else" into one response — try requesting another
    real user's invitation slug while signed in as a different user and
    confirm the response is indistinguishable from a nonexistent slug;
    (g) this migration is NOT yet applied to the live project — confirm
    it stays that way.
18. **Composition schema, renderer registry, and event taxonomy** (Stage
    6, `src/lib/composition/schema.ts`, `src/components/composition/
    registry.tsx`/`CompositionRenderer.tsx`, `src/lib/composition/
    legacy-adapter.ts`, `src/lib/composition-admin.server.ts`,
    `supabase/migrations/20260910130000_wedding_event_taxonomy.sql`,
    `supabase/migrations/20260910140000_composition_authoring.sql`) —
    worth confirming independently: (a) every free-text field in
    `schema.ts` genuinely rejects `<`/`>` and `javascript:`-looking
    content, and every URL field genuinely allowlists protocols — try a
    few payloads by hand, not just trusting schema.test.ts; (b) the
    renderer registry (`SECTION_REGISTRY`) is genuinely a static object
    literal with no dynamic `require`/import-by-string anywhere in the
    render path — grep for it; (c) `resolveComposition()` genuinely
    never falls back to legacy `content` rendering when a REAL,
    present-but-invalid composition fails validation — it should render
    the same `UnavailableInvite` as a missing invitation, not a
    partially-correct page; (d) the generator-field trigger extension
    genuinely blocks a direct owner update to `composition` (and
    `occasion`/`design_spec`/`generator_content`/`generator_kind`) —
    `tests/integration/composition-authoring.test.ts` proves this
    against real Postgres, worth spot-checking by hand too; (e)
    `designPackId`'s `z.enum` genuinely only contains `neutral-classic`
    and `hindu-wedding` — every other pack name mentioned anywhere in
    `cultural-packs.ts`'s comments should be REJECTED by
    `InvitationCompositionSchema`, not merely absent from a UI; (f) no
    section component anywhere uses `dangerouslySetInnerHTML` or an
    equivalent — grep for it across `src/components/composition/`; (g)
    both new migrations are NOT yet applied to the live project —
    confirm they stay that way.

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
