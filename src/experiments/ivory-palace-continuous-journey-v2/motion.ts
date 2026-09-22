/**
 * EXPERIMENTAL — NOT PRODUCTION READY
 *
 * Pure, framework-free motion math for the Continuous Journey
 * scrollymation feasibility prototype. Nothing here touches the DOM —
 * every function takes plain numbers and returns plain numbers/objects
 * so it can be unit-tested without jsdom (this repo's vitest config is
 * `environment: "node"`, matching every other package under
 * src/lib/html-templates/).
 *
 * The runtime `<script>` embedded by render.ts re-implements this same
 * math in plain JS (a generated static HTML document can't import a
 * TS module at request time). The two are kept in sync by hand; see
 * render.ts's RUNTIME_SCRIPT_SOURCE comment for the pairing note.
 *
 * Scale-budget interpretation: SCENE-SPEC's per-state "code scale
 * budget" table (CAMERA-CONTINUITY-PLAN.md) was written assuming each
 * state swaps to a newly-cropped source image at its boundary, so
 * every state's 1.00 baseline is *relative to that state's own crop*.
 * This prototype deliberately uses ONE principal world plate for the
 * whole opening-through-wedding-approach journey (the corrective
 * "no full-frame crossfade" decision), so the per-state multipliers
 * are instead applied cumulatively against one continuous transform
 * origin (50%, 43% — the locked axis point from CANONICAL-WORLD-MAP.md
 * / LANDMARK-REGISTRATION.md) to produce one continuous push-in. This
 * is a deliberate reinterpretation, not an oversight — documented in
 * FEASIBILITY-REPORT.md.
 */

export type JourneyStateId = 0 | 1 | 2 | 3 | 4;

export interface TimingCurve {
  settleEnd: number;
  textInEnd: number;
  holdEnd: number;
  textOutEnd: number;
  pushEnd: number;
  switchEnd: number;
}

/** Shared timing curve for states 0-3, taken verbatim from CAMERA-MOTION-SPEC.md. */
export const TIMING: TimingCurve = {
  settleEnd: 0.12,
  textInEnd: 0.2,
  holdEnd: 0.52,
  textOutEnd: 0.62,
  pushEnd: 0.9,
  switchEnd: 0.94,
};

/** Per-state cumulative scale multiplier applied at that state's push phase (CAMERA-CONTINUITY-PLAN.md). */
export const STATE_SCALE_MULTIPLIER: Record<0 | 1 | 2 | 3, number> = {
  0: 1.1,
  1: 1.1,
  2: 1.15,
  3: 1.1,
};

/** State 4 uses a freshly-swapped image, so its own scale range restarts at 1.00. */
export const STATE4_SCALE_RANGE = { start: 1.0, end: 1.06 };

export const WORLD_TRANSFORM_ORIGIN = { xPercent: 50, yPercent: 43 };

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Local 0-1 progress through a scroll-pinned section, given the
 * section's bounding rect (top measured from the viewport top, and
 * total scrollable height = section content height - viewport height)
 * and the viewport height. Pure geometry — no DOM access.
 */
export function computeLocalProgress(sectionTop: number, scrollableHeight: number): number {
  if (scrollableHeight <= 0) return 1;
  return clamp01(-sectionTop / scrollableHeight);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp01(t);
}

/** Cumulative absolute scale at the START of the given state (before its own push happens). */
export function cumulativeScaleAtStateStart(state: 0 | 1 | 2 | 3): number {
  let scale = 1.0;
  for (let s = 0; s < state; s++) {
    scale *= STATE_SCALE_MULTIPLIER[s as 0 | 1 | 2 | 3];
  }
  return scale;
}

/**
 * Absolute world-plate scale for states 0-3, given the state id and
 * local progress (0-1) through that state. Scale only changes during
 * the "push" phase (62%-90%) per CAMERA-MOTION-SPEC.md's timing
 * curve; it holds flat during settle/text-in/hold/text-out and after
 * the switch point, so the push always reads as one deliberate camera
 * move rather than continuous drift under the text.
 */
export function worldPlateScale(state: 0 | 1 | 2 | 3, localProgress: number): number {
  const p = clamp01(localProgress);
  const start = cumulativeScaleAtStateStart(state);
  const end = start * STATE_SCALE_MULTIPLIER[state];
  if (p <= TIMING.textOutEnd) return start;
  if (p >= TIMING.pushEnd) return end;
  const pushT = (p - TIMING.textOutEnd) / (TIMING.pushEnd - TIMING.textOutEnd);
  return lerp(start, end, pushT);
}

/** State 4's own independent scale range (fresh image, no cumulative carry-over). */
export function finaleScale(localProgress: number): number {
  const p = clamp01(localProgress);
  return lerp(STATE4_SCALE_RANGE.start, STATE4_SCALE_RANGE.end, p);
}

/**
 * Opacity envelope for the primary text block of a state: 0 during
 * settle, ramps in during text-in, holds at 1, ramps out during
 * text-out, 0 after. Used for both text and the swipe/scroll cue.
 */
export function textOpacity(localProgress: number): number {
  const p = clamp01(localProgress);
  if (p < TIMING.settleEnd) return 0;
  if (p < TIMING.textInEnd) return (p - TIMING.settleEnd) / (TIMING.textInEnd - TIMING.settleEnd);
  if (p < TIMING.holdEnd) return 1;
  if (p < TIMING.textOutEnd) return 1 - (p - TIMING.holdEnd) / (TIMING.textOutEnd - TIMING.holdEnd);
  return 0;
}

