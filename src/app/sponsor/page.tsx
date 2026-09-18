import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Section } from "@/components/ui/Section";

export const metadata = { title: "Sponsor us — Enveloped" };

export default function SponsorPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-2xl py-24 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-burgundy">Sponsorship</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Have your name featured on our wall</h1>
          <p className="mt-5 text-ink-soft">
            The sponsor belt on our homepage is currently filled with
            placeholder names — we haven&apos;t partnered with anyone yet.
            If that sounds like something your brand would want to be part
            of as Enveloped grows, we&apos;d like to hear from you.
          </p>
          <div className="mt-10 rounded-sm border border-dashed border-line bg-paper-raised p-8">
            <p className="font-medium text-ink">Sponsorship inquiries aren&apos;t connected yet.</p>
            <p className="mt-2 text-sm text-ink-soft">
              This page will carry a real inquiry form soon. No sponsorship
              payments are processed through Enveloped today.
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
