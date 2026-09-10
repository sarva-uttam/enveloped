import { describe, it, expect } from "vitest";
import { CULTURAL_PACKS, CULTURAL_PACK_IDS, isKnownCulturalPackId } from "./cultural-packs";
import { InvitationCompositionSchema, COMPOSITION_SCHEMA_VERSION } from "./schema";
import { buildCompositionFromPack } from "../composition-admin.server";

/**
 * Stage 6 (see PROJECT_STATUS.md's Stage 6 section, Part D/I).
 */

describe("cultural pack registry", () => {
  it("has exactly the two packs this stage defines: neutral-classic and hindu-wedding", () => {
    expect(CULTURAL_PACK_IDS).toEqual(["neutral-classic", "hindu-wedding"]);
    expect(Object.keys(CULTURAL_PACKS).sort()).toEqual(["hindu-wedding", "neutral-classic"]);
  });

  it("isKnownCulturalPackId rejects any future/unregistered id", () => {
    for (const future of ["muslim-wedding", "christian-wedding", "civil-wedding", "mauritian-multicultural", "birthday-classic", "corporate-classic"]) {
      expect(isKnownCulturalPackId(future)).toBe(false);
    }
  });

  it("isKnownCulturalPackId accepts the two registered ids", () => {
    expect(isKnownCulturalPackId("neutral-classic")).toBe(true);
    expect(isKnownCulturalPackId("hindu-wedding")).toBe(true);
  });

  it("every pack's own id field matches its registry key", () => {
    for (const [key, pack] of Object.entries(CULTURAL_PACKS)) {
      expect(pack.id).toBe(key);
    }
  });

  it("every pack declares at least one applicable event category and one supported event type", () => {
    for (const pack of Object.values(CULTURAL_PACKS)) {
      expect(pack.applicableCategories.length).toBeGreaterThan(0);
      expect(pack.supportedEventTypeIds.length).toBeGreaterThan(0);
    }
  });
});

describe("neutral-classic and hindu-wedding defaults are valid compositions", () => {
  it("buildCompositionFromPack('neutral-classic', ...) produces a schema-valid composition", () => {
    const composition = buildCompositionFromPack({ packId: "neutral-classic", eventCategory: "wedding-other" });
    expect(composition).not.toBeNull();
    expect(composition?.schemaVersion).toBe(COMPOSITION_SCHEMA_VERSION);
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
  });

  it("buildCompositionFromPack('hindu-wedding', ...) produces a schema-valid composition", () => {
    const composition = buildCompositionFromPack({
      packId: "hindu-wedding",
      eventCategory: "wedding-hindu",
      occasionId: "mehendi",
    });
    expect(composition).not.toBeNull();
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
    expect(composition?.weddingContext?.occasionId).toBe("mehendi");
    expect(composition?.weddingContext?.culturalPackId).toBe("hindu-wedding");
  });

  it("both defaults include at least an opening and a closing section", () => {
    for (const packId of ["neutral-classic", "hindu-wedding"] as const) {
      const composition = buildCompositionFromPack({ packId, eventCategory: "wedding-other" })!;
      const types = composition.sections.map((s) => s.type);
      expect(types).toContain("opening");
      expect(types).toContain("closing");
    }
  });
});

describe("future pack identifiers cannot be falsely selected before registration", () => {
  it("buildCompositionFromPack() returns null for a future, unregistered pack id", () => {
    for (const future of ["muslim-wedding", "christian-wedding", "civil-wedding", "mauritian-multicultural", "birthday-classic", "corporate-classic"]) {
      expect(buildCompositionFromPack({ packId: future, eventCategory: "wedding-other" })).toBeNull();
    }
  });

  it("buildCompositionFromPack() returns null for a completely made-up id", () => {
    expect(buildCompositionFromPack({ packId: "not-a-real-pack-at-all", eventCategory: "wedding-other" })).toBeNull();
  });
});
