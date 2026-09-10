import { describe, it, expect } from "vitest";
import { EVENT_TYPES, EVENT_TYPE_IDS, isKnownEventTypeId, eventTypeLabel } from "./event-types";

/**
 * Stage 6 (see PROJECT_STATUS.md's Stage 6 section, Part C/I).
 */

describe("event-type vocabulary", () => {
  it("preserves all four original, live occasion values", () => {
    for (const legacy of ["haldi", "sangeet_mehendi", "wedding_day", "reception"]) {
      expect(isKnownEventTypeId(legacy)).toBe(true);
    }
  });

  it("flags sangeet_mehendi and wedding_day as legacy, but haldi and reception as NOT legacy-only", () => {
    const byId = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e]));
    expect(byId.sangeet_mehendi.isLegacy).toBe(true);
    expect(byId.wedding_day.isLegacy).toBe(true);
    expect(byId.haldi.isLegacy).toBe(false);
    expect(byId.reception.isLegacy).toBe(false);
  });

  it("a legacy id is still exactly as valid as any other — isLegacy never affects validity", () => {
    expect(isKnownEventTypeId("sangeet_mehendi")).toBe(true);
    expect(eventTypeLabel("sangeet_mehendi")).toBe("Sangeet & Mehendi");
  });

  it("includes the new, more granular vocabulary", () => {
    for (const id of ["engagement", "mehendi", "sangeet", "civil_ceremony", "religious_ceremony", "nikah", "wedding_ceremony", "dinner", "custom"]) {
      expect(isKnownEventTypeId(id)).toBe(true);
    }
  });

  it("rejects an unregistered id", () => {
    expect(isKnownEventTypeId("cake-cutting-birthday-thing")).toBe(false);
  });

  it("has no duplicate ids", () => {
    expect(new Set(EVENT_TYPE_IDS).size).toBe(EVENT_TYPE_IDS.length);
  });

  it("eventTypeLabel falls back to the raw id for an unknown value (defensive, never throws)", () => {
    expect(eventTypeLabel("not-a-real-id" as never)).toBe("not-a-real-id");
  });
});
