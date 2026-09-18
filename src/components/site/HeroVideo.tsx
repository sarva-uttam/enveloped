"use client";

import { useEffect, useRef, useState } from "react";
import { useIsClient } from "@/lib/motion/useIsClient";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { useMediaQuery } from "@/lib/motion/useMediaQuery";

const DESKTOP_QUERY = "(min-width: 768px)"; // Tailwind's own `md` — kept numerically identical to the CSS breakpoint that lays the hero out, so JS and CSS never disagree about which "device" this is.

const SOURCES = {
  desktop: { video: "/videos/hero-desktop.mp4", poster: "/videos/hero-desktop-poster.jpg" },
  mobile: { video: "/videos/hero-mobile.mp4", poster: "/videos/hero-mobile-poster.jpg" },
} as const;

/**
 * The homepage hero's decorative video background. Owner-supplied
 * looping footage (see public/videos/README.md) of the same invitation-
 * card animation in landscape and portrait; this component's only job is
 * to show the right one, safely, and never let it be the only thing
 * standing between a visitor and a visible hero.
 *
 * LAYERING (bottom to top, always in this order):
 *   1. A `<picture>` poster — real, native, zero-JS responsive image
 *      selection (a `<source media>` the browser evaluates itself, the
 *      same mechanism `<video><source media>` uses, just for a still
 *      image here). This is what every visitor sees first, what a
 *      no-JS visitor sees FOREVER, and what stays put if the video
 *      never loads — "an elegant static poster/fallback so the hero
 *      never appears blank" is true before hydration, not just after.
 *   2. The `<video>` itself — mounted ONLY once `useIsClient()` is true
 *      AND the viewer does not prefer reduced motion. Until then there
 *      is no `<video>` element in the DOM at all, so a reduced-motion
 *      visitor never fetches a single byte of either video file —
 *      "display the poster image instead of autoplaying video" is
 *      literal, not just visual. Because the check happens once, at the
 *      parent, `HeroVideoElement` below never has to re-check
 *      `prefers-reduced-motion` itself — if it flips true while
 *      mounted, this whole element unmounts.
 *
 * EXACTLY ONE VIDEO ASSET EVER DOWNLOADS: `useMediaQuery(DESKTOP_QUERY)`
 * picks a single `src` for the one `<video>` element this renders — never
 * two elements (one hidden), never a `<source>`-per-breakpoint list.
 * "Do not download the full desktop asset unnecessarily on mobile" is
 * true by construction: the mobile asset is never even referenced when
 * the desktop one is in play, and vice versa. Resizing across the 768px
 * line at runtime (e.g. rotating a tablet) live-swaps `variant`, which
 * `key={variant}` on `HeroVideoElement` turns into a full remount — a
 * fresh `<video>` element with the new `src`, not the same element
 * mutated in place, so there is no ambiguity about whether the browser
 * re-evaluates the new source from scratch.
 *
 * RELIABLE AUTOPLAY (the actual fix here — see this file's own PROJECT
 * history / commit message for the diagnosis): a `<video autoPlay muted>`
 * rendered by React is NOT a reliable way to get autoplay in every
 * browser/timing condition. React sets the JSX `muted` prop as a live
 * DOM PROPERTY assignment, not as an HTML attribute (confirmed by
 * inspecting the rendered element: `hasAttribute("muted")` is `false`
 * even though `video.muted` is `true`) — and a browser's autoplay
 * eligibility check for the `autoplay` attribute can, depending on
 * engine/timing, run before or after that property assignment lands.
 * When it runs before, the browser sees an unmuted `<video autoplay>`,
 * which every modern autoplay policy correctly refuses — silently,
 * with no visible error, leaving the poster showing forever. This is a
 * known category of React+`<video>` bug, not exotic: relying on the
 * `autoplay` HTML attribute alone is fragile precisely because nothing
 * enforces that ordering.
 *
 * The fix is to never depend on that race: `HeroVideoElement` explicitly
 * sets both `video.defaultMuted` and `video.muted` to `true` itself,
 * imperatively, before ever calling `.play()` — removing the ordering
 * dependency entirely, regardless of what the browser's own attribute-
 * driven autoplay does or doesn't do on its own. Playback is then
 * actively attempted (not just requested via an attribute) at every
 * point it becomes plausible: on mount, on `loadeddata`, on `canplay`,
 * on the window regaining focus, and on the page becoming visible again
 * — each is a real, one-shot browser event, never a timer, so this can
 * never become an uncontrolled retry loop. `play()`'s returned promise
 * is always awaited-and-swallowed (never left unhandled, never thrown
 * to the console) — a rejected attempt just means the poster stays up
 * and the next real event tries again.
 *
 * FADE-IN: the video starts at `opacity-0` and only reaches `opacity-100`
 * once its own `playing` event actually fires — the poster underneath is
 * what's visible for however long decoding/buffering (or a failed
 * autoplay attempt) takes, so there is never a blank or half-loaded
 * video frame flashed to the visitor, and a visitor whose browser
 * refuses autoplay outright simply keeps seeing the (real, complete)
 * poster frame forever — never a blank hero.
 *
 * PAUSED WHEN HIDDEN, RESUMED WHEN VISIBLE: a Page Visibility listener
 * pauses on hide and re-attempts playback on show — the same pattern
 * AtmosphericEffect.tsx established in Stage 7 — a backgrounded tab
 * never keeps decoding video.
 *
 * Never depends on audio: no audio track exists in these production
 * files at all (stripped at encode time, not just muted — see
 * public/videos/README.md), and `muted`/`playsInline` are set directly
 * regardless, both because iOS Safari and Chrome's autoplay policies
 * require it for unattended autoplay and because this is genuinely
 * decorative background motion no one should ever need to hear.
 */
