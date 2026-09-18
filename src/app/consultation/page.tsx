import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Request a consultation — Enveloped" };

/**
 * Stage 11 — concierge intake today happens entirely out-of-band (an
 * administrator manually creates a `requests` row after a client reaches
 * out via WhatsApp/email/Instagram; src/lib/requests.ts). Building a
 * public request-submission endpoint is new backend surface this
 * design-focused stage explicitly avoids, and this brief separately
 * forbids integrating email/SMS/WhatsApp sending. So this page explains
 * the real process honestly and marks the actual contact channel as not
 * yet connected — the same "clearly labelled placeholder" pattern the
 * brief itself sanctions for the sponsor-belt CTA — rather than
 * fabricating an email address or building a new intake form.
 */
export default function ConsultationPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section innerClassName="max-w-2xl py-24 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-burgundy">Concierge</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Request a consultation</h1>
          <p className="mt-5 text-ink-soft">
            Tell us the occasion, and our team designs and writes your
            invitation for you. You&apos;ll review a private preview and
            approve it before anything ever goes live.
          </p>
          <div className="mt-10 rounded-sm border border-dashed border-line bg-paper-raised p-8">
            <p className="font-medium text-ink">Direct consultation intake isn&apos;t connected yet.</p>
            <p className="mt-2 text-sm text-ink-soft">
              For now, concierge requests are handled directly by our team —
              reach out through whichever channel you already use to talk to
              us, and we&apos;ll take it from there. This page will carry a
              real contact form as soon as it&apos;s ready.
            </p>
          </div>
          <div className="mt-10">
            <Button href="/survey" variant="secondary" withArrow>
              Try the self-service survey instead
            </Button>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
