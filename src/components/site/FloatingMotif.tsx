const MOTES = ["🌸", "✦", "🌿", "✦", "🌼", "✦"];

/**
 * Purely decorative — no hooks, no browser APIs, so no "use client"
 * directive (removed Stage 4, see PROJECT_STATUS.md): this renders
 * identically whether composed from a Server or Client Component, and
 * dropping the directive lets it be part of the initial server-rendered
 * HTML on the invitation page instead of needing hydration first.
 *
 * `aria-hidden="true"` on the wrapper (Stage 4 accessibility fix,
 * previously missing — assistive tech would otherwise announce each
 * emoji, e.g. "cherry blossom", once per floating element): this is
 * background decoration, never meaningful content.
 */
export function FloatingMotif({ count = 14 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((i) => {
        const left = (i * 137.5) % 100;
        const duration = 14 + (i % 7) * 3;
        const delay = (i % 10) * -1.7;
        const size = 12 + (i % 4) * 6;
        const glyph = MOTES[i % MOTES.length];
        return (
          <span
            key={i}
            className="animate-drift absolute select-none opacity-0"
            style={{
              left: `${left}%`,
              top: "-5%",
              fontSize: `${size}px`,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
            }}
          >
            {glyph}
          </span>
        );
      })}
    </div>
  );
}
