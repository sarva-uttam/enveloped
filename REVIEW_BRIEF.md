# Review Brief — Enveloped

This brief is for an AI (or human) doing an independent review of this
codebase, with GitHub access to browse/clone the repo directly. It gives
context that isn't visible from the diffs alone — product intent, decisions
made along the way, and specific areas worth scrutinizing.

**Repo:** https://github.com/sarva-uttam/enveloped
**Branch:** `master`
**Relevant commits (most recent work):** `5719d11`, `04922e4`, `f5162ea`
(the initial `9c6ab27` is the untouched `create-next-app` scaffold)

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

## Specific areas to scrutinize

1. **PayPal payment integrity** (`src/lib/paypal.ts`,
   `src/app/api/paypal/**`, `src/components/invite/PaywallPanel.tsx`):
   is the `paid` flag only ever set from a verified server-side capture
   response, or is there any path where a client could mark an invite
   paid without a real, verified PayPal transaction?
2. **Supabase RLS on the `paid` column** (`supabase/schema.sql`): does the
   update policy actually restrict who can flip `paid`/`paypal_order_id`,
   or could an authenticated client update it directly via the Supabase
   client SDK, bypassing PayPal entirely?
3. **Guest-facing paywall gate** (`src/app/invite/[id]/`,
   `InviteClient.tsx`): confirm an unpaid invite truly can't leak its
   content to a guest who has the link — check both the initial server
   render and any client-side data fetching.
4. **Migration/schema drift risk**: the payment-gating migration lives as
   a SQL block in `schema.sql` that has to be manually pasted into the
   Supabase SQL editor rather than run through a migration tool — flag if
   this creates a real risk of the file and the live DB diverging over
   time, and whether a proper migration setup (e.g. Supabase CLI
   migrations) would be worth adopting.
5. **`src/app/api/generate/route.ts`**: error handling when the AI
   Gateway/provider call fails or isn't authenticated — does it fail
   gracefully for the user, or leak internal error detail?
6. **i18n architecture** (`src/lib/i18n/`): it's a client-only
   `localStorage`-based switcher with no SSR/URL-based locale routing —
   worth flagging if that has SEO or first-paint (flash of English before
   hydration) implications worth addressing later.
7. General Next.js App Router correctness — server vs. client component
   boundaries, especially around `Navbar`/`Hero` which were converted to
   client components specifically to support the language switcher.
8. Anything else that looks like a genuine bug, security gap, or
   accessibility issue — the above is a starting list, not an exhaustive
   one.

## What NOT to flag as issues

- Missing PayPal live credentials, missing `AI_GATEWAY_API_KEY`, and the
  unrun Supabase migration are all known, tracked in `PROJECT_STATUS.md`,
  and waiting on the product owner — not something the code needs to
  "fix" itself.
- Sparse i18n coverage beyond nav/hero — also known and in progress.
