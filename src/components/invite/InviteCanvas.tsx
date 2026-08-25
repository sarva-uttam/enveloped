"use client";

import { motion } from "framer-motion";
import type { GeneratedInviteContent, TierId } from "@/lib/types";
import { getTier } from "@/lib/tiers";
import { Countdown } from "./Countdown";
import { RsvpForm } from "./RsvpForm";
import { MusicToggle } from "./MusicToggle";
import { OpeningBurst } from "./OpeningBurst";
import { FloatingMotif } from "@/components/site/FloatingMotif";

const PALETTES: Record<TierId, string[]> = {
  bronze: ["#9c6b3e", "#f1e4d3"],
  silver: ["#6b7280", "#eef0f2", "#c26b7a"],
  gold: ["#b8862f", "#f8ecd2", "#c26b7a"],
  platinum: ["#7c3aed", "#b8862f", "#c26b7a", "#f8ecd2"],
};

export function InviteCanvas({
  tier,
  content,
  guestName,
  eventDate,
  song,
  inviteId,
  guestId,
}: {
  tier: TierId;
  content: GeneratedInviteContent;
  guestName?: string;
  eventDate?: string;
  song?: string;
  inviteId?: string;
  guestId?: string;
}) {
  const meta = getTier(tier);
  const accent = meta.colorVar;
  const hasMotion = tier !== "bronze";
  const hasRsvp = tier !== "bronze";
  const hasMusic = tier === "gold" || tier === "platinum";
  const hasGallery = tier === "gold" || tier === "platinum";
  const isPlatinum = tier === "platinum";

  const Wrap = hasMotion ? motion.div : "div";
  const enter = hasMotion
    ? { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.6 } }
    : {};

  return (
    <div className="relative overflow-hidden bg-paper">
      {isPlatinum && <OpeningBurst colors={PALETTES.platinum} />}
      {(isPlatinum || tier === "gold") && (
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <FloatingMotif count={isPlatinum ? 20 : 10} />
        </div>
      )}

      <div className="relative mx-auto max-w-2xl px-6 py-20">
        {guestName && (
          <div
            className="mb-8 rounded-2xl border px-5 py-3 text-center text-sm"
            style={{ borderColor: accent, background: meta.softVar, color: accent }}
          >
            Dearest {guestName}, this one is for you.
          </div>
        )}

        <Wrap {...enter} className="text-center">
          <span
            className="inline-block rounded-full px-4 py-1 text-[11px] font-medium uppercase tracking-widest"
            style={{ background: meta.softVar, color: accent }}
          >
            {meta.name} Invitation
          </span>
          <h1 className="mt-6 font-display text-4xl italic leading-tight sm:text-5xl">
            {content.headline}
          </h1>
          <p className="mt-4 text-lg text-ink-soft">{content.subheadline}</p>
        </Wrap>

        <Wrap {...enter} className="mt-12 rounded-3xl border border-line bg-paper-raised/80 p-8 text-center backdrop-blur-sm">
          <p className="text-ink-soft leading-relaxed">{content.welcomeMessage}</p>
        </Wrap>

        {eventDate && tier !== "bronze" && (
          <Wrap {...enter} className="mt-12">
            <Countdown date={eventDate} accent={accent} />
          </Wrap>
        )}

        <Wrap {...enter} className="mt-12 grid gap-3 sm:grid-cols-2">
          {content.eventDetails.map((d) => (
            <div key={d.label} className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
                {d.label}
              </div>
              <div className="mt-1 text-sm text-ink">{d.value}</div>
            </div>
          ))}
        </Wrap>

        {hasGallery && (
          <Wrap {...enter} className="mt-12">
            <div className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              A few moments
            </div>
            <div className="grid grid-cols-3 gap-3">
              {content.suggestedPalette.concat(content.suggestedPalette).slice(0, 6).map((c, i) => (
                <div key={i} className="aspect-square rounded-xl" style={{ background: c }} />
              ))}
            </div>
          </Wrap>
        )}

        {hasRsvp && (
          <Wrap {...enter} className="mt-14">
            <RsvpForm accent={accent} inviteId={inviteId} guestId={guestId} defaultName={guestName} />
          </Wrap>
        )}

        <Wrap {...enter} className="mt-16 text-center">
          <p className="font-display text-xl italic text-ink-soft">{content.closingLine}</p>
        </Wrap>
      </div>

      {hasMusic && <MusicToggle song={song || "Our song"} accent={accent} />}
    </div>
  );
}
