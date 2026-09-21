import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

/**
 * Stage 11 design-system primitive. Three variants only, matching the
 * brief's "button hierarchy" requirement — deliberately not every CTA on
 * the site gets a pill: `primary` keeps the pill shape the nav/hero CTAs
 * already established (the one shape worth repeating, since it's the
 * single "go" action), `secondary` is a soft-radius outline for a
 * parallel/lesser action, and `tertiary` is plain text + arrow for the
 * lowest-emphasis "read more" links — avoids the "excessive pill-shaped
 * elements" trap the brief calls out while keeping one consistent hierarchy.
 * `.focus-ring` (globals.css) is baked in so no call site reinvents focus.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-ink px-6 py-3 text-paper hover:bg-ink-soft",
  secondary: "rounded-md border border-line px-6 py-3 text-ink hover:border-ink",
  tertiary: "px-0 py-1 text-ink-soft hover:text-ink",
};

const BASE =
  "focus-ring inline-flex items-center justify-center gap-2 text-sm font-medium transition duration-200";

interface CommonProps {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
  /** Tertiary links get a trailing arrow that nudges right on hover/focus by default. */
  withArrow?: boolean;
}

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children"> & { href: string };

export function Button({ variant = "primary", className, children, withArrow, ...props }: ButtonAsButton | ButtonAsLink) {
  const classes = cn(BASE, VARIANT_CLASSES[variant], className);
  const arrow = withArrow ?? variant === "tertiary";
  const content = (
    <>
      {children}
      {arrow && (
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...rest } = props as ButtonAsLink;
    return (
      <Link href={href} className={cn(classes, "group")} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button className={cn(classes, "group")} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  );
}
