"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail } from "lucide-react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsClient } from "@/lib/motion/useIsClient";
import { OpeningBurst } from "@/components/invite/OpeningBurst";

function readOpenedFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The original envelope-opening entrance — Stage 7 (see
 * PROJECT_STATUS.md's Stage 7 section, Part C). An entirely original,
 * CSS/SVG-shaped component (a rectangle body plus a `clip-path`
 * triangular flap — no imported artwork, no copied markup, no
 * proprietary asset of any kind) built from this project's own existing
 * Tailwind/CSS vocabulary and Framer Motion (already a dependency since
 * Stage 4 — no new dependency added).
 *
 * SEQUENCE (Part C's own numbered steps): the envelope enters with a
 * gentle upward slide and a slight 3D `rotateX` settle ("enters and
 * settles" + "gentle 3D rotation... perspective movement"); on
 * activation ("opening"), the flap rotates open around its top edge and
 * the card slides up and out from inside; once that finishes
 * ("revealing"), `OpeningBurst` (when `openingBurst` is true) fires as
 * the atmospheric reveal moment, then the whole overlay fades out
 * ("done") via `AnimatePresence`'s `exit` animation, handing focus to
 * the real page — "main invitation becomes the focus... normal
 * scrolling continues."
 *
 * PROGRESSIVE ENHANCEMENT — "no blank screen before hydration... no
 * content loss without JavaScript": the overlay is rendered ONLY
 * client-side, after hydration (the `useIsClient()` gate). The
 * server-rendered HTML, and the pre-hydration DOM, contain nothing but
 * `children` — the real invitation content, fully visible, fully
 * interactive, no overlay, no `inert`. If JavaScript never runs, that
 * is the permanent state: the guest simply gets the invitation
 * directly, exactly as they did before Stage 7. The trade-off is a
 * brief (typically sub-second) glimpse of content on a fast connection
 * before the envelope fades in over it — a deliberate, disclosed
 * choice (see PROJECT_STATUS.md's Stage 7 "Remaining design issues"),
 * preferred over an SSR'd opaque overlay that could get stuck, or a
 * hydration mismatch.
 *
 * WHEN THE OVERLAY IS SUPPRESSED (content rendered directly, no gate):
 *   - `active=false` — a no-motion composition. No overlay, no replay
 *     control; nothing to open.
 *   - the viewer prefers reduced motion — no overlay, and no replay
 *     control either (offering "replay" would just invite them to
 *     override their own OS/browser preference).
 *   - this invitation was already opened earlier THIS browser session
 *     (sessionStorage, cleared when the session ends) — no overlay, but
 *     a small "Replay opening" control IS offered.
 */

type Phase = "waiting" | "opening" | "revealing" | "done";

const REVEAL_HOLD_MS = 900; // how long the burst/reveal moment lingers before the overlay fades out
const SAFETY_TIMEOUT_MS = 6000; // never leaves the overlay stuck if an animation callback fails to fire

export function EnvelopeOpening({
  active,
  sessionKey,
  accent,
  eyebrow,
  openingBurst,
  children,
}: {
  active: boolean;
  sessionKey: string;
  accent: string;
  eyebrow?: string;
  openingBurst: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const isClient = useIsClient();
  const storageKey = `enveloped:envelope-opened:${sessionKey}`;

  const [phase, setPhase] = useState<Phase>("waiting");
  const [replayed, setReplayed] = useState(false);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read synchronously in render, guarded by isClient (never runs on the
  // server / hydration pass, so no mismatch) — sessionStorage is an
  // external store this only reads, never a setState-in-effect.
  const alreadyOpened = isClient && !replayed && readOpenedFlag(storageKey);

  useEffect(() => {
    return () => {
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "revealing") return;
    revealTimer.current = setTimeout(() => setPhase("done"), REVEAL_HOLD_MS);
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, [phase]);

  function markOpened() {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // A failed write just means the animation may play again next
      // visit; never a functional problem.
    }
  }

  function open() {
    if (phase !== "waiting") return;
    markOpened();
    setPhase("opening");
    safetyTimer.current = setTimeout(() => setPhase("done"), SAFETY_TIMEOUT_MS);
  }

  function cardRevealed() {
    if (phase !== "opening") return;
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setPhase("revealing");
  }

  function skipAnimation() {
    markOpened();
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setPhase("done");
  }

  function replay() {
    setReplayed(true);
    setPhase("waiting");
  }

  const showOverlay = isClient && active && !reducedMotion && !alreadyOpened && phase !== "done";
  const offerReplay = isClient && active && !reducedMotion && (alreadyOpened || phase === "done");

  return (
    <>
      {/* `inert` (a real, standard HTML attribute — not a focus-trap
          library) keeps a keyboard/screen-reader user from tabbing into
          content that's currently covered by the overlay, WITHOUT
          trapping focus inside the overlay itself. Only ever true
          client-side, only while the overlay is actually up. */}
      <div inert={showOverlay}>{children}</div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            data-envelope-overlay="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-6"
            style={{ perspective: 1000 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <button
              type="button"
              onClick={open}
              disabled={phase !== "waiting"}
              aria-label="Open your invitation"
              className="group relative flex flex-col items-center gap-4 rounded-2xl px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
            >
              <motion.div
                className="relative"
                initial={{ opacity: 0, y: -32, rotateX: -18, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "circOut" }}
              >
                {/* Card — slides up out of the envelope body once opening starts. */}
                <motion.div
                  className="absolute inset-x-3 top-2 flex h-44 w-56 flex-col items-center justify-center rounded-lg border bg-paper-raised text-center shadow-md sm:h-52 sm:w-64"
                  style={{ borderColor: accent }}
                  initial={{ y: 8, opacity: 0 }}
                  animate={phase === "opening" || phase === "revealing" ? { y: -64, opacity: 1 } : { y: 8, opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: phase === "opening" ? 0.35 : 0 }}
                  onAnimationComplete={cardRevealed}
                >
                  <span className="px-4 text-sm font-medium text-ink">{eyebrow || "You're invited"}</span>
                </motion.div>

                {/* Envelope body */}
                <div
                  className="relative flex h-44 w-56 items-end justify-center overflow-hidden rounded-lg border bg-paper shadow-lg sm:h-52 sm:w-64"
                  style={{ borderColor: accent }}
                >
                  <Mail className="mb-4 h-6 w-6 opacity-70" style={{ color: accent }} aria-hidden="true" />
                </div>

                {/* Flap — an original triangular shape via clip-path, rotating open around its top edge. */}
                <motion.div
                  className="absolute inset-x-0 top-0 h-24 sm:h-28"
                  style={{
                    background: accent,
                    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                    transformOrigin: "top center",
                    transformStyle: "preserve-3d",
                  }}
                  initial={{ rotateX: 0 }}
                  animate={{ rotateX: phase === "opening" || phase === "revealing" ? -165 : 0 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                />
              </motion.div>

              <span className="text-xs font-medium uppercase tracking-widest text-ink-soft">
                {phase === "waiting" ? "Tap to open" : ""}
              </span>
            </button>

            <button
              type="button"
              onClick={skipAnimation}
              className="absolute bottom-6 right-6 rounded-full border border-line bg-paper-raised/80 px-4 py-2 text-xs text-ink-soft backdrop-blur transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Skip animation
            </button>

            {phase === "revealing" && openingBurst && <OpeningBurst colors={[accent, "#f8ecd2", "#c26b7a"]} />}
          </motion.div>
        )}
      </AnimatePresence>

      {offerReplay && <ReplayControl onReplay={replay} />}
    </>
  );
}

function ReplayControl({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      type="button"
      onClick={onReplay}
      aria-label="Replay the opening animation"
      className="fixed bottom-6 left-6 z-40 rounded-full border border-line bg-paper-raised/90 px-4 py-2.5 text-xs text-ink-soft shadow-lg backdrop-blur transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      Replay opening
    </button>
  );
}
