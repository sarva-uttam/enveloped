import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { DEMO_INVITES } from "@/lib/demo-invites";
import { getTier } from "@/lib/tiers";

export const metadata = { title: "Templates — Enveloped" };

export default function TemplatesPage() {
  const demos = Object.values(DEMO_INVITES);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="font-display text-5xl">Live templates, by tier</h1>
          <p className="mt-4 text-ink-soft">
            These are full, interactive demo invites — scroll, RSVP, and hear
            what each tier feels like before you commit.
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-28 sm:grid-cols-2">
          {demos.map((demo) => {
            const tier = getTier(demo.tier);
            return (
              <Link
                key={demo.id}
                href={`/invite/${demo.id}`}
                className="group overflow-hidden rounded-3xl border border-line bg-paper-raised transition hover:shadow-lg"
              >
                <div
                  className="flex h-48 flex-col items-center justify-center gap-2 p-6 text-center"
                  style={{ background: tier.softVar }}
                >
                  <span
                    className="text-[11px] font-medium uppercase tracking-widest"
                    style={{ color: tier.colorVar }}
                  >
                    {tier.name}
                  </span>
                  <span className="font-display text-2xl italic">{demo.content.headline}</span>
                  <span className="text-xs text-ink-soft">{demo.content.subheadline}</span>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-sm text-ink-soft">{tier.tagline}</span>
                  <ArrowUpRight className="h-4 w-4 text-ink-soft transition group-hover:text-ink" />
                </div>
              </Link>
            );
          })}
        </section>
      </main>
      <Footer />
    </>
  );
}
