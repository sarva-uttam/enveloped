import { describe, it, expect } from "vitest";
import { adaptLegacyContentToComposition } from "./legacy-adapter";
import { InvitationCompositionSchema } from "./schema";
import type { InviteViewModel } from "../invite-view-model";
import type { GeneratedInviteContent } from "../types";

/**
 * Stage 6 (see PROJECT_STATUS.md's Stage 6 section, Part F/I) — proving
 * the legacy adapter maps every field correctly, always produces a
 * schema-valid composition, and fails safely rather than crashing.
 */

const CONTENT: GeneratedInviteContent = {
  headline: "Priya & Devansh",
  subheadline: "Together with their families",
  welcomeMessage: "We can't wait to celebrate with you",
  eventDetails: [
    { label: "Venue", value: "The Garden Hall" },
    { label: "City", value: "Jaipur" },
  ],
  closingLine: "With love, Priya & Devansh",
  suggestedPalette: ["#b8862f", "#f8ecd2"],
};

function model(overrides: Partial<InviteViewModel> = {}): InviteViewModel {
  return {
    inviteId: "priya-devansh",
    guestId: undefined,
    guestName: undefined,
    tier: "gold",
    content: CONTENT,
    eventDate: "2027-01-01T18:00:00Z",
    song: "Perfect",
    isDemo: false,
    isPublished: true,
    ...overrides,
  };
}

