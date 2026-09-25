"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { SPONSOR_PLACEHOLDERS } from "@/lib/sponsors";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Right-to-left marquee of placeholder brand names — no real sponsors
 * exist yet, so nothing here may be read as a partnership claim. Pause
 * is reachable two ways: hover/focus-within (CSS, `:has`-free via
 * `onFocus`/`onMouseEnter` state) and an explicit, always-visible,
 * keyboard-reachable toggle button — the brief requires keyboard
 * accessibility, and a mouse-only pause would fail that. Reduced-motion
 * visitors get a plain wrapped static row instead of the animation
 * entirely (`.animate-marquee`'s own `prefers-reduced-motion` rule in
 * globals.css, mirrored here in the JSX for the static layout swap).
 */
export function SponsorBelt() {
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const track = [...SPONSOR_PLACEHOLDERS, ...SPONSOR_PLACEHOLDERS];

  return (
    <Section tone="raised" border="top" innerClassName="py-16 sm:py-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">
            Demo placeholders — not real partners
          </p>
          <h2 className="mt-1 font-display text-2xl">A wall we&apos;d love to fill.</h2>
        </div>
        <div className="flex items-center gap-3">
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition hover:border-ink hover:text-ink"
              aria-label={paused ? "Play sponsor belt animation" : "Pause sponsor belt animation"}
              aria-pressed={paused}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          )}
          <Button href="/sponsor" variant="tertiary" withArrow>
            Sponsor us
          </Button>
        </div>
      </div>

      {reducedMotion ? (
        <ul className="mt-10 flex flex-wrap gap-x-10 gap-y-4" aria-label="Placeholder sponsor names, not real partners">
          {SPONSOR_PLACEHOLDERS.map((name) => (
            <li key={name} className="font-display text-lg text-line">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div
            className={cn("animate-marquee flex w-max gap-16")}
            data-paused={paused ? "true" : "false"}
            aria-label="Placeholder sponsor names, not real partners"
            role="list"
          >
            {track.map((name, i) => (
              <span key={`${name}-${i}`} role="listitem" className="whitespace-nowrap font-display text-lg text-line">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
