import { InvitationCompositionSchema, type InvitationComposition, type MotionPresetId } from "./schema";
import { DESIGN_TEMPLATE_IDS, isKnownDesignTemplateId, type DesignTemplateId } from "./design-template-ids";
import type { CulturalPackId } from "./cultural-packs";
import type { PaletteId, DensityId } from "./theme";
import type { TypographyId } from "./typography";
import type { SectionStyleId } from "./section-styles";
import type { DecorativeMotifId } from "./motifs";
import type { EnvelopeTreatmentId } from "./envelope-treatments";

export { DESIGN_TEMPLATE_IDS, isKnownDesignTemplateId, type DesignTemplateId };

/**
 * The trusted design-template registry — Stage 12. A template is a
 * fixed bundle of the trusted visual-differentiation ids already
 * validated by schema.ts (palette, typography, section style, density,
 * decorative motif, envelope treatment, a default motion preset) plus
 * which cultural pack it's meant for — "stable identifiers... trusted
 * configuration, not arbitrary executable code," the exact same shape
 * CULTURAL_PACKS/PALETTE_REGISTRY already use. A `DesignTemplateDefinition`
 * is plain data: no component reference, no className string outside the
 * already-closed enums above, nothing a future stored value could ever
 * smuggle arbitrary CSS/markup through.
 *
 * Distinguishing the four related concepts by name, per the brief:
 * `culturalPackId` (structural/wording defaults — cultural-packs.ts) is
 * NOT a template; `paletteId` (one color pairing — theme.ts) is one
 * ingredient of a template, not the whole thing; a "motion/effect
 * preset" here is `motionPresetDefault` (schema.ts's MOTION_PRESETS) —
 * the default per-section reveal a template applies, still independently
 * editable afterward per section; `premium` is a template-level flag,
 * defined precisely below, never a cosmetic label alone.
 */
export interface DesignTemplateDefinition {
  id: DesignTemplateId;
  name: string;
  description: string;
  culturalPackId: CulturalPackId;
  paletteId: PaletteId;
  typographyId: TypographyId;
  sectionStyleId: SectionStyleId;
  densityId: DensityId;
  decorativeMotifId: DecorativeMotifId;
  envelopeTreatmentId: EnvelopeTreatmentId;
  /** The per-section motion preset this template assigns on apply —
   *  still just one of schema.ts's MOTION_PRESETS, still independently
   *  editable per section afterward. */
  motionPresetDefault: MotionPresetId;
  ambientMotifIntensity: "light" | "full";
  /** Precisely defined, never a bare cosmetic badge: a premium template
   *  is the one per cultural pack combining the "ornate" section style,
   *  the "royal-display" typography pairing, the "monogram-seal"
   *  envelope treatment, and a richer motion default than the pack's own
   *  non-premium sibling — see design-templates.test.ts, which asserts
   *  this correlation holds for every entry below, not just documents it
   *  here. */
  premium: boolean;
}

export const DESIGN_TEMPLATES: Record<DesignTemplateId, DesignTemplateDefinition> = {
  "timeless-ivory": {
    id: "timeless-ivory",
    name: "Timeless Ivory",
    description: "A restrained, classic ivory palette with soft rounded cards and gentle motion — a dependable default for any civil or interfaith ceremony.",
    culturalPackId: "neutral-classic",
    paletteId: "neutral-classic",
    typographyId: "classic-serif",
    sectionStyleId: "soft",
    densityId: "comfortable",
    decorativeMotifId: "soft-glow",
    envelopeTreatmentId: "classic",
    motionPresetDefault: "fade",
    ambientMotifIntensity: "light",
    premium: false,
  },
  "modern-editorial": {
    id: "modern-editorial",
    name: "Modern Editorial",
    description: "A spare, magazine-inspired layout — uppercase tracked headings, hairline dividers instead of cards, airy spacing.",
    culturalPackId: "neutral-classic",
    paletteId: "silver",
    typographyId: "editorial-sans",
    sectionStyleId: "minimal",
    densityId: "airy",
    decorativeMotifId: "botanical-line",
    envelopeTreatmentId: "bordered-frame",
    motionPresetDefault: "rise",
    ambientMotifIntensity: "light",
    premium: false,
  },
  "evening-burgundy": {
    id: "evening-burgundy",
    name: "Evening Burgundy",
    description: "A dramatic, formal-evening treatment — deep burgundy accents, an ornate card style, and slower, more ceremonial motion.",
    culturalPackId: "neutral-classic",
    paletteId: "bronze",
    typographyId: "royal-display",
    sectionStyleId: "ornate",
    densityId: "compact",
    decorativeMotifId: "soft-glow",
    envelopeTreatmentId: "monogram-seal",
    motionPresetDefault: "ceremonial",
    ambientMotifIntensity: "full",
    premium: true,
  },
  "golden-marigold": {
    id: "golden-marigold",
    name: "Golden Marigold",
    description: "A warm, golden Hindu-wedding treatment with drifting marigold accents and comfortably spaced sections.",
    culturalPackId: "hindu-wedding",
    paletteId: "hindu-classic",
    typographyId: "classic-serif",
    sectionStyleId: "soft",
    densityId: "comfortable",
    decorativeMotifId: "marigold-drift",
    envelopeTreatmentId: "classic",
    motionPresetDefault: "petals",
    ambientMotifIntensity: "full",
    premium: false,
  },
  "rose-mandap": {
    id: "rose-mandap",
    name: "Rose Mandap",
    description: "A framed, geometric treatment evoking mandap latticework, with a rose-toned lotus motif and crisp editorial structure.",
    culturalPackId: "hindu-wedding",
    paletteId: "hindu-classic",
    typographyId: "editorial-sans",
    sectionStyleId: "framed",
    densityId: "comfortable",
    decorativeMotifId: "lotus-geometric",
    envelopeTreatmentId: "bordered-frame",
    motionPresetDefault: "stagger",
    ambientMotifIntensity: "light",
    premium: false,
  },
  "royal-sangeet": {
    id: "royal-sangeet",
    name: "Royal Sangeet",
    description: "The most elaborate Hindu-wedding treatment — an ornate card style, diya-warmth ambient light, and cinematic motion throughout.",
    culturalPackId: "hindu-wedding",
    paletteId: "gold",
    typographyId: "royal-display",
    sectionStyleId: "ornate",
    densityId: "comfortable",
    decorativeMotifId: "diya-warmth",
    envelopeTreatmentId: "monogram-seal",
    motionPresetDefault: "glow",
    ambientMotifIntensity: "full",
    premium: true,
  },
};

