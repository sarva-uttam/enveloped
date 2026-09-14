import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Divider } from "@/components/ui/Divider";

/**
 * Matches the two ACTUAL code paths (src/lib/invitation-admin.server.ts's
 * `generator_kind` gate), not an invented distinction: concierge is
 * staff-built, reviewed by the client via a private preview link, then
 * published by an administrator; self-service is the public survey,
 * paid at checkout, generated instantly. The concierge CTA goes to
 * /consultation, a clearly-labelled "not yet wired up" placeholder — this
 * stage does not build a public request-intake endpoint (see that page's
 * own comment for why).
 */
export function ConciergeVsSelfService() {
  return (
    <Section tone="raised" border="top">
      <SectionHeading
        eyebrow="Two ways to begin"
        title="However hands-on you want to be."
        body="Both paths end in the same place — a beautiful, personal invitation. Only the amount of your own time it takes differs."
      />
      <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className="lg:pr-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-burgundy">Concierge</p>
          <h3 className="mt-2 font-display text-2xl">We build it for you.</h3>
          <ol className="mt-6 space-y-4 text-sm text-ink-soft">
            <li><span className="font-medium text-ink">1. Share your vision.</span> Reach out with the occasion, the story, and the details you already have.</li>
            <li><span className="font-medium text-ink">2. We confirm scope and price.</span> A short back-and-forth before any work begins.</li>
            <li><span className="font-medium text-ink">3. Our team designs and writes it.</span> Composed by hand from your answers, in your chosen cultural style.</li>
            <li><span className="font-medium text-ink">4. You review a private preview.</span> Approve it, or ask for changes — nothing publishes without your sign-off.</li>
            <li><span className="font-medium text-ink">5. We publish and manage the rest.</span> Guest links and RSVP tracking are handled for you.</li>
          </ol>
          <div className="mt-8">
            <Button href="/consultation" variant="secondary" withArrow>
              Request a consultation
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.08} className="lg:border-l lg:border-line lg:pl-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-blush">Self-service</p>
          <h3 className="mt-2 font-display text-2xl">You build it, in minutes.</h3>
          <ol className="mt-6 space-y-4 text-sm text-ink-soft">
            <li><span className="font-medium text-ink">1. Take the survey.</span> Occasion, names, date, vibe — about two minutes.</li>
            <li><span className="font-medium text-ink">2. Choose a tier and pay securely.</span> Bronze to Platinum, priced per invite.</li>
            <li><span className="font-medium text-ink">3. Your invite is generated instantly.</span> Wording and design assembled from your answers.</li>
            <li><span className="font-medium text-ink">4. Publish and manage it yourself.</span> Your dashboard covers guests and RSVPs from there.</li>
          </ol>
          <div className="mt-8">
            <Button href="/survey" variant="primary" withArrow={false}>
              Start my invite
            </Button>
          </div>
        </Reveal>
      </div>
      <Divider className="mt-16" />
    </Section>
  );
}
