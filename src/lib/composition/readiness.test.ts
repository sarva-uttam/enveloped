import { describe, it, expect } from "vitest";
import { assessPublicationReadiness } from "./readiness";
import { COMPOSITION_SCHEMA_VERSION } from "./schema";

function baseComposition(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "neutral-classic" },
    featureConfig: { motion: true, ambientMotif: "none", openingBurst: false, envelopeOpening: true },
    sections: [
      { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Ana & Ravi" } },
      {
        id: "date-time",
        type: "dateTime",
        enabled: true,
        motionPreset: "fade",
        data: { eventDate: "2027-06-01T18:00:00" },
      },
      { id: "venue", type: "venue", enabled: true, motionPreset: "fade", data: { name: "The Grand Hall" } },
      { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you there!" } },
    ],
    ...overrides,
  };
}

describe("assessPublicationReadiness", () => {
  it("a fully real, complete composition has no blocking issues", () => {
    const report = assessPublicationReadiness(baseComposition());
    expect(report.blocking).toEqual([]);
  });

  it("an invalid composition (fails schema) reports exactly one blocking issue and nothing else", () => {
    const report = assessPublicationReadiness({ garbage: true });
    expect(report.blocking).toHaveLength(1);
    expect(report.blocking[0].id).toBe("schema");
    expect(report.warnings).toEqual([]);
    expect(report.passed).toEqual([]);
  });

  it("flags a disabled/missing opening section as blocking (a headline the schema itself would reject, like an empty string, is caught earlier as a schema failure)", () => {
    const composition = baseComposition();
    (composition.sections as { enabled: boolean }[])[0].enabled = false;
    const report = assessPublicationReadiness(composition);
    expect(report.blocking.some((i) => i.id === "headline")).toBe(true);
  });

  it("flags unresolved pack placeholder text as blocking, naming the affected section type", () => {
    const composition = baseComposition({
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "You're Invited" } },
        { id: "welcome", type: "welcome", enabled: true, motionPreset: "fade", data: { message: "We would be honored to have you join us." } },
        { id: "date-time", type: "dateTime", enabled: true, motionPreset: "fade", data: { eventDate: "2027-06-01T18:00:00" } },
        { id: "venue", type: "venue", enabled: true, motionPreset: "fade", data: { name: "TBD" } },
        { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "We can't wait to celebrate with you." } },
      ],
    });
    const report = assessPublicationReadiness(composition);
    const placeholderIssue = report.blocking.find((i) => i.id === "placeholders");
    expect(placeholderIssue).toBeDefined();
    expect(placeholderIssue!.message).toContain("opening");
    expect(placeholderIssue!.message).toContain("welcome");
    expect(placeholderIssue!.message).toContain("closing");
  });

  it("detects a placeholder nested inside an array (schedule entries, gallery alt text)", () => {
    const composition = baseComposition({
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Ana & Ravi" } },
        {
          id: "schedule",
          type: "schedule",
          enabled: true,
          motionPreset: "fade",
          data: { entries: [{ id: "e1", eventTypeId: null, label: "Ceremony", value: "To be confirmed" }] },
        },
        { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you there!" } },
      ],
    });
    const report = assessPublicationReadiness(composition);
    expect(report.blocking.find((i) => i.id === "placeholders")?.message).toContain("schedule");
  });

  it("a wedding category with no dateTime section is blocking; a non-wedding category is only a warning", () => {
    const wedding = baseComposition({
      eventCategory: "wedding-hindu",
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Ana & Ravi" } },
        { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you there!" } },
      ],
    });
    expect(assessPublicationReadiness(wedding).blocking.some((i) => i.id === "date")).toBe(true);

    const nonWedding = baseComposition({
      eventCategory: "birthday",
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Turning 30!" } },
        { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you there!" } },
      ],
    });
    const nonWeddingReport = assessPublicationReadiness(nonWedding);
    expect(nonWeddingReport.blocking.some((i) => i.id === "date")).toBe(false);
    expect(nonWeddingReport.warnings.some((i) => i.id === "date")).toBe(true);
  });

  it("music with a src but no credit is a warning, not blocking", () => {
    const composition = baseComposition({
      sections: [
        ...baseComposition().sections,
        { id: "music", type: "music", enabled: true, motionPreset: "none", data: { src: "https://example.com/song.mp3", title: "Our song", credit: null, loop: false, startVolume: 0.5 } },
      ],
    });
    const report = assessPublicationReadiness(composition);
    expect(report.warnings.some((i) => i.id === "music-credit")).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("flags a private-field leak into the composition as blocking when request fields are supplied", () => {
    const composition = baseComposition({
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Contact us at leaked@example.com for details" } },
        { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "See you there!" } },
      ],
    });
    const report = assessPublicationReadiness(composition, { email: "leaked@example.com", phone: null, notes: null, internalNotes: null });
    expect(report.blocking.some((i) => i.id === "private-leak")).toBe(true);
  });

  it("passes the private-leak check cleanly when nothing private appears in the composition", () => {
    const report = assessPublicationReadiness(baseComposition(), {
      email: "client@example.com",
      phone: "+1 555 0100",
      notes: "Wants a Saturday wedding.",
      internalNotes: "Difficult client, be patient.",
    });
    expect(report.blocking.some((i) => i.id === "private-leak")).toBe(false);
    expect(report.passed.some((i) => i.id === "private-leak")).toBe(true);
  });

  it("does not run the private-leak check at all when no request fields are supplied", () => {
    const report = assessPublicationReadiness(baseComposition());
    expect(report.blocking.some((i) => i.id === "private-leak")).toBe(false);
    expect(report.passed.some((i) => i.id === "private-leak")).toBe(false);
  });
});
