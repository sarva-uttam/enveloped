"use client";

const MOTES = ["🌸", "✦", "🌿", "✦", "🌼", "✦"];

export function FloatingMotif({ count = 14 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
