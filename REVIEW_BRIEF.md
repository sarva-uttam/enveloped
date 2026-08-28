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
  full design, and its "Pending" list for what's NOT yet done (the
  migration hasn't been run against the live project yet as of this
  writing — verify that before assuming any of this is actually live).
- **PayPal integrity is still explicitly deferred**, same as before this
  batch — see "Specific areas to scrutinize" #1 below, unchanged. The one
  thing that DID change: `markInvitePaid` now runs through a service-role
  client instead of the old public RLS policy (necessary once that policy
  became owner-scoped), but nothing about *who* can trigger a capture was
  touched.
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

## Specific areas to scrutinize

1. **PayPal payment integrity** (`src/lib/paypal.ts`,
   `src/app/api/paypal/**`, `src/components/invite/PaywallPanel.tsx`):
   is the `paid` flag only ever set from a verified server-side capture
   response, or is there any path where a client could mark an invite
   paid without a real, verified PayPal transaction?
2. **Supabase RLS on the `paid` column** (`supabase/schema.sql`,
   `supabase/migrations/20260828000000_auth_ownership.sql`): as of this
   batch, `invites` update requires `auth.uid() = owner_id` — an
   authenticated client can no longer flip `paid`/`paypal_order_id` on
   someone else's invite via the SDK directly. It CAN still flip it on
   its OWN invite directly (nothing stops a host from client-side-calling
   `.update({ paid: true })` on their own row instead of going through
   PayPal) — that gap is real and is exactly what "PayPal integrity, next
   batch" is meant to close. Worth confirming this reasoning holds once
   the migration is actually applied and testable.
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
5. **RLS is reviewed but not integration-tested** — the auth_ownership
   migration's policies are covered by two kinds of test, neither of
   which stands up a real Postgres: `src/lib/storage.test.ts` and
   `storage-queries.test.ts` verify the app-layer logic against a mocked
   Supabase client (never attempts a write while unauthenticated, always
   filters by the real owner_id, guest lookups only ever go through the
   RPC); `src/lib/rls-policy.test.ts` is a text-pattern regression guard
   that reads the migration SQL and asserts the security-critical
   conditions are present — now including the round-4 fixes (empty
   search_path, qualified table references, the RSVP insert conditions)
   — it says plainly in its own header that this isn't proof the RLS is
   correct, just a guard against silently reverting it. Actually running
   this against a real (or local Docker) Postgres is still worth doing
   before trusting this fully — this specifically includes actually
   trying to insert an `invite_rsvps` row against an unpaid invite or
   with a mismatched `guest_id`/`invite_id` pair, which no test in this
   batch exercises against a real database.
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
9. **Round 4's three fixes, freshest and least-reviewed part of this
   batch**: `src/lib/safe-redirect.ts`'s `sanitizeRedirectPath()` —
   worth trying to find a bypass the 26 existing test cases
   (`safe-redirect.test.ts`) missed, since this is exactly the kind of
   validator where one overlooked edge case reopens the whole class of
   bug; the new `invite_rsvps` insert policy in
   `supabase/migrations/20260828000000_auth_ownership.sql` — confirm the
   `exists (...)` subqueries actually express "same invite" correctly
   and there's no way to satisfy them with a guest_id/invite_id pair
   that doesn't really match; and the `search_path = ''` / `public.*`
   qualification on both SECURITY DEFINER functions — confirm nothing
   inside either function body still resolves an unqualified name.
10. Anything else that looks like a genuine bug, security gap, or
    accessibility issue — the above is a starting list, not an
    exhaustive one.

## What NOT to flag as issues

- Missing PayPal live credentials, missing `AI_GATEWAY_API_KEY`, and the
  unrun Supabase migrations (both the payment-gating one and the new
  auth_ownership one) are all known, tracked in `PROJECT_STATUS.md`, and
  waiting on the product owner — not something the code needs to "fix"
  itself.
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
