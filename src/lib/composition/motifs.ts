/**
 * The trusted decorative-motif registry — Stage 12. A composition's
 * `featureConfig.decorativeMotifId` is validated against this closed set;
 * the actual rendering (original CSS/SVG, never stock art or imported
 * imagery) lives only in trusted application code
 * (src/components/experience/AtmosphericEffect.tsx), exactly the same
 * "closed id, trusted resolver" shape every other registry in this
 * directory uses. This file carries id/label/description only — no
 * markup, no classNames, nothing a stored value could turn into
 * anything renderable on its own.
 *
 * Every motif is purely ambient/non-representational decoration: no
 * sacred imagery, no invented ritual iconography, matching
 * cultural-packs.ts's own "purely ambient... never a claim that every
 * ceremony looks alike" constraint. `"marigold-drift"`, `"lotus-geometric"`,
 * and `"diya-warmth"` are respectful, generic evocations (a flower, a
 * geometric lotus lattice, a warm glow) — never a depiction of a deity,
 * ritual object, or sacred text.
 *
 * Absent `decorativeMotifId` on a pre-Stage-12 composition resolves via
 * `legacyMotifForPack()` below — the exact "hindu-wedding → petals,
 * everything else → soft-glow" branch AtmosphericEffect.tsx already
 * implements, so existing invitations render unchanged.
 */

export const DECORATIVE_MOTIF_IDS = [
  "none",
  "soft-glow",
  "botanical-line",
  "marigold-drift",
  "lotus-geometric",
  "diya-warmth",
] as const;
export type DecorativeMotifId = (typeof DECORATIVE_MOTIF_IDS)[number];

export const DECORATIVE_MOTIF_REGISTRY: Record<DecorativeMotifId, { label: string; description: string }> = {
  none: { label: "None", description: "No ambient decoration." },
  "soft-glow": { label: "Soft glow", description: "A handful of slow-pulsing, blurred paper-toned highlights." },
  "botanical-line": { label: "Botanical line", description: "Thin, single-line botanical sketches drifting at the page edges." },
  "marigold-drift": { label: "Marigold drift", description: "Warm marigold-toned petal glyphs drifting downward." },
  "lotus-geometric": { label: "Lotus geometric", description: "A faceted, geometric lotus lattice, rendered as line art." },
  "diya-warmth": { label: "Diya warmth", description: "A warm, flickering-glow ambient light treatment." },
};

export function isKnownDecorativeMotifId(value: string): value is DecorativeMotifId {
  return (DECORATIVE_MOTIF_IDS as readonly string[]).includes(value);
}

/** The pre-Stage-12 fallback — matches AtmosphericEffect.tsx's original,
 *  pack-only branch exactly, used whenever a composition sets no
 *  explicit `decorativeMotifId`. */
export function legacyMotifForPack(designPackId: string): DecorativeMotifId {
  return designPackId === "hindu-wedding" ? "marigold-drift" : "soft-glow";
}
