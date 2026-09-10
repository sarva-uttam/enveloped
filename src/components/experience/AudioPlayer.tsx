"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Play, Pause, Loader2, AlertCircle } from "lucide-react";

/**
 * The real, accessible music control — Stage 7 (see PROJECT_STATUS.md's
 * Stage 7 section, Part F). Replaces the pre-Stage-7 `MusicToggle`
 * (deleted this stage), which had no actual `<audio>` element at all —
 * its "Now playing" state was fake, toggled by a button that played
 * nothing.
 *
 * NEVER autoplays: the `<audio>` element below carries no `autoPlay`
 * attribute, and `audio.play()` is called from exactly one place —
 * inside this button's own `onClick` handler — so playback can only
 * ever begin from a direct, current, real click/tap/keyboard-activation
 * on this control. Nothing in src/components/experience/EnvelopeOpening.tsx
 * calls this component's play method either — opening the envelope does
 * NOT start music (see that file's own comment on why: browsers'
 * autoplay-with-sound policies require the interaction and the audible
 * result to be unambiguously connected in the user's mind, and "tap to
 * open an envelope" reads as "reveal the invitation," not "start
 * music," to a first-time visitor). This is deliberately the safer
 * default Part F itself names as preferred: "a clear 'Play music'
 * control."
 *
 * `preload="none"` — no network request for the audio file happens
 * until the guest actually presses play (Part H: don't delay or bloat
 * the page for a feature most visits will never use).
 */
type PlaybackState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export function AudioPlayer({
  src,
  title,
  credit,
  loop,
  startVolume,
  accent,
}: {
  src: string;
  title?: string | null;
  credit?: string | null;
  loop: boolean;
  startVolume: number;
  accent: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlaybackState>("idle");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = startVolume;

    function handleWaiting() {
      setState("loading");
    }
    function handlePlaying() {
      setState("playing");
    }
    function handlePause() {
      // `pause` also fires right before `ended` in some browsers —
      // don't let it stomp the more specific "ended" state.
      setState((s) => (s === "ended" ? s : "paused"));
    }
    function handleEnded() {
      setState("ended");
    }
    function handleError() {
      setState("error");
    }

    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
    // startVolume is only ever applied once, at mount — a composition
    // never changes underneath a mounted player, so there is no
    // meaningful "startVolume changed" case to react to again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || state === "error") return;

    if (state === "playing" || state === "loading") {
      audio.pause();
      setState("paused");
      return;
    }

    try {
      setState("loading");
      // A real, current click handler — this is precisely the browser-
      // required "user gesture" every autoplay-with-sound policy
      // demands; calling this from anywhere else (a timer, a mount
      // effect, another component's callback) would not satisfy it.
      await audio.play();
    } catch {
      setState("error");
    }
  }

  const playing = state === "playing" || state === "loading";
  const label = state === "error" ? "Music unavailable" : `${playing ? "Pause" : "Play"} music${title ? `: ${title}` : ""}`;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <audio ref={audioRef} src={src} loop={loop} preload="none" />
      <button
        type="button"
        aria-pressed={state === "playing"}
        aria-label={label}
        disabled={state === "error"}
        onClick={toggle}
        title={credit ? `${title ?? "Music"} — ${credit}` : (title ?? undefined)}
        className="flex items-center gap-2 rounded-full border border-line bg-paper-raised/90 px-4 py-2.5 text-xs shadow-lg backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: accent }} aria-hidden="true" />
        ) : state === "error" ? (
          <AlertCircle className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        ) : playing ? (
          <Pause className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        )}
        <span className="max-w-[9rem] truncate text-ink-soft">
          {state === "error" ? "Music unavailable" : playing ? "Now playing" : "Play music"}
          {title && state !== "error" ? ` · ${title}` : ""}
        </span>
        <Music className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
      </button>
    </div>
  );
}
