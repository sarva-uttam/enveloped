import { describe, it, expect } from "vitest";
import { ENVELOPE_TREATMENT_IDS, isKnownEnvelopeTreatmentId } from "./envelope-treatments";

describe("envelope-treatment registry", () => {
  it("isKnownEnvelopeTreatmentId rejects an unregistered value", () => {
    expect(isKnownEnvelopeTreatmentId("not-a-real-id")).toBe(false);
    expect(isKnownEnvelopeTreatmentId("classic")).toBe(true);
  });

  it("includes the pre-Stage-12 default shape", () => {
    expect(ENVELOPE_TREATMENT_IDS).toContain("classic");
  });
});
