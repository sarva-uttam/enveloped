import type { Tier, TierFeature, TierId } from "./types";

export const TIERS: Tier[] = [
  {
    id: "bronze",
    name: "Bronze",
    price: 19,
    cadence: "per invite",
    tagline: "Clean, elegant, done in minutes.",
    colorVar: "var(--bronze)",
    softVar: "var(--bronze-soft)",
    description:
      "A beautifully typeset single-page invite with your event details and one elegant static design theme.",
    highlights: [
      "One curated design theme",
      "Core event details (who, when, where)",
      "Shareable single link for all guests",
      "Mobile-optimized page",
    ],
  },
  {
    id: "silver",
    name: "Silver",
    price: 39,
    cadence: "per invite",
    tagline: "More design, a touch of motion.",
    colorVar: "var(--silver)",
    softVar: "var(--silver-soft)",
    description:
      "Everything in Bronze, plus subtle entrance animation, RSVP collection, and a small palette of design themes to choose from.",
    highlights: [
      "Everything in Bronze",
      "5 design themes to choose from",
      "Gentle entrance animation",
      "Built-in RSVP form",
      "Countdown to the big day",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    price: 79,
    cadence: "per invite",
    tagline: "Immersive, animated, memorable.",
    colorVar: "var(--gold)",
    softVar: "var(--gold-soft)",
    description:
      "Everything in Silver, plus full 2D scroll animation, background music, and AI-personalized wording tuned to your story.",
    highlights: [
      "Everything in Silver",
      "Full design library access",
      "Scroll-triggered 2D animation",
      "Background song of your choice",
      "AI-personalized invite copy",
      "Photo gallery section",
    ],
  },
  {
    id: "platinum",
    name: "Platinum",
    price: 149,
    cadence: "per invite",
    tagline: "A moment, not a message — for every guest, by name.",
    colorVar: "var(--platinum)",
    softVar: "var(--platinum-soft)",
    description:
      "The full experience: opening animation with color and petals thrown at the screen, ambient background motifs, your song, and a unique named invite generated for every single guest on your list.",
    highlights: [
      "Everything in Gold",
      "Cinematic opening animation (color burst / petals)",
      "Ambient background motif (flowers, custom icons)",
      "Named invite for every guest — automatically generated",
      "One custom 'click me' teaser link per guest",
      "Custom design consultation",
      "Priority delivery & support",
    ],
  },
];

export const TIER_FEATURE_MATRIX: TierFeature[] = [
  { label: "Elegant single-page design", includedFrom: "bronze" },
  { label: "Mobile-optimized delivery link", includedFrom: "bronze" },
  { label: "Multiple design themes", includedFrom: "silver" },
  { label: "RSVP collection", includedFrom: "silver" },
  { label: "Countdown timer", includedFrom: "silver" },
  { label: "Full scroll animation", includedFrom: "gold" },
  { label: "Background music", includedFrom: "gold" },
  { label: "AI-personalized wording", includedFrom: "gold" },
  { label: "Photo gallery", includedFrom: "gold" },
  { label: "Cinematic opening (color/petal burst)", includedFrom: "platinum" },
  { label: "Ambient background motif", includedFrom: "platinum" },
  { label: "Per-guest named invites", includedFrom: "platinum" },
  { label: "Per-guest teaser links", includedFrom: "platinum" },
  { label: "Custom design consultation", includedFrom: "platinum" },
];

const TIER_ORDER: TierId[] = ["bronze", "silver", "gold", "platinum"];

export function tierIncludes(tier: TierId, includedFrom: TierId) {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(includedFrom);
}

export function getTier(id: TierId) {
  return TIERS.find((t) => t.id === id)!;
}
