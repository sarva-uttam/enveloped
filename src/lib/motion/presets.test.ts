import { describe, it, expect } from "vitest";
import { MOTION_PRESET_DEFINITIONS, SCHEDULE_STAGGER_INTERVAL } from "./presets";
import { MOTION_PRESETS } from "@/lib/composition/schema";

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part B/I) — the
 * preset REGISTRY and the schema's allowlist must never drift apart,
 * and every definition must be a compositor-friendly transform/opacity
 * animation (never a layout-affecting one).
 */

const TRANSFORM_OR_OPACITY = new Set(["opacity", "y", "x", "scale", "rotate", "rotateX", "rotateY"]);

describe("MOTION_PRESET_DEFINITIONS", () => {
  it("has a definition for exactly the eight schema-allowlisted preset names, nothing more, nothing fewer", () => {
    expect(Object.keys(MOTION_PRESET_DEFINITIONS).sort()).toEqual([...MOTION_PRESETS].sort());
  });

  it("every preset animates only opacity/transform properties — never width/height/top/left/margin/etc.", () => {
    for (const [name, def] of Object.entries(MOTION_PRESET_DEFINITIONS)) {
      for (const key of [...Object.keys(def.initial), ...Object.keys(def.animate)]) {
        expect(TRANSFORM_OR_OPACITY.has(key), `${name} animates non-compositor property "${key}"`).toBe(true);
      }
    }
  });

  it("every preset has a bounded, finite duration", () => {
    for (const [name, def] of Object.entries(MOTION_PRESET_DEFINITIONS)) {
      const d = (def.transition as { duration?: number }).duration ?? 0;
      expect(Number.isFinite(d), name).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(2);
    }
  });

  it("'none' is a genuine no-op — empty initial/animate and zero duration", () => {
    expect(MOTION_PRESET_DEFINITIONS.none.initial).toEqual({});
    expect(MOTION_PRESET_DEFINITIONS.none.animate).toEqual({});
    expect((MOTION_PRESET_DEFINITIONS.none.transition as { duration?: number }).duration).toBe(0);
  });

  it("the schedule stagger interval is a small, fixed constant", () => {
    expect(SCHEDULE_STAGGER_INTERVAL).toBeGreaterThan(0);
    expect(SCHEDULE_STAGGER_INTERVAL).toBeLessThan(0.5);
  });
});
