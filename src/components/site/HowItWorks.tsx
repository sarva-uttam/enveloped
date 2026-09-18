import Link from "next/link";
import { ListChecks, Sparkles, Wand2, Send } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

const STEPS = [
  {
    icon: ListChecks,
    title: "Take the 2-minute survey",
    body: "Tell us the occasion, your names, the date, the vibe. Hindu, Christian, Muslim wedding, holiday trip, hotel package — anything.",
  },
  {
    icon: Sparkles,
    title: "Pick your tier",
    body: "Bronze to Platinum. More tier, more animation, more music, more magic — including a named invite for every guest.",
  },
  {
    icon: Wand2,
    title: "We craft your invite",
    body: "We write the wording and assemble your design from your answers — ready to review in under a minute.",
  },
  {
    icon: Send,
    title: "Send the moment",
    body: "Share one link, or send every guest their own personal invite disguised as \"Click me\" — not a wall of gibberish text.",
  },
];

/**
 * Owner-approved (Stage 11 brief: "Keep the approved animated hero and
 * its... How It Works... behavior"). Moved verbatim out of page.tsx into
 * its own component so /how-it-works can render the identical, already-
 * approved treatment instead of the separate, plainer list it used to
 * have — same markup, same hover/focus/reduced-motion behavior, nothing
 * about the visual or interaction design changed.
 */
export function HowItWorks({ id = "how" }: { id?: string }) {
  return (
    <Section id={id}>
      <SectionHeading title="How it works" body="Four steps between you and a finished invite." />
      {/* An editorial numbered sequence, not repeated bordered boxes:
          each step is a real link (to the survey — the thing every
          step is ultimately describing how to get to), so "lifts
          slightly and brightens at its edges on hover" is a genuine
          interactive affordance, not decoration, and keyboard focus
          gets the identical treatment for free because it's a real
          focusable element, not a manufactured one. The "edge" that
          brightens is the top rule — pale `border-line` by default,
          warming to `border-blush` on hover/focus — paired with a
          small lift and a soft ambient shadow; `.how-step`'s reduced-
          motion override (globals.css) drops the lift's transform
          but keeps the colour/shadow brighten. */}
      <ol className="mt-16 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Link
              href="/survey"
              className="how-step group block rounded-sm border-t border-line pt-6 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-blush hover:shadow-[0_24px_40px_-28px_rgba(33,26,23,0.28)] focus-visible:-translate-y-1.5 focus-visible:border-blush focus-visible:shadow-[0_24px_40px_-28px_rgba(33,26,23,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
            >
              <span className="font-display text-3xl text-line transition-colors duration-300 group-hover:text-blush group-focus-visible:text-blush">
                {String(i + 1).padStart(2, "0")}
              </span>
              <step.icon className="mt-4 h-6 w-6 text-blush transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110" />
              <h3 className="mt-4 font-medium text-ink">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{step.body}</p>
            </Link>
          </li>
        ))}
      </ol>
    </Section>
  );
}
