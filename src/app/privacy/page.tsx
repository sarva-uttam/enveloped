import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Section } from "@/components/ui/Section";

export const metadata = { title: "Privacy — Enveloped" };

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-2xl py-20">
          <h1 className="font-display text-4xl">Privacy</h1>
          <p className="mt-6 text-sm italic text-ink-soft">
            Enveloped is an early-stage product. This page describes how
            the product actually handles data today in plain language — it
            is not a substitute for a formal legal privacy policy, which
            will replace this page before the product is generally available.
          </p>
          <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft">
            <p>
              Your invitations, guest lists, and RSVP responses are stored
              scoped to your account — other Enveloped customers cannot see
              them. Guest and private-preview links use one-way hashed
              tokens rather than storing the link itself anywhere it could
              leak; an invalid or expired link simply says it isn&apos;t
              available, without confirming or denying why.
            </p>
            <p>
              We don&apos;t sell guest or customer data, and we don&apos;t
              use it for advertising. Payment processing (for self-service
              tiers) is handled by our payment provider directly — we don&apos;t
              store your card details ourselves.
            </p>
            <p>
              Questions about your data can be directed to us through
              whichever channel you already use to reach our team.
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