describe("adaptLegacyContentToComposition — mapping", () => {
  it("always produces a schema-valid composition", () => {
    const composition = adaptLegacyContentToComposition(model());
    expect(composition).not.toBeNull();
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
  });

  it("maps headline/subheadline into the opening section", () => {
    const composition = adaptLegacyContentToComposition(model())!;
    const opening = composition.sections.find((s) => s.type === "opening");
    expect(opening).toBeDefined();
    expect(opening!.type === "opening" && opening!.data.headline).toBe("Priya & Devansh");
    expect(opening!.type === "opening" && opening!.data.subheadline).toBe("Together with their families");
  });

  it("adds a greeting section only when guestName is resolved", () => {
    const withGuest = adaptLegacyContentToComposition(model({ guestName: "Aria" }))!;
    expect(withGuest.sections.some((s) => s.type === "greeting")).toBe(true);

    const withoutGuest = adaptLegacyContentToComposition(model({ guestName: undefined }))!;
    expect(withoutGuest.sections.some((s) => s.type === "greeting")).toBe(false);
  });

  it("maps welcomeMessage into the welcome section, always present", () => {
    const composition = adaptLegacyContentToComposition(model())!;
    const welcome = composition.sections.find((s) => s.type === "welcome");
    expect(welcome!.type === "welcome" && welcome!.data.message).toBe("We can't wait to celebrate with you");
  });

  it("adds a dateTime section only when eventDate is set AND tier is not bronze — matching the exact pre-Stage-6 condition", () => {
    const goldWithDate = adaptLegacyContentToComposition(model({ tier: "gold", eventDate: "2027-01-01T18:00:00Z" }))!;
    expect(goldWithDate.sections.some((s) => s.type === "dateTime")).toBe(true);

    const bronzeWithDate = adaptLegacyContentToComposition(model({ tier: "bronze", eventDate: "2027-01-01T18:00:00Z" }))!;
    expect(bronzeWithDate.sections.some((s) => s.type === "dateTime")).toBe(false);

    const goldNoDate = adaptLegacyContentToComposition(model({ tier: "gold", eventDate: undefined }))!;
    expect(goldNoDate.sections.some((s) => s.type === "dateTime")).toBe(false);
  });

  it("maps eventDetails into the schedule section unconditionally, in order", () => {
    const composition = adaptLegacyContentToComposition(model())!;
    const schedule = composition.sections.find((s) => s.type === "schedule");
    expect(schedule!.type === "schedule" && schedule!.data.entries.map((e) => e.label)).toEqual(["Venue", "City"]);
    expect(schedule!.type === "schedule" && schedule!.data.entries.map((e) => e.value)).toEqual(["The Garden Hall", "Jaipur"]);
  });

  it("adds a gallery section (from suggestedPalette) only for gold/platinum", () => {
    for (const tier of ["gold", "platinum"] as const) {
      expect(adaptLegacyContentToComposition(model({ tier }))!.sections.some((s) => s.type === "gallery")).toBe(true);
    }
    for (const tier of ["bronze", "silver"] as const) {
      expect(adaptLegacyContentToComposition(model({ tier }))!.sections.some((s) => s.type === "gallery")).toBe(false);
    }
  });

  it("adds an rsvp section only when tier !== bronze AND isPublished — Stage 5's RSVP restriction flows through", () => {
    expect(adaptLegacyContentToComposition(model({ tier: "gold", isPublished: true }))!.sections.some((s) => s.type === "rsvp")).toBe(
      true
    );
    expect(adaptLegacyContentToComposition(model({ tier: "gold", isPublished: false }))!.sections.some((s) => s.type === "rsvp")).toBe(
      false
    );
    expect(adaptLegacyContentToComposition(model({ tier: "bronze", isPublished: true }))!.sections.some((s) => s.type === "rsvp")).toBe(
      false
    );
  });

  it("adds a music section (from song) only for gold/platinum", () => {
    expect(adaptLegacyContentToComposition(model({ tier: "gold", song: "Perfect" }))!.sections.some((s) => s.type === "music")).toBe(
      true
    );
    expect(adaptLegacyContentToComposition(model({ tier: "silver", song: "Perfect" }))!.sections.some((s) => s.type === "music")).toBe(
      false
    );
  });

  it("maps closingLine into the closing section, always present", () => {
    const composition = adaptLegacyContentToComposition(model())!;
    const closing = composition.sections.find((s) => s.type === "closing");
    expect(closing!.type === "closing" && closing!.data.message).toBe("With love, Priya & Devansh");
  });

  it("never produces intro/story/venue/mapLink/dressCode/customText sections — no legacy field maps to them", () => {
    const composition = adaptLegacyContentToComposition(model({ tier: "platinum", guestName: "Aria" }))!;
    const producedTypes = new Set(composition.sections.map((s) => s.type));
    for (const neverProduced of ["intro", "story", "venue", "mapLink", "dressCode", "customText"]) {
      expect(producedTypes.has(neverProduced as never)).toBe(false);
    }
  });

  it("sets isPublished/featureConfig from tier the same way the pre-Stage-6 hasMotion/isPlatinum checks did", () => {
    const bronze = adaptLegacyContentToComposition(model({ tier: "bronze" }))!;
    expect(bronze.featureConfig.motion).toBe(false);
    expect(bronze.featureConfig.openingBurst).toBe(false);
    expect(bronze.featureConfig.ambientMotif).toBe("none");

    const platinum = adaptLegacyContentToComposition(model({ tier: "platinum" }))!;
    expect(platinum.featureConfig.motion).toBe(true);
    expect(platinum.featureConfig.openingBurst).toBe(true);
    expect(platinum.featureConfig.ambientMotif).toBe("full");

    const gold = adaptLegacyContentToComposition(model({ tier: "gold" }))!;
    expect(gold.featureConfig.openingBurst).toBe(false);
    expect(gold.featureConfig.ambientMotif).toBe("light");
  });
});

describe("adaptLegacyContentToComposition — fails safely on malformed input", () => {
  it("returns null rather than throwing when content has fields that would break the schema's limits (defensive, not an expected real-world path)", () => {
    const brokenModel = model({
      content: { ...CONTENT, headline: "a".repeat(10_000) },
    });
    expect(() => adaptLegacyContentToComposition(brokenModel)).not.toThrow();
    expect(adaptLegacyContentToComposition(brokenModel)).toBeNull();
  });

  it("returns null (not a partial/unsafe object) when eventDetails would exceed the schedule limit", () => {
    const brokenModel = model({
      content: {
        ...CONTENT,
        eventDetails: Array.from({ length: 50 }, (_, i) => ({ label: `Item ${i}`, value: "x" })),
      },
    });
    expect(adaptLegacyContentToComposition(brokenModel)).toBeNull();
  });
});
