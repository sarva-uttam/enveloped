"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { FloatingMotif } from "@/components/site/FloatingMotif";

/**
 * Trusted, PACK-SPECIFIC atmospheric effects — Stage 7 (see
 * PROJECT_STATUS.md's Stage 7 section, Part D). Selected ONLY by a
 * trusted, already-Zod-validated `designPackId` (never a raw string
 * from composition data used to pick a component, class, or URL) plus
 * the composition's own `featureConfig.ambientMotif` intensity —
 * exactly the same "closed registry, not free configuration" pattern
 * the palette/motif/section-type systems already use.
 *
 * `neutral-classic` → a soft, restrained "paper glow": a few slow-
 * pulsing blurred highlights, no particles at all — "soft light;
 * subtle paper glow." `hindu-wedding` → drifting petal glyphs (reusing
 * FloatingMotif's existing drift animation) — "flower petals." Neither
 * portrays a sacred figure, invents religious text, or implies a single
 * ritual is universal — both are purely ambient, non-representational
 * decoration. No confetti-like overload: `full` intensity still caps at
 * FloatingMotif's existing 20-element bound, `light` at 10 — the same
 * numbers already established in Stage 4/6, never increased here.
 *
 * Accessibility/performance guarantees, all independent of each other
 * (any one of them alone would already make this safe): `aria-hidden`
 * and `pointer-events-none` on the outer wrapper (purely decorative,
 * never intercepts a tap/click meant for real content); renders nothing
 * at all when the viewer prefers reduced motion (`useReducedMotion()`)
 * — "avoid smoke/petals/confetti motion" for those users, not merely a
 * slower version of it; pauses (via `data-effects-paused`, see
 * globals.css) rather than keeps animating when the page is hidden
 * (Page Visibility API), and the listener is removed on unmount, same
 * as any other effect in this project.
 */
export function AtmosphericEffect({
  designPackId,
  intensity,
}: {
  designPackId: string;
  intensity: "none" | "light" | "full";
}) {
  const reducedMotion = useReducedMotion();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function handleVisibilityChange() {
      setHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  if (reducedMotion || intensity === "none") return null;

  const count = intensity === "full" ? 20 : 10;

  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-40"
      aria-hidden="true"
      data-effects-paused={hidden ? "true" : "false"}
    >
      {designPackId === "hindu-wedding" ? <FloatingMotif count={count} /> : <SoftGlow count={intensity === "full" ? 4 : 2} />}
    </div>
  );
}

/** The neutral-classic "soft paper glow" — a handful of large, heavily
 *  blurred, slow-pulsing circles positioned at fixed, deliberately
 *  spread-out points (never randomized per render — stable output,
 *  including in server-rendered markup, avoiding any hydration
 *  mismatch). */
function SoftGlow({ count }: { count: number }) {
  const positions = [
    { top: "8%", left: "12%" },
    { top: "62%", left: "78%" },
    { top: "30%", left: "85%" },
    { top: "80%", left: "20%" },
  ];
  return (
    <>
      {positions.slice(0, count).map((pos, i) => (
        <div
          key={i}
          className="animate-glow-pulse absolute h-40 w-40 rounded-full blur-3xl"
          style={{ ...pos, background: "var(--gold-soft, #f8ecd2)", animationDelay: `${i * 1.3}s` }}
        />
      ))}
    </>
  );
}
