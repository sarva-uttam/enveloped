import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

export const metadata = { title: "How it works — Enveloped" };

const STAGES = [
  {
    title: "1. Tell us the occasion",
    body: "A short survey — the type of event, your names, date, venue, colors, and even the song you want playing in the background. Weddings across every tradition, holidays, vacations, hotel packages — anything worth celebrating.",
  },
  {
    title: "2. Choose a tier",
    body: "Bronze is clean and fast. Platinum is a full cinematic experience with a uniquely named invite generated for every guest on your list.",
  },
  {
    title: "3. AI writes and designs it",
    body: "Your answers go to an AI model that writes warm, tasteful copy and assembles your invite — headline, welcome message, event details, and a matching color palette — in under a minute.",
  },
  {
    title: "4. Deliver it as a moment",
    body: "Share one link for everyone, or — on Platinum — send each guest their own link disguised behind a warm line like \"There's a little surprise for you. Click me.\" No gibberish URLs in the chat preview.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-20">
          <h1 className="font-display text-5xl">How it works</h1>
          <div className="mt-14 space-y-10">
            {STAGES.map((s) => (
              <div key={s.title} className="border-l-2 border-line pl-6">
                <h2 className="font-display text-2xl">{s.title}</h2>
                <p className="mt-2 text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
          <Link
            href="/survey"
            className="mt-14 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Start my invite <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