/**
 * Splits a state's hold window into two non-overlapping phases (used
 * by State 3's blessing/date phases and State 4's closing/controls
 * phases) with a short handoff gap so phase A's exit completes before
 * phase B's entrance starts — the two are never visible together.
 */
export function twoPhaseOpacity(localProgress: number): { phaseA: number; phaseB: number } {
  const p = clamp01(localProgress);
  const { settleEnd, textInEnd, holdEnd, textOutEnd } = TIMING;
  const mid = (textInEnd + holdEnd) / 2;
  const gap = 0.03;
  const aIn = { start: settleEnd, end: textInEnd };
  const aOut = { start: mid - gap, end: mid };
  const bIn = { start: mid, end: mid + gap };
  const bOut = { start: holdEnd, end: textOutEnd };

  const rampIn = (range: { start: number; end: number }) =>
    p < range.start ? 0 : p < range.end ? (p - range.start) / (range.end - range.start) : 1;
  const rampOut = (range: { start: number; end: number }) =>
    p < range.start ? 1 : p < range.end ? 1 - (p - range.start) / (range.end - range.start) : 0;

  const phaseA = p < aOut.start ? rampIn(aIn) : rampOut(aOut);
  const phaseB = p < bIn.start ? 0 : p < bOut.start ? rampIn(bIn) : rampOut(bOut);

  return { phaseA: clamp01(phaseA), phaseB: clamp01(phaseB) };
}

/** Haldi layer entrance/exit envelope — localized to state 2, matched to the world-plate push. */
export function haldiLayerOpacity(localProgress: number): number {
  const p = clamp01(localProgress);
  // Enters gradually during text-in/hold, holds through most of the
  // push, and exits *before* the state switches (never abrupt).
  if (p < 0.15) return 0;
  if (p < 0.3) return (p - 0.15) / 0.15;
  if (p < 0.78) return 1;
  if (p < 0.9) return 1 - (p - 0.78) / 0.12;
  return 0;
}

/** Haldi layer's own translateY (px, at 1080-wide reference), moving slightly faster than the world plate for middle-ground parallax. */
export function haldiLayerParallaxPx(localProgress: number, referenceWidthPx = 1080): number {
  const p = clamp01(localProgress);
  const travel = referenceWidthPx * 0.06; // modest, foreground-faster-than-background per MOTION-SPEC intent
  return -lerp(0, travel, p);
}

export type T04Treatment = "A" | "B" | "C";

export interface ConcealmentFrame {
  occluderOpacity: number;
  occluderScale: number;
  curtainOffsetPercent: number; // 100 = fully off-screen, 0 = fully met at center
  bloomOpacity: number;
  backgroundSwapped: boolean;
}

/**
 * Concealment progress runs across state 3's switch window (90%-94%)
 * plus a short settle into state 4 (treated as a 0-1 window covering
 * state3 local progress 0.85-1.0 and state4 local progress 0-0.12,
 * normalized by the caller). Each treatment returns when full coverage
 * is reached and when the background is allowed to swap underneath.
 */
export function concealmentFrame(treatment: T04Treatment, concealProgress: number): ConcealmentFrame {
  const p = clamp01(concealProgress);

  if (treatment === "A") {
    // Mandap occluder scales up from a small foreground silhouette to
    // full viewport coverage, holds, then recedes to reveal the finale.
    const coverIn = clamp01(p / 0.55);
    const holdEnd = 0.75;
    const recede = p <= holdEnd ? 1 : 1 - clamp01((p - holdEnd) / (1 - holdEnd));
    const coverage = p <= holdEnd ? coverIn : recede;
    return {
      occluderOpacity: coverage,
      occluderScale: lerp(1.4, 4.2, coverIn),
      curtainOffsetPercent: 0,
      bloomOpacity: 0,
      backgroundSwapped: p >= 0.5 && p <= holdEnd + 0.02 ? true : p > holdEnd + 0.02,
    };
  }

  if (treatment === "B") {
    const closeEnd = 0.5;
    const holdEnd = 0.72;
    const closing = p <= closeEnd ? 100 - 100 * clamp01(p / closeEnd) : 0;
    const opening = p > holdEnd ? 100 * clamp01((p - holdEnd) / (1 - holdEnd)) : 0;
    const offset = p <= closeEnd ? closing : p <= holdEnd ? 0 : opening;
    return {
      occluderOpacity: 0,
      occluderScale: 1,
      curtainOffsetPercent: offset,
      bloomOpacity: 0,
      backgroundSwapped: p >= closeEnd,
    };
  }

  // Treatment C — cinematic light concealment: restrained warm bloom
  // (never full white/opaque) combined with a partial (not full-cover)
  // occluder.
  const bloomIn = clamp01(p / 0.5);
  const bloomHoldEnd = 0.68;
  const bloomOut = p <= bloomHoldEnd ? 1 : 1 - clamp01((p - bloomHoldEnd) / (1 - bloomHoldEnd));
  const bloom = (p <= bloomHoldEnd ? bloomIn : bloomOut) * 0.72; // capped — never a white flash
  return {
    occluderOpacity: clamp01(bloomIn * 0.6),
    occluderScale: lerp(1.4, 2.4, bloomIn),
    curtainOffsetPercent: 0,
    bloomOpacity: bloom,
    backgroundSwapped: p > 0.5,
  };
}

export interface ReducedMotionFrame {
  stateIndex: JourneyStateId;
}

/** Reduced-motion / Save-Data mode: a plain ordered sequence of static compositions, no scroll-linked transform at all. */
export const REDUCED_MOTION_SEQUENCE: JourneyStateId[] = [0, 1, 2, 3, 4];
