"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getTier } from "@/lib/tiers";
import type { TierId } from "@/lib/types";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { cn } from "@/lib/utils";

interface GalleryDemo {
  id: string;
  tier: TierId;
  headline: string;
  subheadline: string;
}

const TIER_FILTERS: { id: TierId | "all"; label: string }[] = [
  { id: "all", label: "All tiers" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
];

/**
 * A real filter — every option here always yields at least one genuine
 * demo invite (one exists per tier today), so nothing filters to a false
 * "no results" or implies availability that isn't there.
 */
export function TemplatesGallery({ demos }: { demos: GalleryDemo[] }) {
  const [filter, setFilter] = useState<TierId | "all">("all");
  const visible = filter === "all" ? demos : demos.filter((d) => d.tier === filter);

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filter by tier">
        {TIER_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "focus-ring rounded-full border px-4 py-1.5 text-sm font-medium transition",
              filter === f.id ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {visible.map((demo) => {
          const tier = getTier(demo.tier);
          const isPremium = demo.tier === "gold" || demo.tier === "platinum";
          return (
            <Link
              key={demo.id}
              href={`/invite/${demo.id}`}
              className="focus-ring group overflow-hidden rounded-sm border border-line bg-paper-raised transition hover:shadow-[0_28px_48px_-32px_rgba(33,26,23,0.3)]"
            >
              <div
                className="flex h-52 flex-col items-center justify-center gap-2 p-6 text-center"
                style={{ background: tier.softVar }}
              >
                <span
                  className="text-[11px] font-medium uppercase tracking-widest"
                  style={{ color: tier.colorVar }}
                >
                  {tier.name}
                </span>
                <span className="font-display text-2xl italic">{demo.headline}</span>
                <span className="text-xs text-ink-soft">{demo.subheadline}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-soft">{tier.tagline}</span>
                  {isPremium && <PremiumBadge />}
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-soft transition group-hover:text-ink" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
