import { describe, it, expect } from "vitest";
import { SECTION_STYLE_IDS, isKnownSectionStyleId, resolveSectionStyle } from "./section-styles";

describe("section-style registry", () => {
  it("resolves every registered id to a bundle with no HTML/markup in its classes", () => {
    for (const id of SECTION_STYLE_IDS) {
      const bundle = resolveSectionStyle(id);
      expect(bundle.cardLg).not.toMatch(/[<>]/);
      expect(bundle.cardSm).not.toMatch(/[<>]/);
      expect(bundle.label).not.toMatch(/[<>]/);
    }
  });

  it("resolves undefined to the same bundle as the pre-Stage-12 default (soft)", () => {
    expect(resolveSectionStyle(undefined)).toEqual(resolveSectionStyle("soft"));
  });

  it("isKnownSectionStyleId rejects an unregistered value", () => {
    expect(isKnownSectionStyleId("not-a-real-id")).toBe(false);
    expect(isKnownSectionStyleId("ornate")).toBe(true);
  });
});
