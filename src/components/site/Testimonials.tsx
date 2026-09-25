import { SAMPLE_TESTIMONIALS } from "@/lib/testimonials";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

export function Testimonials() {
  return (
    <Section>
      <SectionHeading eyebrow="From our couples" title="Said in three languages." />
      <p className="mx-auto mt-4 max-w-xl text-center text-xs text-ink-soft">
        Demonstration content — Enveloped is new, and we haven&apos;t collected real
        customer reviews yet. These sample responses show the range of languages
        our couples write in; they&apos;ll be replaced with real testimonials as they
        arrive.
      </p>
      <div className="mt-14 grid gap-8 sm:grid-cols-3">
        {SAMPLE_TESTIMONIALS.map((t, i) => (
          <Reveal key={t.id} delay={i * 0.06}>
            <figure className="flex h-full flex-col border-t-2 border-champagne pt-6">
              <span className="text-[11px] font-medium uppercase tracking-widest text-burgundy">
                {t.language} · Sample
              </span>
              <blockquote className="mt-4 flex-1 font-display text-lg italic leading-snug text-ink">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-xs text-ink-soft">{t.attribution}</figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
