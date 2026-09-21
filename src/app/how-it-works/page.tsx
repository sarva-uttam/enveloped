import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { HowItWorks } from "@/components/site/HowItWorks";
import { ConciergeVsSelfService } from "@/components/site/ConciergeVsSelfService";
import { ClosingCTA } from "@/components/site/ClosingCTA";
import { Section } from "@/components/ui/Section";

export const metadata = { title: "How it works — Enveloped" };

/**
 * Stage 11 — reconciled with the homepage's already-approved How-It-Works
 * treatment instead of keeping a second, plainer description of the same
 * four steps (the two had drifted into inconsistent copy). Now the
 * dedicated page for this topic: the same approved component, plus the
 * fuller concierge-vs-self-service explanation the homepage only teases.
 */
export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-3xl pb-0 pt-20 text-center sm:pt-24">
          <h1 className="font-display text-5xl">How it works</h1>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Whether you want to answer a few questions yourself or hand the
            whole thing to our team, here&apos;s exactly what happens.
          </p>
        </Section>
        <HowItWorks id="how-detail" />
        <ConciergeVsSelfService />
        <ClosingCTA />
      </main>
      <Footer />
    </>
  );
}
