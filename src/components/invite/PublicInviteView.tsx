import type { InviteViewModel } from "@/lib/invite-view-model";
import type { TierId } from "@/lib/types";
import { getTier } from "@/lib/tiers";
import { AnimateIn } from "./AnimateIn";
import { Countdown } from "./Countdown";
import { RsvpForm } from "./RsvpForm";
import { MusicToggle } from "./MusicToggle";
import { OpeningBurst } from "./OpeningBurst";
import { FloatingMotif } from "@/components/site/FloatingMotif";

/**
 * Server-rendered invitation content — Stage 4's replacement for the old
 * fully-client `InviteCanvas` (deleted, see PROJECT_STATUS.md's Stage 4
 * section). No "use client" here: this component and everything it
 * renders directly (the headline, welcome message, event details,
 * closing line) is plain JSX that becomes part of the initial HTML
 * whether this is composed from a Server Component (the normal case,
 * src/app/invite/[id]/page.tsx) or, incidentally, from a client one —
 * it has no hooks, no browser APIs, nothing that requires a "use client"
 * boundary. Truly interactive pieces (Countdown, RsvpForm, MusicToggle,
 * OpeningBurst) are imported as their own client islands, unchanged;
 * `AnimateIn` wraps sections that need the existing scroll-reveal
 * animation without pulling framer-motion into this component itself —
 * see AnimateIn.tsx's own comment for why that still keeps the actual
 * CONTENT server-rendered.
 *
 * Accessibility (Stage 4, see PROJECT_STATUS.md — a foundation, not the
 * full redesign): decorative elements (the floating motif, the color
 * swatch gallery) are aria-hidden; event details use a real <dl> so
 * label/value pairs are conveyed to assistive tech, not just visually
 * implied by two stacked <div>s; RSVP's accept/decline buttons expose
 * aria-pressed; interactive controls get a visible focus-visible ring.
 */
const PALETTES: Record<TierId, string[]> = {
  bronze: ["#9c6b3e", "#f1e4d3"],
  silver: ["#6b7280", "#eef0f2", "#c26b7a"],
  gold: ["#b8862f", "#f8ecd2", "#c26b7a"],
  platinum: ["#7c3aed", "#b8862f", "#c26b7a", "#f8ecd2"],
};

export function PublicInviteView({ model }: { model: InviteViewModel }) {
  const { tier, content, guestName, eventDate, song, inviteId, guestId } = model;
  const meta = getTier(tier);
  const accent = meta.colorVar;
  const hasMotion = tier !== "bronze";
  // Stage 5 (see PROJECT_STATUS.md): gated on model.isPublished, not
  // just tier — "never enable RSVP for an unpublished preview." This is
  // a no-op change for every pre-Stage-5 caller (the public route's
  // buildPublicInviteViewModel() and demo's buildDemoInviteViewModel()
  // both always set isPublished: true), and is what makes an unpublished
  // invitation viewed via a private preview token, or by its own owner
  // before publication, correctly omit RSVP entirely rather than show a
  // form that would only fail server-side anyway.
  const hasRsvp = tier !== "bronze" && model.isPublished;
  const hasMusic = tier === "gold" || tier === "platinum";
  const hasGallery = tier === "gold" || tier === "platinum";
  const isPlatinum = tier === "platinum";

  return (
    <div className="relative overflow-hidden bg-paper">
      {isPlatinum && <OpeningBurst colors={PALETTES.platinum} />}
      {(isPlatinum || tier === "gold") && (
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
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

        <AnimateIn active={hasMotion} className="text-center">
          <span
            className="inline-block rounded-full px-4 py-1 text-[11px] font-medium uppercase tracking-widest"
            style={{ background: meta.softVar, color: accent }}
          >
            {meta.name} Invitation
          </span>
          <h1 className="mt-6 font-display text-4xl italic leading-tight sm:text-5xl">{content.headline}</h1>
          <p className="mt-4 text-lg text-ink-soft">{content.subheadline}</p>
        </AnimateIn>

        <AnimateIn
          active={hasMotion}
          className="mt-12 rounded-3xl border border-line bg-paper-raised/80 p-8 text-center backdrop-blur-sm"
        >
          <p className="text-ink-soft leading-relaxed">{content.welcomeMessage}</p>
        </AnimateIn>

        {eventDate && tier !== "bronze" && (
          <AnimateIn active={hasMotion} className="mt-12">
            <Countdown date={eventDate} accent={accent} />
          </AnimateIn>
        )}

        <AnimateIn active={hasMotion} className="mt-12">
          <dl className="grid gap-3 sm:grid-cols-2">
            {content.eventDetails.map((d) => (
              <div key={d.label} className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
                <dt className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
                  {d.label}
                </dt>
                <dd className="mt-1 text-sm text-ink">{d.value}</dd>
              </div>
            ))}
          </dl>
        </AnimateIn>

        {hasGallery && (
          <AnimateIn active={hasMotion} className="mt-12">
            <div className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              A few moments
            </div>
            <div className="grid grid-cols-3 gap-3" aria-hidden="true">
              {content.suggestedPalette
                .concat(content.suggestedPalette)
                .slice(0, 6)
                .map((c, i) => (
                  <div key={i} className="aspect-square rounded-xl" style={{ background: c }} />
                ))}
            </div>
          </AnimateIn>
        )}

        {hasRsvp && (
          <AnimateIn active={hasMotion} className="mt-14">
            <RsvpForm accent={accent} inviteId={inviteId} guestId={guestId} defaultName={guestName} />
          </AnimateIn>
        )}

        <AnimateIn active={hasMotion} className="mt-16 text-center">
          <p className="font-display text-xl italic text-ink-soft">{content.closingLine}</p>
        </AnimateIn>
      </div>

      {hasMusic && <MusicToggle song={song || "Our song"} accent={accent} />}
    </div>
  );
}