export function HeroVideo() {
  const isClient = useIsClient();
  const reducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const variant = isDesktop ? "desktop" : "mobile";

  return (
    <div className="absolute inset-0 overflow-hidden bg-paper" aria-hidden="true">
      <picture>
        <source media={DESKTOP_QUERY} srcSet={SOURCES.desktop.poster} />
        <img
          src={SOURCES.mobile.poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_48%]"
        />
      </picture>

      {/* `key={variant}` (not just a ref-managed src swap) is deliberate:
          a live breakpoint crossing (e.g. rotating a tablet) gets a
          fresh `ready` state AND a fresh `<video>` element for the new
          source, purely by remounting with normal `useState`
          initializers — no effect needs to reset `ready`, which would
          mean calling setState synchronously inside an effect (forbidden
          by this project's lint config, see EnvelopeOpening.tsx's own
          history with the same rule). */}
      {isClient && !reducedMotion && <HeroVideoElement key={variant} variant={variant} />}
    </div>
  );
}

function HeroVideoElement({ variant }: { variant: keyof typeof SOURCES }) {
  const { video, poster } = SOURCES[variant];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `player` (not the nullable `videoRef.current` directly) is what
    // every nested closure below captures — a `const` already narrowed
    // to `HTMLVideoElement`, so TypeScript doesn't need to (and
    // couldn't reliably) re-check nullability on every use inside a
    // function declaration hoisted above this point.
    const player = videoRef.current;
    if (!player) return;

    // Imperative, not attribute-only — see this file's own top comment
    // for exactly why the JSX `muted`/`autoPlay` props alone are not
    // sufficient. Setting both `defaultMuted` (what a fresh `load()`
    // resets to) and `muted` (the live state) BEFORE any `play()` call
    // removes the race entirely.
    player.defaultMuted = true;
    player.muted = true;

    let cancelled = false;

    // `const ... = () => {}` rather than `function` declarations: with a
    // hoisted function declaration, TypeScript won't carry the `player`
    // null-check above into the body (a declaration could, in principle,
    // be invoked from anywhere in scope, including before this point) —
    // an arrow function assigned in source order after the guard has no
    // such ambiguity, so the narrowing holds without an extra `player!`
    // assertion on every access.
    const attemptPlay = () => {
      if (cancelled || !player.paused) return;
      const playPromise = player.play();
      if (playPromise && typeof playPromise.catch === "function") {
        // A rejected promise here just means autoplay was refused (or
        // interrupted by a near-simultaneous pause/reload) — the poster
        // is still showing (opacity is gated on the real `playing`
        // event below, never on this call succeeding), and the very
        // next real trigger (loadeddata/canplay/focus/visibility) tries
        // again. Never surfaced as an error, never retried on a timer.
        playPromise.catch(() => {});
      }
    };

    const handlePlaying = () => setReady(true);
    const handleWindowFocus = () => {
      if (!document.hidden) attemptPlay();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) player.pause();
      else attemptPlay();
    };

    player.addEventListener("loadeddata", attemptPlay);
    player.addEventListener("canplay", attemptPlay);
    player.addEventListener("playing", handlePlaying);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Force a clean (re)load against the current `src` — belt-and-
    // suspenders alongside the `key`-driven remount above: this
    // guarantees the browser's own load pipeline runs fresh for this
    // element rather than relying on it having auto-initialized
    // correctly from the `src` attribute at creation time.
    player.load();
    attemptPlay();

    return () => {
      cancelled = true;
      player.removeEventListener("loadeddata", attemptPlay);
      player.removeEventListener("canplay", attemptPlay);
      player.removeEventListener("playing", handlePlaying);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [video]);

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full object-cover object-[center_48%] transition-opacity duration-700 ease-out ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      src={video}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
    />
  );
}
