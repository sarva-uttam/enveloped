"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { MotionPresetId } from "@/lib/composition/schema";
import { MOTION_PRESET_DEFINITIONS } from "@/lib/motion/presets";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * The ONLY reason any part of the invitation's static content tree
 * touches framer-motion — a thin scroll-reveal wrapper, not a content
 * generator. `children` is normal React content (server-rendered when
 * this is composed from a Server Component, per React's children-as-
 * server-content pattern: a Client Component's `children` prop, when it
 * originates from a parent Server Component's render, is NOT re-executed
 * on the client — it's already-rendered content this component only
 * wraps with motion behavior). This is what keeps Framer Motion off the
 * actual CONTENT-rendering path (Stage 4, see PROJECT_STATUS.md) while
 * still preserving the existing entrance animation: the text is present
 * in the initial server HTML either way, this only controls when it
 * becomes visually revealed once JS hydrates.
 *
 * Stage 7 (2026-09-10, see PROJECT_STATUS.md's Stage 7 section, Part B):
 * `preset` selects one of the TRUSTED, hardcoded animation definitions
 * in src/lib/motion/presets.ts by name — never raw Framer Motion
 * config from composition data. `active=false`, a "none" preset, OR the
 * viewer preferring reduced motion ALL render a plain, immediately-
 * visible `<div>` — three independent ways to land at the same safe,
 * fully-visible fallback (the tier-driven flag from Stage 4, an
 * explicit per-section author choice, and the viewer's own OS/browser
 * preference, checked here via useReducedMotion() regardless of what
 * either of the other two say).
 *
 * `data-motion-reveal` on the animated branch is what
 * src/app/globals.css's `@media (scripting: none)` rule targets to keep
 * content visible if JavaScript never runs at all (not merely "hasn't
 * run yet") — see that rule's own comment for the full mechanism.
 */
export function AnimateIn({
  active,
  preset = "fade",
  className,
  children,
}: {
  active: boolean;
  preset?: MotionPresetId;
  className?: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();

  if (!active || reducedMotion || preset === "none") {
    return <div className={className}>{children}</div>;
  }

  const def = MOTION_PRESET_DEFINITIONS[preset];

  return (
    <motion.div
      data-motion-reveal="true"
      initial={def.initial}
      whileInView={def.animate}
      viewport={{ once: true, margin: "-60px" }}
      transition={def.transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
