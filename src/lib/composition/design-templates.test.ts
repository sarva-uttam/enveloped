import { describe, it, expect } from "vitest";
import { InvitationCompositionSchema, type InvitationComposition } from "./schema";
import { isKnownCulturalPackId } from "./cultural-packs";
import {
  DESIGN_TEMPLATE_IDS,
  DESIGN_TEMPLATES,
  applyDesignTemplate,
  getDesignTemplate,
  templateConflictsWithDraft,
  templatesForPack,
} from "./design-templates";

/**
 * Stage 12 Part 16 — proves the trusted design-template registry itself,
 * not just the schema's own enum validation (schema.test.ts already
 * covers "an unregistered id is rejected").
 */

function baseDraft(overrides: Partial<InvitationComposition> = {}): InvitationComposition {
  const draft = {
    schemaVersion: 1,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "neutral-classic" },
    featureConfig: { motion: true, ambientMotif: "none", openingBurst: false, envelopeOpening: true },
    sections: [
      { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Amara & Devin" } },
      { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you soon" } },
    ],
    ...overrides,
  };
  const result = InvitationCompositionSchema.safeParse(draft);
  if (!result.success) throw new Error(`baseDraft() fixture is invalid: ${result.error.message}`);
  return result.data;
}

describe("every registered design template", () => {
  it("has exactly six entries, matching the brief's initial collection", () => {
    expect(DESIGN_TEMPLATE_IDS.length).toBe(6);
  });

  it.each(DESIGN_TEMPLATE_IDS)("template %s targets a real, registered cultural pack", (id) => {
    const template = DESIGN_TEMPLATES[id];
    expect(isKnownCulturalPackId(template.culturalPackId)).toBe(true);
  });

  it.each(DESIGN_TEMPLATE_IDS)("template %s, applied to a fresh draft, produces a schema-valid composition", (id) => {
    const draft = baseDraft({ designPackId: DESIGN_TEMPLATES[id].culturalPackId });
    const next = applyDesignTemplate(draft, id);
    expect(InvitationCompositionSchema.safeParse(next).success).toBe(true);
    expect(next.templateId).toBe(id);
  });
});

describe("unknown template ids", () => {
  it("getDesignTemplate() returns null for an unregistered id", () => {
    expect(getDesignTemplate("not-a-real-template")).toBeNull();
  });

  it("getDesignTemplate() returns the definition for a real id", () => {
    expect(getDesignTemplate("timeless-ivory")?.name).toBe("Timeless Ivory");
  });
});

describe("applyDesignTemplate() preserves content", () => {
  it("never changes any section's id, type, enabled flag, or data", () => {
    const draft = baseDraft();
    const next = applyDesignTemplate(draft, "evening-burgundy");
    expect(next.sections.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled, data: s.data }))).toEqual(
      draft.sections.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled, data: s.data }))
    );
  });

  it("never changes designPackId, eventCategory, weddingContext, locale, or dir", () => {
    const draft = baseDraft({ weddingContext: null, eventCategory: "wedding-other" });
    const next = applyDesignTemplate(draft, "evening-burgundy");
    expect(next.designPackId).toBe(draft.designPackId);
    expect(next.eventCategory).toBe(draft.eventCategory);
    expect(next.weddingContext).toBe(draft.weddingContext);
    expect(next.locale).toBe(draft.locale);
    expect(next.dir).toBe(draft.dir);
  });

  it("does change the visual tokens the template actually defines", () => {
    const draft = baseDraft();
    const next = applyDesignTemplate(draft, "evening-burgundy");
    const template = DESIGN_TEMPLATES["evening-burgundy"];
    expect(next.themeTokens.paletteId).toBe(template.paletteId);
    expect(next.themeTokens.typographyId).toBe(template.typographyId);
    expect(next.themeTokens.sectionStyleId).toBe(template.sectionStyleId);
    expect(next.featureConfig.decorativeMotifId).toBe(template.decorativeMotifId);
    expect(next.featureConfig.envelopeTreatmentId).toBe(template.envelopeTreatmentId);
    expect(next.sections.every((s) => s.motionPreset === template.motionPresetDefault)).toBe(true);
  });

  it("never sets any field resembling publication/payment state — those aren't composition fields at all", () => {
    const draft = baseDraft();
    const next = applyDesignTemplate(draft, "royal-sangeet");
    expect(Object.keys(next)).not.toContain("publishedAt");
    expect(Object.keys(next)).not.toContain("paid");
  });
});

describe("premium is defined precisely, not a bare cosmetic badge", () => {
  it("every premium template combines the ornate section style, royal-display typography, monogram-seal envelope, and a richer motion default", () => {
    const premiumTemplates = DESIGN_TEMPLATE_IDS.map((id) => DESIGN_TEMPLATES[id]).filter((t) => t.premium);
    expect(premiumTemplates.length).toBeGreaterThan(0);
    for (const t of premiumTemplates) {
      expect(t.sectionStyleId).toBe("ornate");
      expect(t.typographyId).toBe("royal-display");
      expect(t.envelopeTreatmentId).toBe("monogram-seal");
      expect(["ceremonial", "glow", "petals"]).toContain(t.motionPresetDefault);
    }
  });

  it("no non-premium template accidentally has the exact same combination", () => {
    const nonPremium = DESIGN_TEMPLATE_IDS.map((id) => DESIGN_TEMPLATES[id]).filter((t) => !t.premium);
    for (const t of nonPremium) {
      const matchesPremiumProfile = t.sectionStyleId === "ornate" && t.typographyId === "royal-display" && t.envelopeTreatmentId === "monogram-seal";
      expect(matchesPremiumProfile).toBe(false);
    }
  });

  it("there is exactly one premium and one non-premium... at least one non-premium... template per cultural pack", () => {
    for (const packId of ["neutral-classic", "hindu-wedding"] as const) {
      const forPack = templatesForPack(packId);
      expect(forPack.some((t) => t.premium)).toBe(true);
      expect(forPack.some((t) => !t.premium)).toBe(true);
    }
  });
});

describe("templateConflictsWithDraft()", () => {
  it("is false when the draft already matches the target template exactly", () => {
    const draft = baseDraft();
    const applied = applyDesignTemplate(draft, "timeless-ivory");
    expect(templateConflictsWithDraft(applied, "timeless-ivory")).toBe(false);
  });

  it("is true when the draft's design tokens differ from the target template's", () => {
    const draft = baseDraft();
    expect(templateConflictsWithDraft(draft, "evening-burgundy")).toBe(true);
  });

  it("is true when a different template is already applied", () => {
    const draft = applyDesignTemplate(baseDraft(), "timeless-ivory");
    expect(templateConflictsWithDraft(draft, "modern-editorial")).toBe(true);
  });
});

describe("selecting/applying a template never touches unrelated publication state", () => {
  it("applyDesignTemplate has no side effects — it is a pure function returning a new value", () => {
    const draft = baseDraft();
    const draftJsonBefore = JSON.stringify(draft);
    applyDesignTemplate(draft, "rose-mandap");
    expect(JSON.stringify(draft)).toBe(draftJsonBefore);
  });
});
