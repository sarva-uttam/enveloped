"use client";

import { useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";

/**
 * Stage 4 accessibility fixes (see PROJECT_STATUS.md): aria-pressed
 * exposes the playing/not-playing state to assistive tech (previously
 * conveyed only by which icon/text was showing); decorative icons are
 * hidden from assistive tech; a visible focus-visible ring is added. No
 * visual redesign.
 */
export function MusicToggle({ song, accent }: { song: string; accent: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <button
      aria-pressed={playing}
      onClick={() => setPlaying((p) => !p)}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-line bg-paper-raised/90 px-4 py-2.5 text-xs shadow-lg backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {playing ? (
        <Volume2 className="h-4 w-4 animate-shimmer" style={{ color: accent }} aria-hidden="true" />
      ) : (
        <VolumeX className="h-4 w-4 text-ink-soft" aria-hidden="true" />
      )}
      <span className="max-w-[9rem] truncate text-ink-soft">
        {playing ? "Now playing" : "Play our song"} {song ? `· ${song}` : ""}
      </span>
      <Music className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
    </button>
  );
}
