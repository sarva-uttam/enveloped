import { Wand2, Users, Music2 } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Wand2,
    title: "Composed, not templated",
    body: "Every invite is assembled section by section from your own answers — the wording, the schedule, the palette — not a single static template with your name pasted in.",
    premium: false,
  },
  {
    icon: Users,
    title: "A named invite for every guest",
    body: "On Platinum, each person on your list gets their own personal link and greeting, disguised behind a warm \"click me\" line instead of a raw URL.",
    premium: true,
  },
  {
    icon: Music2,
    title: "Motion and music, when you want them",
    body: "Cinematic opening animations, ambient background motifs, and a song of your choice layer in as you move up the tiers — never forced on invites that want to stay simple.",
    premium: true,
  },
];

export function FeatureStory() {
  return (
    <Section border="top">
      <SectionHeading eyebrow="What you're actually getting" title="More than a pretty page." />
      <div className="mt-16 space-y-16">
        {FEATURES.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 0.06}>
            <div
              className={cn(
                "flex flex-col items-start gap-6 border-t border-line pt-10 sm:items-center sm:gap-10",
                i % 2 === 1 ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row",
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line text-blush">
                <feature.icon className="h-6 w-6" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-2xl">{feature.title}</h3>
                  {feature.premium && <PremiumBadge />}
                </div>
                <p className="mt-2 max-w-2xl text-ink-soft">{feature.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
