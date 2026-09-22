import { describe, expect, it } from "vitest";
import {
  clamp01,
  computeLocalProgress,
  cumulativeScaleAtStateStart,
  worldPlateScale,
  finaleScale,
  textOpacity,
  twoPhaseOpacity,
  haldiLayerOpacity,
  haldiLayerParallaxPx,
  concealmentFrame,
  STATE_SCALE_MULTIPLIER,
} from "./motion";

describe("clamp01", () => {
  it("clamps to [0,1] and treats NaN as 0", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });
});

describe("computeLocalProgress", () => {
  it("is 0 when the section has not started scrolling (top at or below viewport top)", () => {
    expect(computeLocalProgress(0, 1000)).toBe(0);
    expect(computeLocalProgress(200, 1000)).toBe(0);
  });

  it("is 1 once the section has fully scrolled past (top <= -scrollable)", () => {
    expect(computeLocalProgress(-1000, 1000)).toBe(1);
    expect(computeLocalProgress(-1500, 1000)).toBe(1);
  });

  it("interpolates linearly in between and reverses cleanly (monotonic in -top)", () => {
    const quarter = computeLocalProgress(-250, 1000);
    const half = computeLocalProgress(-500, 1000);
    const threeQuarter = computeLocalProgress(-750, 1000);
    expect(quarter).toBeCloseTo(0.25);
    expect(half).toBeCloseTo(0.5);
    expect(threeQuarter).toBeCloseTo(0.75);
    expect(quarter).toBeLessThan(half);
    expect(half).toBeLessThan(threeQuarter);
  });

  it("never divides by zero for a section shorter than the viewport", () => {
    expect(() => computeLocalProgress(-10, 0)).not.toThrow();
    expect(computeLocalProgress(-10, 0)).toBe(1);
  });
});

describe("cumulativeScaleAtStateStart", () => {
  it("is 1.0 at state 0 (no prior multipliers applied)", () => {
    expect(cumulativeScaleAtStateStart(0)).toBe(1.0);
  });

  it("multiplies each prior state's budget in sequence, never exceeding a single state's own 1.15x cap per hop", () => {
    expect(cumulativeScaleAtStateStart(1)).toBeCloseTo(1.1);
    expect(cumulativeScaleAtStateStart(2)).toBeCloseTo(1.1 * 1.1);
    expect(cumulativeScaleAtStateStart(3)).toBeCloseTo(1.1 * 1.1 * 1.15);
    for (const mult of Object.values(STATE_SCALE_MULTIPLIER)) {
      expect(mult).toBeLessThanOrEqual(1.15);
    }
  });
});

describe("worldPlateScale", () => {
  it("holds the state's start scale through settle/text-in/hold/text-out (0 to 62%)", () => {
    const start = cumulativeScaleAtStateStart(1);
    expect(worldPlateScale(1, 0)).toBeCloseTo(start);
    expect(worldPlateScale(1, 0.3)).toBeCloseTo(start);
    expect(worldPlateScale(1, 0.62)).toBeCloseTo(start);
  });

  it("ramps monotonically from start to end scale during the push phase (62%-90%)", () => {
    const at62 = worldPlateScale(2, 0.62);
    const at75 = worldPlateScale(2, 0.75);
    const at90 = worldPlateScale(2, 0.9);
    expect(at62).toBeLessThan(at75);
    expect(at75).toBeLessThan(at90);
  });

  it("holds the end scale from 90% onward (no overshoot past the state's own budget)", () => {
    const end = cumulativeScaleAtStateStart(3) * STATE_SCALE_MULTIPLIER[3];
    expect(worldPlateScale(3, 0.9)).toBeCloseTo(end);
    expect(worldPlateScale(3, 1)).toBeCloseTo(end);
  });

  it("is a pure function of (state, progress) — same inputs, same output, no hidden state", () => {
    expect(worldPlateScale(2, 0.5)).toBe(worldPlateScale(2, 0.5));
  });
});

