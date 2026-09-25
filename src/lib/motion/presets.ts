import type { Transition } from "framer-motion";
import type { MotionPresetId } from "@/lib/composition/schema";

/**
 * The trusted resolution from a stored `motionPreset` identifier to a
 * real, hand-authored Framer Motion animation definition — Stage 7 (see
 * PROJECT_STATUS.md's Stage 7 section, Part B). A composition (or the
 * cultural-pack defaults that seed one) can only ever NAME one of the
 * eight `MotionPresetId` values (src/lib/composition/schema.ts); the
 * actual numbers below — durations, easing curves, distances — live
 * only here, in trusted application code, never in stored data. This is
 * what "do not accept arbitrary Framer Motion configuration from stored
 * composition data" means concretely: there is no field anywhere a
 * composition could put a duration or easing value even if it wanted
 * to.
 *
 * Every preset uses only `opacity`/`y`/`scale`/`rotate` — compositor-
 * friendly transform/opacity properties (Part H: "use CSS transforms
 * and opacity for major motion"), never `width`/`height`/`top`/`left`
 * or anything that forces layout.
 */

export interface MotionPresetDefinition {
  initial: Record<string, number | string>;
  animate: Record<string, number | string>;
  transition: Transition;
}

export const MOTION_PRESET_DEFINITIONS: Record<MotionPresetId, MotionPresetDefinition> = {
  none: {
    initial: {},
    animate: {},
    transition: { duration: 0, ease: "linear" },
  },
  fade: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" },
  },
  rise: {
    initial: { opacity: 0, y: 48 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: "circOut" },
  },
  scale: {
    initial: { opacity: 0, scale: 0.94 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.55, ease: "easeOut" },
  },
  /** A slightly slower, gentler settle — for the moments meant to feel
   *  like a ceremonial pause (the opening section, a story section). */
  ceremonial: {
    initial: { opacity: 0, y: 32, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.95, ease: "circOut" },
  },
  /** The single-section-level definition — the schedule section's own
   *  component (sections.tsx) additionally implements true per-entry
   *  staggering when its motionPreset is "stagger" (via Framer Motion's
   *  staggerChildren, itself just another trusted, hardcoded value —
   *  never composition-supplied), so this definition is what a
   *  DIFFERENT section type would fall back to if it were ever given
   *  this preset instead. */
  stagger: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: "easeOut" },
  },
  /** A soft downward drift with a slight rotation — evokes a petal
   *  settling, without literally being a particle system (that's
   *  AtmosphericEffect.tsx's job, a background layer, not a section
   *  reveal). */
  petals: {
    initial: { opacity: 0, y: 20, rotate: -3 },
    animate: { opacity: 1, y: 0, rotate: 0 },
    transition: { duration: 0.8, ease: "easeOut" },
  },
  glow: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 1.1, ease: "easeInOut" },
  },
};

/** The trusted per-entry stagger timing for the "stagger" preset's
 *  schedule-specific implementation — a fixed, hardcoded interval,
 *  never composition-supplied. */
export const SCHEDULE_STAGGER_INTERVAL = 0.12;
