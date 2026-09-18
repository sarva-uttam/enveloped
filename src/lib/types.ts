import type { EventTypeId } from "./composition/event-types";

export type TierId = "bronze" | "silver" | "gold" | "platinum";

export type EventCategory =
  | "wedding-hindu"
  | "wedding-christian"
  | "wedding-muslim"
  | "wedding-other"
  | "holiday"
  | "vacation"
  | "hotel-package"
  | "birthday"
  | "other";

export interface TierFeature {
  label: string;
  includedFrom: TierId;
}

export interface Tier {
  id: TierId;
  name: string;
  price: number;
  cadence: "per invite";
  tagline: string;
  colorVar: string;
  softVar: string;
  description: string;
  highlights: string[];
}

export interface GuestEntry {
  id: string;
  name: string;
  slug: string;
  viewed: boolean;
  clickTeaser: string;
}

export interface SurveyAnswers {
  category: EventCategory | null;
  tier: TierId | null;
  partnerNames: string;
  eventDate: string;
  venue: string;
  city: string;
  colorMood: string;
  song: string;
  extraDetails: string;
  guestNames: string;
}

export interface GeneratedInviteContent {
  headline: string;
  subheadline: string;
  welcomeMessage: string;
  eventDetails: {
    label: string;
    value: string;
  }[];
  closingLine: string;
  suggestedPalette: string[];
}

// ---------------------------------------------------------------------
// Concierge / generator schema — recovered from the live database during
// Stage 0 of the browser-generator-v2 rebuild (2026-09-09). See
// PROJECT_STATUS.md's Stage 0 section and supabase/migrations/README.md
// for the full account. These types describe tables and `invites`
// columns that already exist live (`requests`, `templates`,
// `invite_payment_records`, plus request_id/occasion/generator_kind/
// design_spec/generator_content/composition/published_at/
// created_by_admin_id on `invites`) but that NO application code in this
// repository reads or writes yet — no route, component, or storage
// function is wired to them. They exist here purely so future stages have
// an accurate starting shape instead of re-deriving it from the database
// by hand. Adding these types changes no runtime behavior: nothing
// imports them yet.
// ---------------------------------------------------------------------

/**
 * Which specific sub-event within a multi-part wedding an invite/request/
 * template is for. Stage 6 (2026-09-10, see PROJECT_STATUS.md's Stage 6
 * section) replaced the old, permanently Hindu-wedding-only four-value
 * enum this type used to be with the general, extensible vocabulary
 * defined once in src/lib/composition/event-types.ts — re-exported here
 * (not redefined) so every pre-existing consumer of `Occasion`
 * (ConciergeRequest/InviteTemplate below) picks up the wider vocabulary
 * automatically, from the single source of truth. See that file's own
 * header for the full design rationale, including exactly which of the
 * original four values are preserved as first-class vs. flagged
 * legacy-only.
 */
export type Occasion = EventTypeId;

export type RequestStatus =
  | "new"
  | "contacted"
  | "quoted"
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "delivered"
  | "archived";

export type PreferredChannel = "whatsapp" | "email" | "instagram";

/**
 * A concierge intake record — a prospective client's request, captured
 * before any invite exists. Mirrors the live `requests` table exactly
 * (supabase/migrations/20260905073155_requests_and_templates.sql).
 * `agreedPrice`/`agreedCurrency` exist so a concierge sale is never tied
 * to the fixed self-service `TIERS` pricing (src/lib/tiers.ts).
 */
export interface ConciergeRequest {
  id: string;
  referenceCode: string;
  status: RequestStatus;
  name: string;
  email: string | null;
  phone: string | null;
  preferredChannel: PreferredChannel;
  category: EventCategory;
  eventDate: string | null;
  tierInterest: TierId | null;
  notes: string | null;
  requestedOccasions: Occasion[];
  agreedPrice: number | null;
  agreedCurrency: string;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TemplateStatus = "draft" | "active" | "retired";

/**
 * A reusable design template a generator can select from, rather than
 * free-generating markup. Mirrors the live `templates` table exactly
 * (supabase/migrations/20260905073155_requests_and_templates.sql).
 */
export interface InviteTemplate {
  id: string;
  name: string;
  category: EventCategory;
  occasion: Occasion | null;
  minTier: TierId;
  styleTags: string[];
  palette: string[];
  fontPairing: string | null;
  layoutComponent: string;
  animationPreset: string | null;
  musicAllowed: boolean;
  thumbnailUrl: string | null;
  status: TemplateStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OfflinePaymentMethod = "cash" | "bank_transfer" | "mobile_money" | "paypal_manual" | "other";

/**
 * A ledger entry for a payment taken outside PayPal (cash, bank transfer,
 * mobile money, or a manually-recorded PayPal payment) — the
 * concierge-payment counterpart to the PayPal-only `payments` table
 * (see payments.server.ts). Mirrors the live `invite_payment_records`
 * table exactly
 * (supabase/migrations/20260905091530_generator_payment_publish_split.sql).
 */
export interface InvitePaymentRecord {
  id: string;
  inviteId: string;
  method: OfflinePaymentMethod;
  referenceNote: string;
  recordedBy: string;
  recordedAt: string;
}

/**
 * The generator/concierge-specific columns that exist on the live
 * `invites` table. As of Stage 6 (2026-09-10, see PROJECT_STATUS.md's
 * Stage 6 section), `composition` (and, alongside it, `occasion`/
 * `occasionCustomLabel`) IS finally read and rendered — see
 * `StoredInvite.composition` in src/lib/storage-queries.ts and
 * src/lib/composition/resolve.ts. `requestId`/`generatorKind`/
 * `designSpec`/`generatorContent`/`createdByAdminId` remain unmapped by
 * any current storage function (unchanged since Stage 0) — kept as
 * their own type, not merged into `StoredInvite`, so it's obvious at a
 * glance which fields are still live-but-unwired versus actually used.
 */
export interface InviteGeneratorFields {
  requestId: string | null;
  occasion: Occasion | null;
  occasionCustomLabel: string | null;
  generatorKind: string | null;
  designSpec: unknown | null;
  generatorContent: unknown | null;
  composition: unknown | null;
  publishedAt: string | null;
  createdByAdminId: string | null;
}
