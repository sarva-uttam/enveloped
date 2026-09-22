import { describe, expect, it } from "vitest";
import { IvoryPalaceDataSchema } from "./schema";
import { IVORY_PALACE_FIXTURE } from "./fixture";

describe("IvoryPalaceDataSchema", () => {
  it("accepts the representative fixture", () => {
    const result = IvoryPalaceDataSchema.safeParse(IVORY_PALACE_FIXTURE);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field (strict schema)", () => {
    const result = IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, customHtml: "<div>injected</div>" });
    expect(result.success).toBe(false);
  });

  it("rejects raw angle brackets in a text field", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      coupleName1: "<img src=x onerror=alert(1)>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: RSVP URL", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      response: { ...IVORY_PALACE_FIXTURE.response, url: "javascript:alert(1)" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a data: map URL", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      venue: { ...IVORY_PALACE_FIXTURE.venue, mapUrl: "data:text/html,<script>alert(1)</script>" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a <script>-bearing response heading", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      response: { ...IVORY_PALACE_FIXTURE.response, heading: "<script>alert(1)</script>" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts composition data with no response section (RSVP disabled)", () => {
    const result = IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, response: undefined });
    expect(result.success).toBe(true);
  });

  it("accepts composition data with an empty gallery (0 photos)", () => {
    const result = IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, gallery: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a gallery with more than 6 photos", () => {
    const sevenPhotos = Array.from({ length: 7 }, (_, i) => ({
      url: `https://images.example.com/gallery/photo-${i}.jpg`,
      alt: `Photo ${i}`,
    }));
    const result = IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, gallery: sevenPhotos });
    expect(result.success).toBe(false);
  });

  it("accepts composition data with only the required wedding ceremony (all others omitted)", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      ceremonies: { wedding: IVORY_PALACE_FIXTURE.ceremonies.wedding },
    });
    expect(result.success).toBe(true);
  });

  it("rejects composition data missing the required wedding ceremony", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      ceremonies: { haldi: IVORY_PALACE_FIXTURE.ceremonies.haldi },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a formal invitation with more than 9 body lines", () => {
    const result = IvoryPalaceDataSchema.safeParse({
      ...IVORY_PALACE_FIXTURE,
      formalInvitation: {
        headline: "Together with their families",
        bodyLines: Array.from({ length: 10 }, (_, i) => `Line ${i}`),
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts https and http URLs, rejects ftp", () => {
    expect(
      IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, venue: { ...IVORY_PALACE_FIXTURE.venue, mapUrl: "http://example.com/map" } })
        .success,
    ).toBe(true);
    expect(
      IvoryPalaceDataSchema.safeParse({ ...IVORY_PALACE_FIXTURE, venue: { ...IVORY_PALACE_FIXTURE.venue, mapUrl: "ftp://example.com/map" } })
        .success,
    ).toBe(false);
  });
});
