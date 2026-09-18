import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Section } from "@/components/ui/Section";

export const metadata = { title: "Terms — Enveloped" };

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-2xl py-20">
          <h1 className="font-display text-4xl">Terms</h1>
          <p className="mt-6 text-sm italic text-ink-soft">
            Enveloped is an early-stage product. This page is a plain-
            language placeholder, not a substitute for a formal legal
            terms-of-service document, which will replace it before the
            product is generally available.
          </p>
          <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft">
            <p>
              Self-service pricing is shown upfront on the Pricing page
              before you pay. Paying for an invite does not automatically
              publish it — you (or, for concierge work, you and our team
              together) confirm it&apos;s ready first.
            </p>
            <p>
              You&apos;re responsible for the accuracy of the event details
              and wording you provide, and for having the right to share any
              names, photos, or music you include in your invitation.
            </p>
            <p>
              Questions about these terms can be directed to us through
              whichever channel you already use to reach our team.
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
