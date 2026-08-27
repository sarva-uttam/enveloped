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
- **i18n**: a client-side language switcher in the navbar — English, French,
  Hindi, Tamil, Telugu, Marathi, Kreol Morisien — currently covers the
  **navbar and hero only**
- Homepage shows tier names/descriptions but not prices; only `/pricing`
  shows dollar amounts
- AI-forward copy was intentionally toned down site-wide — the product is
  AI-generated but that isn't the headline pitch
- Per-invite Open Graph metadata so a shared link previews with a personal
  message instead of a generic URL/title

## Pending — needs a human to do these, not just code

1. **Run the Supabase migration.** The `paid` / `paypal_order_id` columns
   and their update policy are written at the bottom of
   `supabase/schema.sql` under "Payment gating migration" but have **not**
   been applied to the live database. Paste that block into the Supabase
   SQL editor and run it — without it the payment flow can't mark an
   invite as paid.
2. **Add PayPal credentials.** `.env.local` needs
   `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from
   [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/applications)
   (start with a **Sandbox** app, not Live). Until set, the paywall
   correctly shows "Payments aren't available right now" rather than
   breaking. `PAYPAL_API_BASE_URL` and `NEXT_PUBLIC_PAYPAL_ENV` in
   `.env.example` document the sandbox→live switch.
3. **AI Gateway auth is unset.** `/api/generate` currently throws
   `GatewayAuthenticationError` in local dev — `AI_GATEWAY_API_KEY` (or a
   direct provider key) isn't configured yet, so AI generation doesn't
   actually run end-to-end yet.
4. **i18n is partial by design so far** — only nav + hero are translated.
   Expanding further means adding keys to `src/lib/i18n/translations.ts`
   for each new section (steps, categories, tiers, dashboard, survey…),
   one section at a time.
5. **Translation review recommended.** French is fairly solid. Hindi,
   Tamil, Telugu, and Marathi are AI-translated but not native-reviewed.
   Kreol Morisien was supplied by the user via ChatGPT and looks
   consistent, but hasn't had a native-speaker check either — worth doing
   before real users see any of the five.

## Key files

| Area | Path |
|---|---|
| i18n system | `src/lib/i18n/translations.ts`, `src/lib/i18n/LocaleContext.tsx` |
| PayPal server-side | `src/lib/paypal.ts`, `src/app/api/paypal/**` |
| Paywall UI | `src/components/invite/PaywallPanel.tsx` |
| DB schema (+ pending migration) | `supabase/schema.sql` |
| AI generation endpoint | `src/app/api/generate/route.ts` |
| Local dev server config | `.claude/launch.json` (`npm run dev`, port 3000) |

## Repo

- **Enveloped** (this project): [github.com/monsieur-zordi/enveloped](https://github.com/monsieur-zordi/enveloped) — private
