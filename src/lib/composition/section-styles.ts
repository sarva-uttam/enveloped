/**
 * The trusted section-card treatment registry — Stage 12. A
 * composition's `themeTokens.sectionStyleId` is validated against this
 * closed set and resolved, only by trusted code, to two fixed Tailwind
 * class bundles (a larger "showcase" card — intro/welcome/story — and a
 * smaller "info" card — venue/dressCode/customText/schedule entries).
 * Never a raw class string, never CSS, never composition-supplied —
 * the same "closed registry, trusted resolver" shape as theme.ts.
 *
 * `"soft"` is the default every section renders with today
 * (rounded-3xl/2xl, a soft translucent paper background, a hairline
 * border) — absent `sectionStyleId` on a pre-Stage-12 composition
 * resolves here, so existing invitations keep their current look.
 */

export const SECTION_STYLE_IDS = ["soft", "framed", "ornate", "minimal"] as const;
export type SectionStyleId = (typeof SECTION_STYLE_IDS)[number];

export interface SectionStyleBundle {
  /** Larger showcase cards: intro, welcome, story. */
  cardLg: string;
  /** Smaller info cards: venue, dress code, custom text, schedule entries, gallery frame. */
  cardSm: string;
  /** The small uppercase eyebrow/label some info cards use ("Venue", "Dress Code"). */
  label: string;
}

export const SECTION_STYLE_REGISTRY: Record<SectionStyleId, SectionStyleBundle> = {
  soft: {
    cardLg: "rounded-3xl border border-line bg-paper-raised/80 p-8",
    cardSm: "rounded-2xl border border-line bg-paper-raised/70 p-5",
    label: "text-[11px] font-medium uppercase tracking-wide text-ink-soft",
  },
  // A crisp, editorial rectangle — thin double-weight border, sharp
  // corners, generous internal padding, no translucency.
  framed: {
    cardLg: "rounded-none border-y-2 border-line bg-paper-raised p-9",
    cardSm: "rounded-none border border-line bg-paper-raised p-6",
    label: "text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft",
  },
  // A heavier, warmer treatment for the premium templates — a visible
  // shadow and a slightly deeper radius read as more "designed."
  ornate: {
    cardLg: "rounded-[28px] border border-line/70 bg-paper-raised p-9 shadow-[0_18px_40px_-24px_rgba(33,26,23,0.35)]",
    cardSm: "rounded-2xl border border-line/70 bg-paper-raised p-6 shadow-[0_10px_24px_-16px_rgba(33,26,23,0.3)]",
    label: "text-[11px] font-medium uppercase tracking-[0.2em] text-ink-soft",
  },
  // No card chrome at all — content sits directly on the page with a
  // hairline divider above it, for a spare "Modern Editorial" feel.
  minimal: {
    cardLg: "border-t border-line pt-8",
    cardSm: "border-t border-line pt-5",
    label: "text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-soft",
  },
};

export function isKnownSectionStyleId(value: string): value is SectionStyleId {
  return (SECTION_STYLE_IDS as readonly string[]).includes(value);
}

export function resolveSectionStyle(id: SectionStyleId | undefined): SectionStyleBundle {
  return SECTION_STYLE_REGISTRY[id ?? "soft"];
}