/** Every registered template, validated at module load in
 *  design-templates.test.ts against isKnownCulturalPackId — an
 *  incompatible/typo'd pack id here would otherwise only surface at
 *  runtime, the first time an admin tried to apply the template. */
export function getDesignTemplate(id: string): DesignTemplateDefinition | null {
  return isKnownDesignTemplateId(id) ? DESIGN_TEMPLATES[id] : null;
}

export function listDesignTemplates(): DesignTemplateDefinition[] {
  return DESIGN_TEMPLATE_IDS.map((id) => DESIGN_TEMPLATES[id]);
}

export function templatesForPack(packId: string): DesignTemplateDefinition[] {
  return listDesignTemplates().filter((t) => t.culturalPackId === packId);
}

/**
 * Applies a trusted template's visual tokens to an existing draft — the
 * ONLY way the admin UI ever changes `themeTokens`/most of
 * `featureConfig`/every section's `motionPreset` in one action. Pure, no
 * I/O (reusable from both the client draft-editor and, if ever needed,
 * server code), and deliberately narrow in what it touches:
 *
 *   - SET: templateId, themeTokens.{paletteId,typographyId,sectionStyleId,
 *     densityId}, featureConfig.{motion,ambientMotif,openingBurst,
 *     decorativeMotifId,envelopeTreatmentId}, every section's own
 *     motionPreset.
 *   - NEVER TOUCHED: designPackId, eventCategory, weddingContext, locale,
 *     dir, every section's `id`/`type`/`enabled`/`data` — "preserve
 *     invitation wording and event data" and "must not... erase
 *     meaningful client content" hold by construction, not convention.
 *
 * Always returns a value that re-validates against
 * InvitationCompositionSchema (asserted by design-templates.test.ts for
 * every registered template against a representative draft) — applying
 * a template can never itself produce an invalid composition, and never
 * sets `published_at`/payment state, since those aren't composition
 * fields at all.
 */
export function applyDesignTemplate(current: InvitationComposition, templateId: DesignTemplateId): InvitationComposition {
  const template = DESIGN_TEMPLATES[templateId];

  const next: InvitationComposition = {
    ...current,
    templateId: template.id,
    themeTokens: {
      ...current.themeTokens,
      paletteId: template.paletteId,
      typographyId: template.typographyId,
      sectionStyleId: template.sectionStyleId,
      densityId: template.densityId,
    },
    featureConfig: {
      ...current.featureConfig,
      motion: true,
      ambientMotif: template.ambientMotifIntensity,
      openingBurst: template.motionPresetDefault === "ceremonial" || template.motionPresetDefault === "glow",
      decorativeMotifId: template.decorativeMotifId,
      envelopeTreatmentId: template.envelopeTreatmentId,
    },
    sections: current.sections.map((section) => ({ ...section, motionPreset: template.motionPresetDefault })),
  };

  const validated = InvitationCompositionSchema.safeParse(next);
  // Every field this function sets is drawn from a trusted, already-
  // registered template definition; a failure here would mean the
  // registry itself is malformed, not that the admin supplied bad
  // input — surfaced loudly rather than silently returning `current`,
  // exactly the assumption design-templates.test.ts enforces for every
  // registered id.
  if (!validated.success) {
    throw new Error(`applyDesignTemplate produced an invalid composition for template "${templateId}": ${validated.error.message}`);
  }
  return validated.data;
}

/**
 * Whether applying `templateId` would change any visual token the
 * current draft already has explicitly set — used by the admin UI to
 * decide whether to show a "this will replace your current design
 * settings" confirmation before applying (the brief's "warn before
 * replacing conflicting design settings"). Compares only the fields
 * applyDesignTemplate() actually changes, never content.
 */
export function templateConflictsWithDraft(current: InvitationComposition, templateId: DesignTemplateId): boolean {
  const template = DESIGN_TEMPLATES[templateId];
  if (current.templateId && current.templateId !== templateId) return true;
  return (
    current.themeTokens.paletteId !== template.paletteId ||
    current.themeTokens.typographyId !== template.typographyId ||
    current.themeTokens.sectionStyleId !== template.sectionStyleId ||
    current.themeTokens.densityId !== template.densityId ||
    Boolean(current.featureConfig.decorativeMotifId && current.featureConfig.decorativeMotifId !== template.decorativeMotifId) ||
    Boolean(current.featureConfig.envelopeTreatmentId && current.featureConfig.envelopeTreatmentId !== template.envelopeTreatmentId)
  );
}
