/**
 * Trusted, code-authored particle presets for the Timeless Editorial
 * template's petal-drift and sparkle-pulse motion.
 *
 * These values are NOT derived from composition/client data — they are
 * a fixed set baked into the trusted template package, exactly like
 * SECTION_REGISTRY's compile-time component map. This keeps the "no
 * arbitrary CSS from stored data" boundary intact: every numeric value
 * below is authored here, in code, and only ever emitted as bounded
 * `<style>`-safe custom-property values by render.ts.
 */

/** Sprite-sheet cell for one of the 24 petals in petal-sprites.png (1536x1024, 6x4 grid of 256x256 cells). */
export interface PetalSpriteCell {
  col: number; // 0-5
  row: number; // 0-3
}

/** A single petal instance's drift path. All units are CSS-safe numbers. */
export interface PetalInstance {
  sprite: PetalSpriteCell;
  /** Starting horizontal position, percent of viewport width. */
  leftPercent: number;
  /** Fall duration in seconds. */
  durationSeconds: number;
  /** Negative delay so petals are already mid-fall on load, staggered. */
  delaySeconds: number;
  /** Horizontal drift in px applied via a wind keyframe (0 = no wind). */
  windDriftPx: number;
  /** Total rotation in degrees over the fall. */
  rotationDeg: number;
  /** Rendered size in px. */
  sizePx: number;
}

// 12 petals: a bounded set well under the README's 14-concurrent cap,
// leaving headroom rather than running at the hard limit. Varied
// 10-18s durations, a small minority (2 of 12) carry wind drift.
export const PETAL_INSTANCES: PetalInstance[] = [
  { sprite: { col: 0, row: 0 }, leftPercent: 6, durationSeconds: 14, delaySeconds: -2, windDriftPx: 0, rotationDeg: 140, sizePx: 30 },
  { sprite: { col: 4, row: 0 }, leftPercent: 18, durationSeconds: 11, delaySeconds: -6, windDriftPx: 40, rotationDeg: -160, sizePx: 26 },
  { sprite: { col: 2, row: 1 }, leftPercent: 28, durationSeconds: 17, delaySeconds: -9, windDriftPx: 0, rotationDeg: 200, sizePx: 34 },
  { sprite: { col: 5, row: 3 }, leftPercent: 38, durationSeconds: 12, delaySeconds: -1, windDriftPx: 0, rotationDeg: -120, sizePx: 24 },
  { sprite: { col: 1, row: 2 }, leftPercent: 48, durationSeconds: 16, delaySeconds: -11, windDriftPx: -50, rotationDeg: 180, sizePx: 32 },
  { sprite: { col: 3, row: 3 }, leftPercent: 58, durationSeconds: 10, delaySeconds: -4, windDriftPx: 0, rotationDeg: 90, sizePx: 22 },
  { sprite: { col: 0, row: 3 }, leftPercent: 68, durationSeconds: 18, delaySeconds: -13, windDriftPx: 0, rotationDeg: -200, sizePx: 36 },
  { sprite: { col: 4, row: 2 }, leftPercent: 76, durationSeconds: 13, delaySeconds: -7, windDriftPx: 0, rotationDeg: 150, sizePx: 28 },
  { sprite: { col: 2, row: 0 }, leftPercent: 84, durationSeconds: 15, delaySeconds: -3, windDriftPx: 0, rotationDeg: -140, sizePx: 30 },
  { sprite: { col: 1, row: 0 }, leftPercent: 92, durationSeconds: 11, delaySeconds: -8, windDriftPx: 0, rotationDeg: 170, sizePx: 25 },
  { sprite: { col: 5, row: 1 }, leftPercent: 12, durationSeconds: 17, delaySeconds: -15, windDriftPx: 0, rotationDeg: -180, sizePx: 33 },
  { sprite: { col: 3, row: 0 }, leftPercent: 62, durationSeconds: 14, delaySeconds: -5, windDriftPx: 0, rotationDeg: 110, sizePx: 27 },
];

/** Sprite-sheet crop for one of the 6 validated sparkle variants (sparkle-sprites.png, 1254x1254). */
export interface SparkleSpriteCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SPARKLE_SPRITE_VARIANTS: SparkleSpriteCrop[] = [
  { x: 20, y: 60, w: 200, h: 200 }, // star-a
  { x: 640, y: 60, w: 190, h: 190 }, // star-b
  { x: 1080, y: 340, w: 170, h: 170 }, // star-d
  { x: 600, y: 800, w: 200, h: 200 }, // star-f (six-point)
  { x: 850, y: 110, w: 220, h: 220 }, // cluster-a
  { x: 440, y: 100, w: 110, h: 110 }, // dot-a
];

export interface SparkleInstance {
  variantIndex: number;
  leftPercent: number;
  topPercent: number;
  delaySeconds: number;
  cycleSeconds: number;
  sizePx: number;
}

// 16 sparkles: bounded under the README's 18-concurrent cap.
export const SPARKLE_INSTANCES: SparkleInstance[] = [
  { variantIndex: 0, leftPercent: 8, topPercent: 12, delaySeconds: -1, cycleSeconds: 6, sizePx: 18 },
  { variantIndex: 1, leftPercent: 22, topPercent: 28, delaySeconds: -3.4, cycleSeconds: 7, sizePx: 14 },
  { variantIndex: 2, leftPercent: 35, topPercent: 8, delaySeconds: -0.5, cycleSeconds: 5.5, sizePx: 12 },
  { variantIndex: 3, leftPercent: 47, topPercent: 20, delaySeconds: -5.2, cycleSeconds: 8, sizePx: 20 },
  { variantIndex: 4, leftPercent: 60, topPercent: 14, delaySeconds: -2.1, cycleSeconds: 6.5, sizePx: 22 },
  { variantIndex: 5, leftPercent: 72, topPercent: 30, delaySeconds: -4.6, cycleSeconds: 5, sizePx: 10 },
  { variantIndex: 0, leftPercent: 85, topPercent: 10, delaySeconds: -1.8, cycleSeconds: 7.5, sizePx: 16 },
  { variantIndex: 1, leftPercent: 15, topPercent: 45, delaySeconds: -6.1, cycleSeconds: 6, sizePx: 15 },
  { variantIndex: 2, leftPercent: 30, topPercent: 60, delaySeconds: -2.9, cycleSeconds: 5.8, sizePx: 13 },
  { variantIndex: 3, leftPercent: 44, topPercent: 72, delaySeconds: -0.9, cycleSeconds: 7, sizePx: 19 },
  { variantIndex: 4, leftPercent: 56, topPercent: 55, delaySeconds: -3.7, cycleSeconds: 6.2, sizePx: 21 },
  { variantIndex: 5, leftPercent: 68, topPercent: 68, delaySeconds: -5.5, cycleSeconds: 5.3, sizePx: 11 },
  { variantIndex: 0, leftPercent: 80, topPercent: 48, delaySeconds: -1.3, cycleSeconds: 6.8, sizePx: 17 },
  { variantIndex: 1, leftPercent: 92, topPercent: 62, delaySeconds: -4.1, cycleSeconds: 7.2, sizePx: 14 },
  { variantIndex: 2, leftPercent: 10, topPercent: 82, delaySeconds: -2.6, cycleSeconds: 6, sizePx: 12 },
  { variantIndex: 3, leftPercent: 50, topPercent: 88, delaySeconds: -0.2, cycleSeconds: 5.7, sizePx: 18 },
];
