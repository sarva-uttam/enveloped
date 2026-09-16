import { CULTURAL_PACKS, type CulturalPackId } from "@/lib/composition/cultural-packs";
import { PALETTE_REGISTRY } from "@/lib/composition/theme";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

/**
 * A representative, genuinely-live demo invite per pack — never an
 * unbuilt "future pack" (see cultural-packs.ts's own comment listing
 * those explicitly as not registered/not selectable). Only two panels
 * exist because only two packs are real; that asymmetry with the rest of
 * the homepage's rhythm is the honest state of the product, not a bug.
 */
const SHOWCASE: { packId: CulturalPackId; demoId: string; eyebrow: string }[] = [
  { packId: "hindu-wedding", demoId: "demo-hindu", eyebrow: "Wedding — Hindu" },
  { packId: "neutral-classic", demoId: "demo-silver", eyebrow: "Wedding — Classic & interfaith" },
];

export function DesignShowcase() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Design showcase"
        title="Two starting points,"
        accent="built with care."
        body="Every design is a genuinely live, interactive demo — not a mockup. More traditions are on the way; these are the ones ready today."
      />
      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        {SHOWCASE.map(({ packId, demoId, eyebrow }, i) => {
          const pack = CULTURAL_PACKS[packId];
          const palette = PALETTE_REGISTRY[pack.paletteId];
          return (
            <Reveal key={packId} delay={i * 0.08}>
              <a
                href={`/invite/${demoId}`}
                className="focus-ring group block overflow-hidden rounded-sm border border-line transition hover:shadow-[0_28px_48px_-32px_rgba(33,26,23,0.3)]"
              >
                <div
                  className="texture-grain corner-flourish relative flex h-56 flex-col justify-end border-b border-line/60 p-8"
                  style={{ background: palette.soft, color: palette.accent }}
                >
                  <span className="text-xs font-medium uppercase tracking-widest" style={{ color: palette.accent }}>
                    {eyebrow}
                  </span>
                  <span className="mt-2 font-display text-3xl italic text-ink">{pack.label}</span>
                </div>
                <div className="flex items-center justify-between gap-6 bg-paper-raised p-6">
                  <p className="text-sm text-ink-soft">{pack.description}</p>
                  <span className="shrink-0 text-sm font-medium text-ink underline-offset-4 group-hover:underline">
                    Preview
                  </span>
                </div>
              </a>
            </Reveal>
          );
        })}
      </div>
      <div className="mt-12 text-center">
        <Button href="/templates" variant="tertiary" withArrow>
          Browse every design
        </Button>
      </div>
    </Section>
  );
}
