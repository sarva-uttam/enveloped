import { cn } from "@/lib/utils";

/**
 * A thin editorial rule with a centered ornament — used BETWEEN sections
 * instead of wrapping content in another bordered card, per the brief's
 * "editorial dividers" requirement.
 */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto flex max-w-6xl items-center gap-4 px-6", className)} aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="font-display text-lg italic text-champagne">envel&middot;oped</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
