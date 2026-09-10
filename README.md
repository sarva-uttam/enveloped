# Enveloped

> Digital invitations shaped around the people, culture, occasion, and budget behind them.

Enveloped is an original digital-invitation platform conceived and built as a full-stack product—not simply a collection of templates. A host describes the celebration, chooses the experience that fits their needs, and receives a shareable invitation with personalized wording, event details, guest links, RSVP collection, and tier-based presentation features.

The idea began with a simple observation: invitations are deeply personal, but creating one is often fragmented between designers, forms, messages, payment conversations, and guest spreadsheets. Enveloped brings that journey into one thoughtful flow while preserving room for human creativity.

## Product experience

1. The host signs in and chooses an event category and package.
2. A guided survey captures the people, date, venue, mood, colours, music, and optional guest details.
3. The generation layer transforms those answers into structured invitation content, with a deterministic fallback when AI is unavailable.
4. The host previews the invitation and completes payment.
5. A published invitation can be shared through a public link or a personalized guest link.
6. Guests can RSVP without creating an account, while the host retains private ownership and management access.

The current experience includes:

- wedding and celebration categories;
- four package tiers with progressive presentation features;
- structured invitation generation through the Vercel AI SDK;
- live invitation previews and reusable template demonstrations;
- tier-aware animation, countdown, RSVP, music, gallery, and guest-personalization features;
- passwordless Supabase authentication;
- owner-scoped invitation management;
- public, accountless RSVP;
- PayPal sandbox order creation and verified capture;
- responsive, multilingual foundations.

## Why this project matters

Enveloped explores more than interface design. It brings together product strategy, emotionally aware UX, generative AI, payments, authentication, relational data, and privacy boundaries in one customer journey.

The most important engineering work is deliberately invisible to a guest:

- raw survey answers and guest lists remain owner-only;
- public invitations are exposed through a deliberately sanitized database function;
- row-level security protects invitation ownership;
- payment state cannot be changed by the browser;
- package pricing is selected and verified server-side;
- PayPal captures are checked for invitation, owner, amount, currency, status, and optional merchant identity;
- anonymous RSVP access is narrow enough to work without exposing private host data;
- payment retries and interrupted database updates are handled idempotently.

This balance—making a product feel effortless while treating trust boundaries seriously—is the central technical challenge of Enveloped.

## Architecture

Enveloped is a Next.js 16 App Router application written in strict TypeScript.

- **Application:** Next.js, React, Tailwind CSS, Framer Motion
- **Data and authentication:** Supabase Postgres, Supabase Auth, Row Level Security
- **Generation:** Vercel AI SDK with schema-validated structured output
- **Payments:** PayPal server-side order and capture routes
- **Validation:** Zod
- **Testing:** Vitest
- **Deployment target:** Vercel

Browser, session-aware server, and service-role database clients are kept separate. Public invitation reads use a minimal RPC response, while owner operations remain protected by authentication and RLS. Payment records are server-controlled and bind each PayPal order to its owner, invitation, package, amount, and currency.

## Current state

The product is under active development.

Completed foundations include:

- authentication and invitation ownership;
- live Supabase persistence and applied security migrations;
- sanitized public invitation delivery;
- secure anonymous RSVP rules;
- server-authoritative PayPal sandbox integration;
- real-database RLS verification;
- unit and route-level regression coverage;
- working survey, generation, invitation, pricing, template, and dashboard surfaces.

Before production release, the remaining work includes broader end-to-end coverage, the complete PayPal wallet approval happy path, final generation strategy and controls, media/storage hardening, complete localization, accessibility refinement, operational monitoring, and deployment configuration.

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for implementation evidence and [REVIEW_BRIEF.md](./REVIEW_BRIEF.md) for the independent-review history and security decisions.

### Database schema

`supabase/migrations/*.sql` is the versioned source of truth for the
schema; `supabase/schema.sql` is a generated reference snapshot (see
[supabase/migrations/README.md](./supabase/migrations/README.md) for the
workflow). As of a 2026-09-09 reconciliation, the live database is ahead
of the self-service flow described above — it also carries a concierge
intake table (`requests`), a design-template catalogue (`templates`), an
offline-payment ledger (`invite_payment_records`), and generator-oriented
columns on `invites` (`design_spec`, `generator_content`, `composition`,
`published_at`, and others), none of which the current application code
reads or writes yet. `PROJECT_STATUS.md`'s "Stage 0" section has the full
account, including a known defect (publication and payment are not yet
independent for these columns) and a known limitation (the recovered
`occasion` vocabulary is Hindu-wedding-specific, not the general,
culturally-extensible model described below).

