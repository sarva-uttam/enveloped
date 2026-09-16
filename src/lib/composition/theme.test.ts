import { describe, it, expect } from "vitest";
import { DENSITY_IDS, isKnownDensityId, resolveDensityMargin, isKnownPaletteId } from "./theme";

describe("density registry", () => {
  it("isKnownDensityId rejects an unregistered value", () => {
    expect(isKnownDensityId("not-a-real-id")).toBe(false);
    expect(isKnownDensityId("airy")).toBe(true);
  });

  it("resolveDensityMargin(undefined, ...) matches the pre-Stage-12 default (comfortable) exactly", () => {
    expect(resolveDensityMargin(undefined, "mt-12")).toBe(resolveDensityMargin("comfortable", "mt-12"));
    expect(resolveDensityMargin("comfortable", "mt-12")).toBe("mt-12");
    expect(resolveDensityMargin("comfortable", "mt-14")).toBe("mt-14");
    expect(resolveDensityMargin("comfortable", "mt-16")).toBe("mt-16");
  });

  it("an empty base margin (the opening section) always resolves to empty regardless of density", () => {
    for (const id of DENSITY_IDS) {
      expect(resolveDensityMargin(id, "")).toBe("");
    }
  });

  it("every density resolves to a distinct, trusted fixed class, never a computed value", () => {
    const results = DENSITY_IDS.map((id) => resolveDensityMargin(id, "mt-12"));
    expect(new Set(results).size).toBe(DENSITY_IDS.length);
    for (const r of results) expect(r).toMatch(/^mt-\d+$/);
  });
});

describe("palette registry (theme.ts)", () => {
  it("isKnownPaletteId rejects an unregistered value", () => {
    expect(isKnownPaletteId("not-a-real-id")).toBe(false);
    expect(isKnownPaletteId("gold")).toBe(true);
  });
});
