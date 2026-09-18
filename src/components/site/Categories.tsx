import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EVENT_CATEGORIES, CATEGORY_ICONS } from "@/lib/categories";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Stage 11 redesign: replaces the previous emoji-icon bordered-card grid
 * (the brief's "weakest section") with an editorial index list — real
 * lucide iconography instead of emoji, hairline dividers instead of
 * repeated rounded cards, each row a genuine focusable link.
 */
export function Categories() {
  return (
    <Section border="top" tone="raised">
      <SectionHeading
        eyebrow="Every occasion"
        title="Built for weddings."
        accent="Ready for anything."
        body="Pick the occasion closest to yours to start your survey."
      />
      <ol className="mt-14 divide-y divide-line border-t border-line sm:grid sm:grid-cols-2 sm:divide-y-0 sm:gap-x-10 sm:border-t-0">
        {EVENT_CATEGORIES.map((cat, i) => {
          const Icon = CATEGORY_ICONS[cat.id];
          return (
            <li key={cat.id} className="sm:border-t sm:border-line">
              <Reveal delay={Math.min(i, 4) * 0.04} className="h-full">
                <Link
                  href={`/survey?category=${cat.id}`}
                  className="focus-ring group flex h-full items-start gap-4 rounded-sm py-5"
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-colors duration-200 group-hover:border-blush group-hover:text-blush">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium text-ink">{cat.label}</span>
                    <span className="mt-1 block text-sm text-ink-soft">{cat.blurb}</span>
                  </span>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-line transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
