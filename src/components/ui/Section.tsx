import { cn } from "@/lib/utils";

type Tone = "paper" | "raised" | "ink";

const TONE_CLASSES: Record<Tone, string> = {
  paper: "bg-paper text-ink",
  raised: "bg-paper-raised text-ink",
  /** A single dramatic dark beat in the homepage's light/dark rhythm — see TrustSection. */
  ink: "bg-ink text-paper",
};

/**
 * Stage 11 design-system primitive — the single source of "content
 * width" and "section rhythm" the brief asks for, so every homepage
 * section shares the same max-width and vertical breathing room instead
 * of each one guessing its own `py-*`/`max-w-*` pair.
 */
export function Section({
  id,
  tone = "paper",
  border,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  tone?: Tone;
  /** Adds a hairline rule on the edge that touches the previous/next section — editorial, not a card border. */
  border?: "top" | "bottom" | "y";
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        TONE_CLASSES[tone],
        border === "top" && "border-t border-line",
        border === "bottom" && "border-b border-line",
        border === "y" && "border-y border-line",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-6xl px-6 py-20 sm:py-24", innerClassName)}>{children}</div>
    </section>
  );
}
