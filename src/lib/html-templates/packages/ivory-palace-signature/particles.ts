/**
 * Trusted, code-authored particle presets for Ivory Palace's petal-
 * drift and sparkle-pulse motion — same non-negotiable boundary as
 * ../timeless-editorial-v2/particles.ts: every numeric value here is
 * authored in code, never derived from composition/client data, and
 * only ever emitted as bounded `<style>`-safe custom-property values
 * by render.ts. Counts and opacity/timing ranges are taken directly
 * from assets/source-spec/MOTION-SPEC.md ("Petals: 7–12s, 3–7 visible,
 * 0.25–0.6 opacity"; "Sparkles: 2.5–5s, ≤5 points, ≤0.2 opacity") —
 * per-scene instance lists below stay inside those caps.
 *
 * Sprite sheets: shared/particles/IP-SHARED-PETALS-001.png (petals)
 * and shared/lighting/IP-SHARED-LIGHT-001.png (sparkles) are both
 * 1536x1024 — the petal sheet uses the exact 6-col x 4-row x 256px-
 * cell grid ART-DIRECTION.md describes as the drop-in, palette-
 * specific replacement for timeless-editorial-v2's petal sheet, so the
 * crop math in render.ts is identical to that package's. The light
 * sheet is a 4-col x 3-row grid of individual warm glow/sparkle
 * clusters on a transparent field (12 cells, 384 x 341.33px each).
 */

export interface PetalSpriteCell {
  col: number; // 0-5
  row: number; // 0-3
}

export interface PetalInstance {
  sprite: PetalSpriteCell;
  leftPercent: number;
  durationSeconds: number;
  delaySeconds: number;
  windDriftPx: number;
  rotationDeg: number;
  sizePx: number;
  opacityPeak: number;
}

/** 6 petals per scene: within the 3–7 "visible at once" MOTION-SPEC cap. */
export const PETAL_INSTANCES: PetalInstance[] = [
  { sprite: { col: 0, row: 0 }, leftPercent: 10, durationSeconds: 11, delaySeconds: -2, windDriftPx: 0, rotationDeg: 130, sizePx: 26, opacityPeak: 0.55 },
  { sprite: { col: 2, row: 0 }, leftPercent: 30, durationSeconds: 9, delaySeconds: -5, windDriftPx: 30, rotationDeg: -150, sizePx: 22, opacityPeak: 0.4 },
  { sprite: { col: 4, row: 1 }, leftPercent: 52, durationSeconds: 12, delaySeconds: -7, windDriftPx: 0, rotationDeg: 170, sizePx: 30, opacityPeak: 0.6 },
  { sprite: { col: 1, row: 2 }, leftPercent: 68, durationSeconds: 10, delaySeconds: -3, windDriftPx: -25, rotationDeg: -110, sizePx: 24, opacityPeak: 0.35 },
  { sprite: { col: 3, row: 3 }, leftPercent: 82, durationSeconds: 8, delaySeconds: -6, windDriftPx: 0, rotationDeg: 200, sizePx: 20, opacityPeak: 0.5 },
  { sprite: { col: 5, row: 2 }, leftPercent: 92, durationSeconds: 11, delaySeconds: -1, windDriftPx: 0, rotationDeg: -180, sizePx: 28, opacityPeak: 0.45 },
];

export const PETAL_SHEET_COLS = 6;
export const PETAL_SHEET_ROWS = 4;
export const PETAL_CELL_PX = 256;

export interface SparkleInstance {
  cellIndex: number; // 0-11, row-major over the 4x3 grid
  leftPercent: number;
  topPercent: number;
  delaySeconds: number;
  cycleSeconds: number;
  sizePx: number;
}

/** 5 sparkles per scene: at the MOTION-SPEC "≤5 points" ceiling. */
export const SPARKLE_INSTANCES: SparkleInstance[] = [
  { cellIndex: 1, leftPercent: 16, topPercent: 14, delaySeconds: -1.2, cycleSeconds: 4.2, sizePx: 22 },
  { cellIndex: 5, leftPercent: 78, topPercent: 20, delaySeconds: -2.6, cycleSeconds: 3.6, sizePx: 18 },
  { cellIndex: 8, leftPercent: 30, topPercent: 62, delaySeconds: -0.6, cycleSeconds: 4.8, sizePx: 24 },
  { cellIndex: 2, leftPercent: 60, topPercent: 55, delaySeconds: -3.4, cycleSeconds: 3.9, sizePx: 16 },
  { cellIndex: 10, leftPercent: 88, topPercent: 70, delaySeconds: -1.8, cycleSeconds: 4.5, sizePx: 20 },
];

export const SPARKLE_SHEET_COLS = 4;
export const SPARKLE_SHEET_ROWS = 3;
export const SPARKLE_SHEET_W = 1536;
export const SPARKLE_SHEET_H = 1024;
