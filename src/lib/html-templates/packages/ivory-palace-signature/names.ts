/**
 * Couple-name line-format decision — same rationale and method as
 * ../timeless-editorial-v2/names.ts, reused verbatim here because this
 * template ships the identical font file
 * (assets/fonts/alex-brush-latin-400-normal.woff2, byte-for-byte the
 * same as timeless-editorial-v2's copy), so the same empirically
 * calibrated Chromium/Playwright measurements apply unchanged: real
 * "Person One & Person Two" strings converged on ~0.40–0.44 em/char in
 * Alex Brush. ALEX_BRUSH_AVG_CHAR_WIDTH_EM is set above that observed
 * range and NAME_FIT_SAFETY_MARGIN adds a further buffer, biasing
 * toward the always-safe stacked (three-line) layout whenever in
 * doubt — per SCENE-SPEC.md's "long names may wrap once at natural
 * word boundaries; never condense horizontally" rule, stacked format
 * is the layout that can absorb an unusually long name safely, so any
 * uncertainty should push the decision toward it, never toward a
 * one-line layout that might clip.
 */

export const ALEX_BRUSH_AVG_CHAR_WIDTH_EM = 0.47;
export const NAME_FIT_SAFETY_MARGIN = 1.12;

/** Estimated rendered width, in px, of "person1 & person2" at fontSizePx. */
export function estimateInlineNamesWidthPx(person1: string, person2: string, fontSizePx: number): number {
  const combined = `${person1} & ${person2}`;
  return combined.length * ALEX_BRUSH_AVG_CHAR_WIDTH_EM * fontSizePx * NAME_FIT_SAFETY_MARGIN;
}

export type NameLineFormat = "inline" | "stacked";

/**
 * Desktop-only decision (mobile always stacks per SCENE-SPEC.md's name
 * handling rules — see the mobile media query in render.ts, which
 * overrides this regardless of the class emitted here).
 */
export function chooseDesktopNameFormat(
  person1: string,
  person2: string,
  safeWidthPx: number,
  fontSizePx: number,
): NameLineFormat {
  const estimated = estimateInlineNamesWidthPx(person1, person2, fontSizePx);
  return estimated <= safeWidthPx ? "inline" : "stacked";
}