A database-backed administrator identity (`app_admins` + `is_admin()`)
and a server-protected `/admin` placeholder were added in Stage 2 —
`PROJECT_STATUS.md`'s "Stage 2" section has the full design, including
how to bootstrap the first administrator. Stage 3 then separated
publication from payment: `published_at`, not `paid`, is now the sole
gate on what a guest can see — an administrator may publish an unpaid
invitation, and a paid invitation stays private until one does —
correcting the Stage 0-documented defect where the two were conflated.
See `PROJECT_STATUS.md`'s "Stage 3" section for the full publication/
payment lifecycle, the legacy-row backfill rule, and what applying this
to production will require. Neither migration exists anywhere but this
repository and a local test database so far; neither has been applied to
the live project.

Stage 4 (application-layer only, no database change) replaced the public
`/invite/[id]` page's client-only loading with server rendering: a
published invitation's wording is now present in the initial HTML,
before any hydration or authentication check, and owner-management/
PayPal code no longer reaches a guest's browser at all. See
`PROJECT_STATUS.md`'s "Stage 4" section for the full server/client split,
the security boundary, and a documented trade-off (an owner viewing
their own invite link temporarily lost their management view).

Stage 5 adds one more forward-only migration: secure, tokenized,
read-only preview links (`/preview/[token]`) let a concierge client
review an invitation — published or not — without an account, and a
dedicated authenticated `/dashboard/invite/[id]` route resolves Stage
4's trade-off by re-hosting the owner-management view there instead of
on the public page. See `PROJECT_STATUS.md`'s "Stage 5" section for the
preview-token design (256-bit, one-way-hashed, rotatable, revocable),
the RLS/RPC boundary, and the noindex/no-referrer privacy protections.
Like Stage 2–4's migrations, Stage 5's is verified only against the
local Supabase stack and not yet applied to the live project.

## Generation philosophy

The current system uses an LLM to produce structured invitation copy and palette suggestions from the host survey. The long-term generation model is intentionally being evaluated as a product decision rather than treated as “AI everywhere.”

The target is a hybrid creative system:

- a curated, licensed design library establishes reliable visual quality;
- structured survey answers narrow the most suitable layouts and styles;
- AI personalizes wording, tone, palette, and controlled design parameters;
- human review can remain available for premium or culturally sensitive requests.

This approach aims to provide variety without pretending that unrestricted image generation is automatically good design.

## Local development

### Requirements

- Node.js compatible with the repository dependencies
- npm
- Supabase project credentials
- PayPal sandbox credentials for payment testing
- Vercel AI Gateway credentials for live generation

### Setup

```bash
git clone https://github.com/sarva-uttam/enveloped.git
cd enveloped
npm install
cp .env.example .env.local
npm run dev
```

### Quality gates

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Never commit real credentials. The expected variables and safety notes are documented in `.env.example`.

### Database integration tests

`npm test` above is fast and dependency-free by design — it never touches
a database. Real Postgres/RLS behavior (as genuine `anon`/`authenticated`/
`service_role` callers) is covered separately, against a local, disposable
Docker-backed Supabase stack, never the live project:

```bash
npm run db:start   # once, or after npm run db:stop
npm run test:db    # resets the local database, applies all migrations, runs the suite
```

See [tests/integration/README.md](./tests/integration/README.md) for
prerequisites, the full script list, how these tests are guaranteed never
to reach the live project, and WSL/Docker troubleshooting.

## Product direction

Enveloped's primary business model is concierge-led: a client sends a
request, the admin discusses the event and agrees on a price outside the
application, the admin creates and controls the invitation, the client
receives a private preview, and publication happens only after approval.
Payment state and publication state are meant to remain independent, and
PayPal is optional rather than mandatory.

A simpler self-service flow — survey → AI generation → fixed-tier PayPal
checkout, described elsewhere in this README and still fully working in
the current code — predates this concierge-first direction. **It is being
preserved, not deleted, and is intended to be disabled from public use
once the concierge-first flow is ready** — a later, explicitly-scoped
change, not yet made. It must not control the primary architecture: any
future generation, publication, or payment work is designed around the
concierge model first.

The website remains the source of truth for requests, invitations, order,
payment state, files, decisions, and delivery. Messaging channels such as
WhatsApp can support reminders and customer communication, but should not
become the system of record.

**Weddings are the primary market and product focus**, but the domain
model is meant to support general events (holidays, vacations, hotel
packages, birthdays, and others already present in the category list
above) through reusable **cultural packs**, not a single hardcoded
tradition. See `PROJECT_STATUS.md`'s "Stage 0" section for a known
limitation in the current live schema this direction has not yet reached
(a Hindu-wedding-specific `occasion` vocabulary, recovered as-is from the
live database rather than corrected).

## Repository note

This repository documents an evolving product. Claims in this README describe implemented behavior only where the current code and project-status evidence support them; planned functionality is identified as future direction.
