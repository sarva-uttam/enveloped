import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The brief requires "Premium" to have a defined meaning, not be a
 * decorative badge. Definition, used consistently everywhere this badge
 * appears (homepage feature storytelling, /templates): a feature or
 * design is "Premium" exactly when it's `includedFrom: "gold"` or
 * `"platinum"` in TIER_FEATURE_MATRIX (src/lib/tiers.ts) — i.e. it ships
 * starting at the Gold tier. Never applied to a Bronze/Silver feature.
 */
export function PremiumBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-champagne bg-champagne-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-burgundy",
        className,
      )}
      title="Included from the Gold tier and above"
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      Premium
    </span>
  );
}
