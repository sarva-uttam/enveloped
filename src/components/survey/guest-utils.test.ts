import { describe, it, expect } from "vitest";
import {
  parseGuestNamesText,
  guestRowsValid,
  nonEmptyGuestCount,
  guestRowsToNamesString,
  buildGuestEntries,
  makeEmptyRow,
} from "./guest-utils";

describe("parseGuestNamesText — the paste-multiple parser", () => {
  it("splits on newlines and commas, trimming and dropping empties", () => {
    expect(parseGuestNamesText("Aria Thompson\nRohan Mehta, The Alvarez Family\n\n")).toEqual([
      "Aria Thompson",
      "Rohan Mehta",
      "The Alvarez Family",
    ]);
  });

  it("returns an empty array for blank/whitespace-only input", () => {
    expect(parseGuestNamesText("   \n  \n")).toEqual([]);
  });
});

describe("guestRowsValid / nonEmptyGuestCount", () => {
  it("counts only rows with a non-blank name", () => {
    const rows = [
      { id: "1", name: "Aria" },
      { id: "2", name: "   " },
      { id: "3", name: "" },
      { id: "4", name: "Rohan" },
    ];
    expect(nonEmptyGuestCount(rows)).toBe(2);
    expect(guestRowsValid(rows)).toBe(true);
  });

  it("an all-empty guest list is invalid", () => {
    const rows = [makeEmptyRow(), makeEmptyRow()];
    expect(guestRowsValid(rows)).toBe(false);
    expect(nonEmptyGuestCount(rows)).toBe(0);
  });

  it("an empty array is invalid", () => {
    expect(guestRowsValid([])).toBe(false);
  });
});

describe("guestRowsToNamesString — serializes into the existing SurveyAnswers.guestNames contract", () => {
  it("joins non-blank names with newlines, matching the format the old textarea produced", () => {
    const rows = [
      { id: "1", name: "Aria Thompson" },
      { id: "2", name: "" },
      { id: "3", name: "Rohan Mehta" },
    ];
    expect(guestRowsToNamesString(rows)).toBe("Aria Thompson\nRohan Mehta");
  });
});

describe("buildGuestEntries — the form-boundary adapter to GuestEntry[]/invite_guests", () => {
  it("produces one GuestEntry per non-blank row, with name/slug/id/viewed/clickTeaser present", () => {
    const rows = [
      { id: "r1", name: "Aria Thompson" },
      { id: "r2", name: "Rohan Mehta" },
    ];
    const entries = buildGuestEntries(rows);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.name).toBeTruthy();
      expect(entry.slug).toBeTruthy();
      expect(entry.id).toBeTruthy();
      expect(entry.viewed).toBe(false);
      expect(typeof entry.clickTeaser).toBe("string");
    }
  });

  it("drops blank rows entirely rather than submitting empty guest names", () => {
    const rows = [{ id: "r1", name: "Aria" }, { id: "r2", name: "   " }];
    expect(buildGuestEntries(rows)).toHaveLength(1);
  });

  it("gives two guests who share a name distinct, non-colliding slugs — the Stage 11 collision fix", () => {
    const rows = [
      { id: "r1", name: "Aria Thompson" },
      { id: "r2", name: "Aria Thompson" },
      { id: "r3", name: "Aria Thompson" },
    ];
    const entries = buildGuestEntries(rows);
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // Each slug embeds its row's position, guaranteeing uniqueness within
    // this submission regardless of the random suffix (see this file's
    // own comment on the (invite_id, slug) unique constraint).
    expect(entries[0].slug).toContain("-0-");
    expect(entries[1].slug).toContain("-1-");
    expect(entries[2].slug).toContain("-2-");
  });

  it("an empty input produces an empty GuestEntry[] (non-Platinum tiers submit no guests)", () => {
    expect(buildGuestEntries([])).toEqual([]);
  });
});
