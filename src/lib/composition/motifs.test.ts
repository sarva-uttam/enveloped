import { describe, it, expect } from "vitest";
import { DECORATIVE_MOTIF_IDS, isKnownDecorativeMotifId, legacyMotifForPack } from "./motifs";

describe("decorative-motif registry", () => {
  it("isKnownDecorativeMotifId rejects an unregistered value", () => {
    expect(isKnownDecorativeMotifId("not-a-real-id")).toBe(false);
    expect(isKnownDecorativeMotifId("marigold-drift")).toBe(true);
  });

  it("every id has a non-empty label and description", () => {
    for (const id of DECORATIVE_MOTIF_IDS) {
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("legacyMotifForPack() matches AtmosphericEffect's original pre-Stage-12 branch exactly", () => {
    expect(legacyMotifForPack("hindu-wedding")).toBe("marigold-drift");
    expect(legacyMotifForPack("neutral-classic")).toBe("soft-glow");
    expect(legacyMotifForPack("anything-else")).toBe("soft-glow");
  });
});
