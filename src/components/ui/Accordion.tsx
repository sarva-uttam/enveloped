"use client";

import { ChevronDown } from "lucide-react";

/**
 * Native <details>/<summary> disclosure, not a hand-rolled ARIA
 * accordion: keyboard operation (Enter/Space to toggle, Tab to move
 * between items), screen-reader semantics, and "closed content isn't in
 * the accessibility tree" all come from the browser for free, and it
 * works with zero JavaScript. `group open:` Tailwind variants handle the
 * chevron rotation; no measured-height JS animation, so nothing to break
 * under reduced motion (the rotation is a simple, non-parallax transform
 * a reduced-motion user tolerates fine, matching Tailwind's own
 * `prefers-reduced-motion` reset applied site-wide by `@import "tailwindcss"`).
 */
export function AccordionItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line py-5 first:border-t">
      <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm">
        <span className="font-medium text-ink">{question}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}
