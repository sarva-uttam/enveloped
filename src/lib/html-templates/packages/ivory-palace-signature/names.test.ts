import { describe, expect, it } from "vitest";
import { chooseDesktopNameFormat, estimateInlineNamesWidthPx } from "./names";

// Mirrors the constants render.ts checks against.
const SAFE_WIDTH_PX = 620;
const MAX_FONT_PX = 72;

describe("chooseDesktopNameFormat", () => {
  it("keeps short names on one line", () => {
    expect(chooseDesktopNameFormat("Jo", "Al", SAFE_WIDTH_PX, MAX_FONT_PX)).toBe("inline");
  });

  it("chooses the format consistent with the raw width estimate", () => {
    const format = chooseDesktopNameFormat("Sarvesh", "Shakshina", SAFE_WIDTH_PX, MAX_FONT_PX);
    const estimate = estimateInlineNamesWidthPx("Sarvesh", "Shakshina", MAX_FONT_PX);
    expect(format).toBe(estimate <= SAFE_WIDTH_PX ? "inline" : "stacked");
  });

  it("switches long full names safely to the stacked format", () => {
    const format = chooseDesktopNameFormat(
      "Sarveshkumar Ramgoolam-Appadoo",
      "Shakshina Devi Ramnarain-Beeharry",
      SAFE_WIDTH_PX,
      MAX_FONT_PX,
    );
    expect(format).toBe("stacked");
  });

  it("never underestimates width (safety margin biases toward stacked)", () => {
    const raw = "Alexandria & Maximilian".length * 0.4 * MAX_FONT_PX; // naive estimate, no margin
    const biased = estimateInlineNamesWidthPx("Alexandria", "Maximilian", MAX_FONT_PX);
    expect(biased).toBeGreaterThan(raw);
  });
});