describe("finaleScale", () => {
  it("restarts at 1.00 regardless of how far states 0-3 had scaled (fresh image)", () => {
    expect(finaleScale(0)).toBe(1.0);
  });
  it("reaches at most 1.06", () => {
    expect(finaleScale(1)).toBeCloseTo(1.06);
    expect(finaleScale(2)).toBeCloseTo(1.06);
  });
});

describe("textOpacity", () => {
  it("is 0 at the very start and end of a state (settle / after text-out)", () => {
    expect(textOpacity(0)).toBe(0);
    expect(textOpacity(1)).toBe(0);
  });
  it("reaches full opacity during the hold window", () => {
    expect(textOpacity(0.3)).toBe(1);
    expect(textOpacity(0.5)).toBe(1);
  });
  it("ramps smoothly in and out rather than snapping", () => {
    const early = textOpacity(0.15);
    const later = textOpacity(0.18);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
    expect(later).toBeGreaterThan(early);
  });
});

describe("twoPhaseOpacity", () => {
  it("never shows both phases at a meaningfully visible opacity simultaneously", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      const { phaseA, phaseB } = twoPhaseOpacity(p);
      expect(Math.min(phaseA, phaseB)).toBeLessThan(0.5);
    }
  });
  it("shows phase A during the first part of the hold and phase B during the second", () => {
    const early = twoPhaseOpacity(0.25);
    const late = twoPhaseOpacity(0.45);
    expect(early.phaseA).toBeGreaterThan(early.phaseB);
    expect(late.phaseB).toBeGreaterThan(late.phaseA);
  });
});

describe("haldiLayerOpacity", () => {
  it("starts and ends at 0 (no abrupt disappearance — it fades, never cuts)", () => {
    expect(haldiLayerOpacity(0)).toBe(0);
    expect(haldiLayerOpacity(1)).toBe(0);
  });
  it("is fully visible for a sustained middle window", () => {
    expect(haldiLayerOpacity(0.5)).toBe(1);
    expect(haldiLayerOpacity(0.7)).toBe(1);
  });
  it("exits before the state's switch point (90%), never lingering into the next state", () => {
    expect(haldiLayerOpacity(0.92)).toBe(0);
  });
});

describe("haldiLayerParallaxPx", () => {
  it("moves monotonically further as progress increases (distinct parallax rate from the world plate)", () => {
    const a = haldiLayerParallaxPx(0.2, 1080);
    const b = haldiLayerParallaxPx(0.6, 1080);
    const c = haldiLayerParallaxPx(1.0, 1080);
    expect(Math.abs(a)).toBeLessThan(Math.abs(b));
    expect(Math.abs(b)).toBeLessThan(Math.abs(c));
  });
});

describe("concealmentFrame", () => {
  const treatments = ["A", "B", "C"] as const;

  it("never leaves an empty/undefined state — every treatment returns a full frame at every progress", () => {
    for (const t of treatments) {
      for (let p = 0; p <= 1; p += 0.1) {
        const frame = concealmentFrame(t, p);
        expect(frame).toHaveProperty("backgroundSwapped");
        expect(typeof frame.backgroundSwapped).toBe("boolean");
      }
    }
  });

  it("Treatment A reaches near-full occluder opacity before the background swap flag flips true", () => {
    const preSwap = concealmentFrame("A", 0.3);
    const atSwap = concealmentFrame("A", 0.55);
    expect(preSwap.backgroundSwapped).toBe(false);
    expect(atSwap.occluderOpacity).toBeGreaterThan(0.8);
  });

  it("Treatment B fully closes the curtains (offset 0) before swapping the background", () => {
    const atClose = concealmentFrame("B", 0.5);
    expect(atClose.curtainOffsetPercent).toBe(0);
    expect(atClose.backgroundSwapped).toBe(true);
  });

  it("Treatment C's bloom never reaches full opacity (restrained — never a white flash)", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(concealmentFrame("C", p).bloomOpacity).toBeLessThanOrEqual(0.72);
    }
  });

  it("background only swaps once concealment is substantially underway for every treatment (no blank-rectangle reveal at p=0)", () => {
    for (const t of treatments) {
      expect(concealmentFrame(t, 0).backgroundSwapped).toBe(false);
    }
  });
});
