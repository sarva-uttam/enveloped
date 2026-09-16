"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { FloatingMotif } from "@/components/site/FloatingMotif";
import { legacyMotifForPack, type DecorativeMotifId } from "@/lib/composition/motifs";

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
  motifId,
}: {
  designPackId: string;
  intensity: "none" | "light" | "full";
  /** Stage 12 — an explicit, trusted motif choice (see motifs.ts). When
   *  absent (every pre-Stage-12 composition), falls back to
   *  `legacyMotifForPack()` — the original neutral/hindu-only branch —
   *  so existing invitations render unchanged. */
  motifId?: DecorativeMotifId;
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

  const resolvedMotif = motifId ?? legacyMotifForPack(designPackId);

  if (reducedMotion || intensity === "none" || resolvedMotif === "none") return null;

  const count = intensity === "full" ? 20 : 10;

  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-40"
      aria-hidden="true"
      data-effects-paused={hidden ? "true" : "false"}
    >
      <MotifRenderer motifId={resolvedMotif} count={count} intensity={intensity} />
    </div>
  );
}

function MotifRenderer({ motifId, count, intensity }: { motifId: DecorativeMotifId; count: number; intensity: "light" | "full" }) {
  switch (motifId) {
    case "marigold-drift":
      return <FloatingMotif count={count} />;
    case "botanical-line":
      return <BotanicalLine count={intensity === "full" ? 6 : 3} />;
    case "lotus-geometric":
      return <LotusGeometric count={intensity === "full" ? 4 : 2} />;
    case "diya-warmth":
      return <DiyaWarmth count={intensity === "full" ? 5 : 3} />;
    case "soft-glow":
    default:
      return <SoftGlow count={intensity === "full" ? 4 : 2} />;
  }
}

/** A handful of thin, single-line botanical stroke sketches drifting at
 *  fixed, spread-out points — original SVG line art, no imported
 *  imagery, deliberately spare to match the "Modern Editorial" template's
 *  restrained feel. */
function BotanicalLine({ count }: { count: number }) {
  const positions = [
    { top: "6%", left: "88%" },
    { top: "70%", left: "6%" },
    { top: "40%", left: "94%" },
    { top: "88%", left: "82%" },
    { top: "20%", left: "4%" },
    { top: "58%", left: "92%" },
  ];
  return (
    <>
      {positions.slice(0, count).map((pos, i) => (
        <svg
          key={i}
          className="animate-drift absolute h-16 w-16 opacity-60"
          style={{ ...pos, animationDuration: `${18 + i * 3}s`, animationDelay: `${i * 2}s` }}
          viewBox="0 0 64 64"
          fill="none"
          stroke="var(--silver, #6b7280)"
          strokeWidth="1"
        >
          <path d="M32 60 C32 40 20 30 20 12 M20 12 C20 12 26 20 32 18 M20 12 C20 12 14 20 8 18" />
        </svg>
      ))}
    </>
  );
}

/** A faceted, geometric lotus lattice — pure line-art geometry, never a
 *  representational or sacred image, matching cultural-packs.ts's own
 *  "purely ambient decoration" constraint. */
function LotusGeometric({ count }: { count: number }) {
  const positions = [
    { top: "10%", left: "10%" },
    { top: "72%", left: "80%" },
    { top: "45%", left: "6%" },
    { top: "18%", left: "84%" },
  ];
  return (
    <>
      {positions.slice(0, count).map((pos, i) => (
        <svg
          key={i}
          className="animate-glow-pulse absolute h-28 w-28 opacity-50"
          style={{ ...pos, animationDelay: `${i * 1.5}s` }}
          viewBox="0 0 100 100"
          fill="none"
          stroke="var(--gold, #b8862f)"
          strokeWidth="1"
        >
          <polygon points="50,10 90,50 50,90 10,50" />
          <polygon points="50,28 72,50 50,72 28,50" />
        </svg>
      ))}
    </>
  );
}

/** A warm, flickering-glow ambient treatment — larger, warmer-toned
 *  pulses than SoftGlow, evoking diya warmth without depicting a flame
 *  or lamp directly. */
function DiyaWarmth({ count }: { count: number }) {
  const positions = [
    { top: "12%", left: "18%" },
    { top: "68%", left: "72%" },
    { top: "35%", left: "88%" },
    { top: "84%", left: "14%" },
    { top: "50%", left: "45%" },
  ];
  return (
    <>
      {positions.slice(0, count).map((pos, i) => (
        <div
          key={i}
          className="animate-glow-pulse absolute h-48 w-48 rounded-full blur-3xl"
          style={{ ...pos, background: "var(--gold-soft, #f8ecd2)", animationDelay: `${i * 0.9}s`, animationDuration: "4.5s" }}
        />
      ))}
    </>
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
