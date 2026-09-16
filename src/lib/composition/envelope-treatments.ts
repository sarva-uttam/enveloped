/**
 * The trusted envelope-opening treatment registry — Stage 12. A
 * composition's `featureConfig.envelopeTreatmentId` is validated against
 * this closed set; the actual shapes/borders are resolved only by
 * trusted code in src/components/experience/EnvelopeOpening.tsx (the
 * same original, hand-built CSS/SVG envelope that component already
 * renders — no imported artwork, no proprietary asset). This file
 * carries id/label only.
 *
 * Absent on a pre-Stage-12 composition resolves to `"classic"` —
 * EnvelopeOpening.tsx's existing, unmodified shape — so nothing already
 * saved changes appearance.
 */

export const ENVELOPE_TREATMENT_IDS = ["classic", "bordered-frame", "monogram-seal"] as const;
export type EnvelopeTreatmentId = (typeof ENVELOPE_TREATMENT_IDS)[number];

export const ENVELOPE_TREATMENT_REGISTRY: Record<EnvelopeTreatmentId, { label: string; description: string }> = {
  classic: { label: "Classic", description: "The original envelope shape and flap." },
  "bordered-frame": { label: "Bordered frame", description: "A double-line border frame around the envelope body." },
  "monogram-seal": { label: "Monogram seal", description: "A circular wax-seal-style monogram mark on the flap." },
};

export function isKnownEnvelopeTreatmentId(value: string): value is EnvelopeTreatmentId {
  return (ENVELOPE_TREATMENT_IDS as readonly string[]).includes(value);
}
