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

## Product direction

Enveloped is being designed for two complementary service levels:

- **Instant creation:** the platform generates and publishes a controlled invitation experience automatically.
- **Concierge creation:** complex or premium requests enter an owner workflow for human-assisted design and approval.

The website remains the source of truth for the survey, order, payment state, files, decisions, and delivery. Messaging channels such as WhatsApp can support reminders and customer communication, but should not become the system of record.

## Repository note

This repository documents an evolving product. Claims in this README describe implemented behavior only where the current code and project-status evidence support them; planned functionality is identified as future direction.
