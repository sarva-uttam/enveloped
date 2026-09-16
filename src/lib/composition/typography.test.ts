import { describe, it, expect } from "vitest";
import { TYPOGRAPHY_IDS, isKnownTypographyId, resolveTypography } from "./typography";

describe("typography registry", () => {
  it("resolves every registered id to a bundle with no HTML/markup in its classes", () => {
    for (const id of TYPOGRAPHY_IDS) {
      const bundle = resolveTypography(id);
      expect(bundle.headline).not.toMatch(/[<>]/);
      expect(bundle.eyebrow).not.toMatch(/[<>]/);
      expect(bundle.body).not.toMatch(/[<>]/);
    }
  });

  it("resolves undefined to the same bundle as the pre-Stage-12 default (classic-serif)", () => {
    expect(resolveTypography(undefined)).toEqual(resolveTypography("classic-serif"));
  });

  it("isKnownTypographyId rejects an unregistered value", () => {
    expect(isKnownTypographyId("not-a-real-id")).toBe(false);
    expect(isKnownTypographyId("classic-serif")).toBe(true);
  });
});
