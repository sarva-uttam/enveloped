import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { DesignShowcase } from "@/components/site/DesignShowcase";
import { TemplatesGallery } from "@/components/site/TemplatesGallery";
import { DEMO_INVITES } from "@/lib/demo-invites";

export const metadata = { title: "Templates — Enveloped" };

/**
 * Stage 11 rebuild — previously this page only grouped demos by pricing
 * tier, with no cultural-pack framing at all. Leads with the DesignShowcase
 * (the two genuinely-registered cultural packs — see cultural-packs.ts;
 * unbuilt "future packs" are never listed here), then the full live-demo
 * gallery, filterable by tier. Every demo here is a real, working
 * /invite/[id] route, not a static mockup image.
 */
export default function TemplatesPage() {
  const demos = Object.values(DEMO_INVITES).map((demo) => ({
    id: demo.id,
    tier: demo.tier,
    headline: demo.content.headline,
    subheadline: demo.content.subheadline,
  }));

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-3xl pb-0 pt-20 text-center sm:pt-24">
          <h1 className="font-display text-5xl">Live templates</h1>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            These are full, interactive demo invites — scroll, RSVP, and hear
            what each tier and tradition feels like before you commit.
          </p>
        </Section>

        <DesignShowcase />

        <Section border="top">
          <SectionHeading eyebrow="Browse by tier" title="Every tier, live." />
          <div className="mt-14">
            <TemplatesGallery demos={demos} />
          </div>
          <div className="mt-14 text-center">
            <Button href="/survey" variant="primary" withArrow>
              Start my invite
            </Button>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
