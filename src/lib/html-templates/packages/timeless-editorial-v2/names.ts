/**
 * Couple-name line-format decision.
 *
 * The document is generated server-side with zero client-side script,
 * so the one-line vs. three-line choice has to be made here, once, at
 * render time — not measured live in a browser. To make that decision
 * safely we need a real estimate of how wide "Person One & Person Two"
 * actually renders in the bundled Alex Brush calligraphy font, not a
 * guess.
 *
 * That estimate was calibrated empirically: the font file this package
 * ships (assets/fonts/alex-brush-latin-400-normal.woff2) was loaded in
 * a real Chromium instance (via Playwright) and several representative
 * "Person One & Person Two" strings were measured with
 * getBoundingClientRect(). Combined strings of realistic name length
 * converged on roughly 0.40-0.44 em per character:
 *
 *   "Eleanor Whitfield & Julian Marsh"                                   -> 0.4037 em/char
 *   "Priya & Devendra"                                                   -> 0.4387 em/char
 *   "Wei Zhang & Priyanka Sharma-Patel"                                  -> 0.4448 em/char
 *   "Alexandria Cunningham-Fairweather & Maximilian Worthington-Blackwood" -> 0.4021 em/char
 *
 * ALEX_BRUSH_AVG_CHAR_WIDTH_EM below is set above that observed range,
 * and NAME_FIT_SAFETY_MARGIN adds a further buffer on top — biasing
 * the estimate toward *overestimating* width. That's deliberate: the
 * one hard rule here is "never clip the names," and the three-line
 * stacked format is always safe (each name sits on its own dedicated
 * line, sized independently), so any uncertainty should push the
 * decision toward stacked, never toward a one-line layout that might
 * not actually fit.
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
 * Desktop-only decision (mobile always stacks — see the mobile media
 * query in render.ts, which overrides this regardless of the class it
 * emits). `safeWidthPx` and `fontSizePx` should be the desktop
 * content-safe-area width and the *maximum* clamp() font-size the
 * one-line layout would render at, so the check is evaluated at its
 * most generous (hardest-to-fit) case.
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
