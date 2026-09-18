import { cn } from "@/lib/utils";

const STEP_LABELS: Record<string, string> = {
  category: "Occasion",
  tier: "Tier",
  details: "Essentials",
  vibe: "Mood",
  guests: "Guests",
  review: "Review",
};

/**
 * A real progressbar, not four unlabeled divs — the previous version had
 * zero ARIA at all. Desktop shows every step's name; mobile collapses to
 * dots plus the current step's name as a text label (still always
 * visible, not screen-reader-only) so nothing requires horizontal
 * scrolling at 360px.
 */
export function SurveyProgress({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  const currentLabel = STEP_LABELS[steps[currentIndex]] ?? steps[currentIndex];

  return (
    <div
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuetext={`Step ${currentIndex + 1} of ${steps.length}: ${currentLabel}`}
      className="mb-10"
    >
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div
            key={s}
            aria-hidden="true"
            className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= currentIndex ? "bg-ink" : "bg-line")}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          Step {currentIndex + 1} of {steps.length}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-ink">{currentLabel}</span>
      </div>
      {/* Desktop-only full step-name trail, for orientation beyond just "step N of M." */}
      <div className="mt-2 hidden gap-2 text-[11px] text-ink-soft sm:flex">
        {steps.map((s, i) => (
          <span key={s} className={cn(i === currentIndex && "font-medium text-ink")}>
            {STEP_LABELS[s] ?? s}
            {i < steps.length - 1 && <span className="mx-2 text-line">&middot;</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
