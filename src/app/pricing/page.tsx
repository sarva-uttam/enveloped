import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { TIERS, TIER_FEATURE_MATRIX, tierIncludes } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing — Enveloped" };

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="font-display text-5xl">Pricing</h1>
          <p className="mt-4 text-ink-soft">
            Every tier includes a fully designed, mobile-ready invite. Higher
            tiers add motion, sound, AI personalization, and — at Platinum —
            a uniquely named invite for every guest on your list.
          </p>
        </section>

        <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col rounded-3xl border bg-paper-raised p-7",
                tier.id === "platinum" ? "border-platinum shadow-lg" : "border-line"
              )}
            >
              {tier.id === "platinum" && (
                <span className="mb-4 inline-block w-fit rounded-full bg-platinum-soft px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-platinum">
                  Most immersive
                </span>
              )}
              <div className="text-sm font-medium uppercase tracking-wide" style={{ color: tier.colorVar }}>
                {tier.name}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl">${tier.price}</span>
                <span className="text-sm text-ink-soft">/ invite</span>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{tier.description}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {tier.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tier.colorVar }} />
                    <span className="text-ink-soft">{h}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/survey?tier=${tier.id}`}
                className={cn(
                  "mt-7 rounded-full px-5 py-3 text-center text-sm font-medium transition",
                  tier.id === "platinum"
                    ? "bg-ink text-paper hover:bg-ink-soft"
                    : "border border-line hover:border-ink"
                )}
              >
                Choose {tier.name}
              </Link>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-28">
          <h2 className="font-display text-2xl">Compare every feature</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-raised">
                  <th className="p-4 text-left font-medium text-ink-soft">Feature</th>
                  {TIERS.map((t) => (
                    <th key={t.id} className="p-4 text-center font-medium" style={{ color: t.colorVar }}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_FEATURE_MATRIX.map((feature, idx) => (
                  <tr key={feature.label} className={idx % 2 === 0 ? "bg-paper" : "bg-paper-raised"}>
                    <td className="p-4 text-ink-soft">{feature.label}</td>
                    {TIERS.map((t) => (
                      <td key={t.id} className="p-4 text-center">
                        {tierIncludes(t.id, feature.includedFrom) ? (
                          <Check className="mx-auto h-4 w-4" style={{ color: t.colorVar }} />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-line" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            Want a feature that isn&apos;t listed — a custom animation, a
            specific ritual sequence, multilingual wording? Custom add-ons
            are available exclusively on Platinum.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
