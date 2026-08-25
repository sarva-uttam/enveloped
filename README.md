# Enveloped

AI-crafted digital invites for weddings and every other celebration —
built with Next.js (App Router), Tailwind CSS, and the Vercel AI SDK.

## What's here

- **Landing page** (`/`) — pitch, "how it works", a live WhatsApp-style demo
  of the personalized "click me" delivery mechanic, event categories, and a
  tier preview.
- **Pricing** (`/pricing`) — Bronze / Silver / Gold / Platinum tiers with a
  full feature comparison table.
- **Survey** (`/survey`) — multi-step wizard that collects event details and
  (on Platinum) a guest list, then generates the invite.
- **AI generation** (`/api/generate`) — calls an LLM through the Vercel AI
  Gateway to write the invite's headline, copy, event details, and color
  palette from the survey answers. Falls back to a deterministic local
  generator (`src/lib/fallback-content.ts`) if no AI credentials are
  configured yet, so the app is fully clickable out of the box.
- **Invite viewer** (`/invite/[id]`) — renders the generated invite with
  tier-gated features: entrance animation (Silver+), RSVP + countdown
  (Silver+), music toggle + gallery (Gold+), opening color/petal burst +
  per-guest personalization (Platinum). Includes a copyable link per guest
  for the Platinum "named invite for everyone" feature.
- **Templates** (`/templates`) — four live demo invites, one per tier.
- **Dashboard** (`/dashboard`) — lists invites created on this device.

## Persistence — Supabase (connected)

Invites, guests, and RSVPs are backed by a real Supabase Postgres project
(`src/lib/supabase/client.ts`, schema in `supabase/schema.sql`, three
tables: `invites`, `invite_guests`, `invite_rsvps`). Credentials are in
`.env.local` (gitignored). Generated invite links now resolve on any
device/browser, and the RSVP form writes a real row, linked to the named
guest when the link was a personal Platinum one.

`src/lib/storage.ts` always keeps a browser-local cache too (offline
fallback, and it powers the device-scoped "My invites" dashboard list,
since there's no auth/accounts yet to scope a real per-user query).

**Known gap, before a real public launch:** RLS policies on all three
tables are currently wide open (anyone with the anon key can read/write
any invite — see the comment block in `supabase/schema.sql`). Fine for a
demo; needs Supabase Auth + an `owner_id` column (or server-side writes via
the service role) before real couples' data goes through this.

## AI generation setup

`/api/generate` uses `generateObject` from the `ai` package with a plain
`"anthropic/claude-sonnet-4.6"` model string, which routes through the
**Vercel AI Gateway** automatically. To enable real AI output:

```bash
npm i -g vercel   # if not already installed
vercel link
# enable AI Gateway for the project in the Vercel dashboard, then:
vercel env pull .env.local
```

Or set `AI_GATEWAY_API_KEY` directly in `.env.local` for local-only use.
Until either is set, the app silently falls back to templated copy — it
still looks and behaves the same, just without true AI personalization.

## Payments

Pricing tiers are presented but **no checkout is wired up** — "Choose
[tier]" currently routes into the survey. Wiring real payments (Stripe,
PayPal, etc.) was left out of this pass since it involves real money and
account credentials; say the word and it can be added next.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
vercel deploy        # preview
vercel deploy --prod # production
```
