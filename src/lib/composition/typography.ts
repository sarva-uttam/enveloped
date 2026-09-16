/**
 * The trusted typography-pairing registry — Stage 12. A composition's
 * `themeTokens.typographyId` is validated against this closed set (same
 * "z.enum built from the registry's own keys" shape as
 * PALETTE_IDS/CULTURAL_PACK_IDS) and resolved, only by this trusted
 * module, to real Tailwind class strings. No new font files: every
 * pairing below combines the two families this project already loads
 * (`--font-display` = Fraunces, `--font-sans` = Inter) — real visual
 * variety comes from weight, size, tracking, and italic usage, not from
 * importing more fonts.
 *
 * Absent on every pre-Stage-12 composition — `resolveTypography(undefined)`
 * returns the exact classes `sections.tsx` already hardcoded, so nothing
 * already saved changes appearance.
 */

export const TYPOGRAPHY_IDS = ["classic-serif", "editorial-sans", "royal-display"] as const;
export type TypographyId = (typeof TYPOGRAPHY_IDS)[number];

export interface TypographyBundle {
  /** The opening headline / section h2 treatment. */
  headline: string;
  /** The small eyebrow/kicker label above a headline. */
  eyebrow: string;
  /** Body copy (story, welcome, closing messages). */
  body: string;
}

export const TYPOGRAPHY_REGISTRY: Record<TypographyId, TypographyBundle> = {
  // Today's exact classes (OpeningSection/IntroSection/etc. in
  // sections.tsx) — the default every legacy composition renders with.
  "classic-serif": {
    headline: "font-display italic",
    eyebrow: "text-[11px] font-medium uppercase tracking-widest",
    body: "text-ink-soft leading-relaxed",
  },
  "editorial-sans": {
    headline: "font-sans font-semibold uppercase tracking-[0.08em] not-italic",
    eyebrow: "text-[10px] font-semibold uppercase tracking-[0.28em]",
    body: "font-sans text-ink-soft leading-loose",
  },
  "royal-display": {
    headline: "font-display italic font-light text-[1.08em]",
    eyebrow: "text-[11px] font-medium uppercase tracking-[0.32em]",
    body: "font-display text-ink-soft leading-relaxed",
  },
};

export function isKnownTypographyId(value: string): value is TypographyId {
  return (TYPOGRAPHY_IDS as readonly string[]).includes(value);
}

export function resolveTypography(id: TypographyId | undefined): TypographyBundle {
  return TYPOGRAPHY_REGISTRY[id ?? "classic-serif"];
}
