import Link from "next/link";
import { ArrowRight, Sparkles, ListChecks, Wand2, Send } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { FloatingMotif } from "@/components/site/FloatingMotif";
import { TeaserDemo } from "@/components/site/TeaserDemo";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { TIERS } from "@/lib/tiers";

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
    title: "AI crafts your invite",
    body: "Our AI writes the wording and assembles your design from your answers — ready to review in under a minute.",
  },
  {
    icon: Send,
    title: "Send the moment",
    body: "Share one link, or send every guest their own personal invite disguised as \"Click me\" — not a wall of gibberish text.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <FloatingMotif count={16} />
          <div className="relative mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              AI-crafted digital invites
            </span>
            <h1 className="mt-8 font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
              Skip the printer.
              <br />
              Send a <span className="italic text-blush">moment</span> instead.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft">
              A digital invite platform built for weddings — and everything
              else worth celebrating. Answer a few questions, let AI write
              and design it, then deliver it as an irresistible &ldquo;click
              me&rdquo; — not a link full of gibberish.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/survey"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
              >
                Start my invite
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised px-7 py-3.5 text-sm font-medium text-ink transition hover:border-ink"
              >
                See templates
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <h2 className="font-display text-3xl sm:text-4xl">How it works</h2>
            <p className="mt-3 text-ink-soft">Four steps between you and a finished invite.</p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-line bg-paper-raised p-6">
                <span className="font-display text-3xl text-line">{String(i + 1).padStart(2, "0")}</span>
                <step.icon className="mt-4 h-6 w-6 text-blush" />
                <h3 className="mt-4 font-medium text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Teaser demo */}
        <section className="border-y border-line bg-paper-raised">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl">
                Not a link. <span className="italic text-blush">An invitation.</span>
              </h2>
              <p className="mt-4 max-w-md text-ink-soft">
                Whoever you send it to — WhatsApp, Instagram, Facebook, even
                Vkontakte — your guest sees a warm, human line. Not
                &ldquo;enveloped.app/x83jf&rdquo;. The link preview and message
                text are yours to write.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-ink-soft">
                <li>&ldquo;There&apos;s a little surprise for you. Click me.&rdquo;</li>
                <li>&ldquo;Sending my best regards. Click me.&rdquo;</li>
                <li>&ldquo;Open when you have a moment.&rdquo;</li>
              </ul>
            </div>
            <TeaserDemo />
          </div>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <h2 className="font-display text-3xl sm:text-4xl">Built for weddings. Ready for anything.</h2>
            <p className="mt-3 text-ink-soft">Pick the occasion closest to yours to start your survey.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EVENT_CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                href={`/survey?category=${cat.id}`}
                className="group flex items-start gap-4 rounded-2xl border border-line bg-paper-raised p-5 transition hover:border-ink hover:shadow-sm"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <div>
                  <div className="font-medium text-ink">{cat.label}</div>
                  <div className="mt-1 text-sm text-ink-soft">{cat.blurb}</div>
                </div>
                <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-line transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            ))}
          </div>
        </section>

        {/* Tier preview */}
        <section className="border-t border-line bg-paper-raised">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="text-center">
              <h2 className="font-display text-3xl sm:text-4xl">Four tiers. One unforgettable option.</h2>
              <p className="mt-3 text-ink-soft">Platinum gives every single guest their own named invite.</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TIERS.map((tier) => (
                <div
                  key={tier.id}
                  className="flex flex-col rounded-2xl border border-line bg-paper p-6"
                  style={{ borderTopColor: tier.colorVar, borderTopWidth: 3 }}
                >
                  <div className="text-sm font-medium uppercase tracking-wide" style={{ color: tier.colorVar }}>
                    {tier.name}
                  </div>
                  <div className="mt-2 font-display text-3xl">${tier.price}</div>
                  <p className="mt-2 text-sm text-ink-soft">{tier.tagline}</p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-xs text-ink-soft">
                    {tier.highlights.slice(0, 3).map((h) => (
                      <li key={h}>· {h}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-sm font-medium transition hover:border-ink"
              >
                Compare all features
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-6 py-28 text-center">
          <h2 className="font-display text-4xl sm:text-5xl">
            Your guests deserve better than a printed card lost in a drawer.
          </h2>
          <Link
            href="/survey"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-8 py-4 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Start my invite <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
