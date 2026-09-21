/**
 * The trusted palette registry — Stage 6 (see PROJECT_STATUS.md's Stage 6
 * section). A composition's `themeTokens.paletteId` is validated against
 * this closed set (never a raw CSS string, never a Tailwind class list —
 * "do not allow users to submit unrestricted Tailwind classes or CSS").
 * Each id resolves, server-side, to already-trusted values — the exact
 * same CSS custom-property references `src/lib/tiers.ts`'s
 * `colorVar`/`softVar` have always used, so a legacy-adapted composition
 * (`src/lib/composition/legacy-adapter.ts`) renders with byte-identical
 * colors to before this stage.
 *
 * The four tier-named entries are not a coincidence — they exist so the
 * self-service tier system keeps working exactly as it does today,
 * without composition needing to know anything about pricing tiers at
 * all (a concierge-authored composition for a client who never went
 * through self-service checkout has no "tier" concept). `neutral-classic`
 * and `hindu-classic` back Part D's two defined cultural packs — both
 * intentionally reuse existing, already-designed CSS variables (no new
 * visual artwork this stage, per the task's own restriction) rather than
 * inventing new colors no designer has approved.
 */

export const PALETTE_IDS = ["bronze", "silver", "gold", "platinum", "neutral-classic", "hindu-classic"] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export interface PaletteTokens {
  accent: string;
  soft: string;
}

export const PALETTE_REGISTRY: Record<PaletteId, PaletteTokens> = {
  bronze: { accent: "var(--bronze)", soft: "var(--bronze-soft)" },
  silver: { accent: "var(--silver)", soft: "var(--silver-soft)" },
  gold: { accent: "var(--gold)", soft: "var(--gold-soft)" },
  platinum: { accent: "var(--platinum)", soft: "var(--platinum-soft)" },
  // Cultural-pack defaults (Part D) — reuse existing, already-approved
  // tokens rather than inventing new ones; a future stage with real
  // visual design work may give these their own dedicated variables.
  "neutral-classic": { accent: "var(--silver)", soft: "var(--silver-soft)" },
  "hindu-classic": { accent: "var(--gold)", soft: "var(--gold-soft)" },
};

export function isKnownPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}
