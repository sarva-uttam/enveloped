import { cn } from "@/lib/utils";

/**
 * Stage 11 typography-hierarchy primitive: a small uppercase "eyebrow"
 * label, a display headline (with an optional italic accent word, matching
 * the Hero/How-it-works pattern of "warm word in blush italics"), and
 * optional supporting copy. Centered by default; `align="left"` for the
 * alternating editorial layouts.
 */
export function SectionHeading({
  eyebrow,
  title,
  accent,
  body,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  /** Rendered in italic blush immediately after `title`, e.g. title="A moment," accent="not a message." */
  accent?: string;
  body?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" ? "text-center" : "text-left", className)}>
      {eyebrow && (
        <p className="font-medium text-xs uppercase tracking-[0.18em] text-burgundy">{eyebrow}</p>
      )}
      <h2 className={cn("font-display text-3xl sm:text-4xl", eyebrow && "mt-3")}>
        {title}
        {accent && <span className="italic text-blush"> {accent}</span>}
      </h2>
      {body && (
        <p className={cn("text-ink-soft", align === "center" ? "mx-auto mt-3 max-w-xl" : "mt-3 max-w-xl")}>
          {body}
        </p>
      )}
    </div>
  );
}
