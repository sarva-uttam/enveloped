import { describe, expect, it } from "vitest";
import components from "../../../design-library/hindu-wedding/registry/components.json";
import templates from "../../../design-library/hindu-wedding/registry/templates.json";
import mappings from "../../../design-library/hindu-wedding/registry/survey-mapping.json";
import placements from "../../../design-library/hindu-wedding/registry/placement-rules.json";
import rules from "../../../design-library/hindu-wedding/registry/compatibility-rules.json";
import { calculateAdjustments, recommendTier, replaceSingleChoice } from "./runtime";
import type { DesignComponent, PreviewState } from "./types";

const inventory = components as DesignComponent[];
const blank: PreviewState = { templateId: null, tier: "BRONZE", selections: {}, reducedMotion: false, estimatedTotal: null, currency: null };

describe("Hindu wedding design library", () => {
  it("parses registries with unique identifiers", () => {
    for (const records of [components, templates, mappings, placements, rules]) {
      const ids = records.map((record: { id?: string; questionId?: string }) => record.id ?? record.questionId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("replaces rather than accumulates a single-choice selection and charge", () => {
    const backgrounds = inventory.filter((c) => c.singleChoiceGroup === "background").slice(0, 2);
    const selected = replaceSingleChoice(replaceSingleChoice(blank, backgrounds[0]), backgrounds[1]);
    expect(selected.selections.background).toEqual([backgrounds[1].id]);
    expect(calculateAdjustments([backgrounds[1]])).toBe(backgrounds[1].priceAdjustment);
  });
  it("recommends a cheaper higher tier when configured", () => expect(recommendTier("BRONZE", 25, { BRONZE: 20, SILVER: 40 })).toBe("SILVER"));
  it("keeps bespoke totals quotation-only", () => expect(calculateAdjustments(inventory.filter((c) => c.pricingClassification === "BESPOKE").slice(0, 1))).toBeNull());
  it("has a complete Bronze path without sacred imagery, motion, or premium additions", () => {
    for (const group of ["background", "architecture", "flower-family", "couple-representation", "typography-names", "typography-body"]) {
      expect(inventory.some((c) => c.tier === "BRONZE" && c.pricingClassification === "INCLUDED" && c.singleChoiceGroup === group)).toBe(true);
    }
  });
  it("enforces sacred restrictions in registry metadata", () => {
    const sacred = inventory.filter((c) => c.category === "sacred");
    expect(sacred.length).toBeGreaterThanOrEqual(12);
    expect(sacred.every((c) => c.slot === "sacred-header" && c.singleChoiceGroup === "principal-sacred-header")).toBe(true);
  });
  it("defines floral and ambient-motion maximums", () => {
    expect(rules.some((r: { id: string; maxSelections?: number }) => r.id === "CR-FLORA-001" && r.maxSelections === 3)).toBe(true);
    expect(rules.some((r: { id: string; maxSelections?: number }) => r.id === "CR-MOTION-001" && r.maxSelections === 3)).toBe(true);
  });
  it("requires reduced-motion fallbacks for animated components", () => expect(inventory.filter((c) => c.animationAllowed).every((c) => Boolean(c.reducedMotionFallback))).toBe(true));
  it("keeps placements inside the 1000 by 1778 canvas", () => expect(placements.every((p: { x: number; y: number; width: number; height: number }) => p.x >= 0 && p.y >= 0 && p.x + p.width <= 1000 && p.y + p.height <= 1778)).toBe(true));
  it("excludes rejected or missing assets from production selection", () => expect(inventory.filter((c) => c.approvalStatus !== "APPROVED").every((c) => c.sourceFilePath === null)).toBe(true));
  it("allows assets only through trusted template-declared slots", () => {
    expect(inventory.every((c) => c.usageModel === "TEMPLATE_DECLARED_SLOT_ONLY" && c.executableContentAllowed === false)).toBe(true);
    expect(templates.every((t: { renderingModel: string; documentPackageStatus: string }) => t.renderingModel === "TRUSTED_HTML_DOCUMENT_PACKAGE" && t.documentPackageStatus === "NOT_IMPLEMENTED")).toBe(true);
  });
});
