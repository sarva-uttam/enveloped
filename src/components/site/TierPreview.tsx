import { TIERS } from "@/lib/tiers";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Tiers ARE a genuine contained, comparable object (four priced options a
 * buyer picks exactly one of) — the brief's own carve-out for where cards
 * are appropriate. Restyled from the previous generic-SaaS-pricing look:
 * a top accent RULE (not a boxed card with a border on every edge),
 * consistent thin radius, and a vertical divider between columns on wide
 * screens instead of four separate bordered boxes.
 */
export function TierPreview() {
  return (
    <Section tone="raised" border="top">
      <SectionHeading
        eyebrow="Choose your tier"
        title="Four tiers."
        accent="One unforgettable option."
        body="Platinum gives every single guest their own named invite."
      />
      <div className="mt-14 grid gap-x-0 gap-y-8 sm:grid-cols-2 sm:divide-x sm:divide-line lg:grid-cols-4">
        {TIERS.map((tier, i) => (
          <Reveal key={tier.id} delay={i * 0.05} className="px-0 sm:px-8 sm:first:pl-0 sm:last:pr-0">
            <div
              className="flex h-full flex-col border-t-2 pt-6"
              style={{ borderTopColor: tier.colorVar }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium uppercase tracking-wide" style={{ color: tier.colorVar }}>
                  {tier.name}
                </span>
                <span className="font-display text-lg text-ink">${tier.price}</span>
              </div>
              <p className="mt-3 font-display text-xl">{tier.tagline}</p>
              <p className="mt-2 text-sm text-ink-soft">{tier.description}</p>
              <ul className="mt-5 flex-1 space-y-2 text-xs text-ink-soft">
                {tier.highlights.slice(0, 3).map((h) => (
                  <li key={h} className="flex gap-2">
                    <span aria-hidden="true" style={{ color: tier.colorVar }}>&middot;</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-14 text-center">
        <Button href="/pricing" variant="secondary" withArrow>
          Compare all features
        </Button>
      </div>
    </Section>
  );
}
