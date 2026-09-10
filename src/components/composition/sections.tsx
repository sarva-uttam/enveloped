import { Countdown } from "@/components/invite/Countdown";
import { RsvpForm } from "@/components/invite/RsvpForm";
import { MusicToggle } from "@/components/invite/MusicToggle";
import type { CompositionSection } from "@/lib/composition/schema";

/**
 * The trusted section components — Stage 6 (see PROJECT_STATUS.md's
 * Stage 6 section, Part E). "Build simple structural section components
 * only. Visual refinement comes later" — every component here is plain,
 * server-renderable JSX (no "use client") except where it wraps an
 * EXISTING client island unchanged (Countdown/RsvpForm/MusicToggle,
 * already established in Stage 4/5). Each component receives only
 * `data` (this section's own, already-Zod-validated payload — never a
 * raw, unvalidated value) and `ctx` (the render context every route
 * builds — see CompositionRenderer.tsx), and returns plain JSX or
 * `null`; none of them ever receives, or needs, a raw database row.
 *
 * Nine of these (opening/greeting/welcome/dateTime/schedule/gallery/
 * rsvp/music/closing) are close structural ports of the pre-Stage-6
 * `PublicInviteView.tsx` (deleted this stage — see PROJECT_STATUS.md) —
 * same visible text, same conditions, same classNames on each section's
 * own content, so a legacy-content invitation (routed through
 * src/lib/composition/legacy-adapter.ts) renders equivalent output to
 * before. NOT necessarily byte-identical DOM: spacing between sections
 * now lives on CompositionRenderer's own AnimateIn wrapper rather than
 * merged into each section's own top-level className the way the old
 * monolithic component did, so there is one extra wrapper `<div>` per
 * section compared to before — invisible to every existing test (none
 * of them assert on DOM nesting depth or a specific class string, only
 * on visible text, ARIA attributes, and section presence/absence) and a
 * deliberate trade-off for a cleaner separation between "where a
 * section sits in the flow" (the renderer's job) and "what a section
 * looks like" (the section component's own job). The other six
 * (intro/story/venue/mapLink/dressCode/customText) are new,
 * intentionally minimal structural blocks — no legacy invitation ever
 * produces them (see the adapter's own header
 * comment), they exist for a REAL, richer composition to use.
 */

export interface SectionRenderContext {
  accent: string;
  soft: string;
  inviteId?: string;
  guestId?: string;
  guestName?: string;
  song?: string;
  /** The actual RSVP security gate — Stage 5's "never enable RSVP for
   *  an unpublished preview" requirement, re-checked HERE regardless of
   *  what a composition's own `rsvp` section says, because a static
   *  composition document has no way to know an invitation's CURRENT
   *  publication state. A composition's rsvp section being `enabled`
   *  is necessary but not sufficient — this is the second, decisive
   *  check. */
  canRsvp: boolean;
}

type SectionProps<T extends CompositionSection["type"]> = {
  data: Extract<CompositionSection, { type: T }>["data"];
  ctx: SectionRenderContext;
};

export function OpeningSection({ data, ctx }: SectionProps<"opening">) {
  return (
    <div className="text-center">
      {data.eyebrow && (
        <span
          className="inline-block rounded-full px-4 py-1 text-[11px] font-medium uppercase tracking-widest"
          style={{ background: ctx.soft, color: ctx.accent }}
        >
          {data.eyebrow}
        </span>
      )}
      <h1 className="mt-6 font-display text-4xl italic leading-tight sm:text-5xl">{data.headline}</h1>
      {data.subheadline && <p className="mt-4 text-lg text-ink-soft">{data.subheadline}</p>}
    </div>
  );
}

/** Deliberately reads guestName from `ctx`, never from `data` — a
 *  section's stored data never carries a specific guest's name (see the
 *  schema's own comment). Renders nothing at all when no guest is
 *  resolved for this request, regardless of the section's `enabled`
 *  flag — the CompositionRenderer already skips a disabled section
 *  entirely, but an ENABLED greeting section with no resolved guest
 *  (the ordinary case for a base, non-personalized link) must still
 *  render nothing, not an empty or broken banner. */
export function GreetingSection({ ctx }: SectionProps<"greeting">) {
  if (!ctx.guestName) return null;
  return (
    <div
      className="mb-8 rounded-2xl border px-5 py-3 text-center text-sm"
      style={{ borderColor: ctx.accent, background: ctx.soft, color: ctx.accent }}
    >
      Dearest {ctx.guestName}, this one is for you.
    </div>
  );
}

export function IntroSection({ data }: SectionProps<"intro">) {
  return (
    <div className="rounded-3xl border border-line bg-paper-raised/80 p-8 text-center">
      <h2 className="font-display text-2xl">{data.title}</h2>
      {data.description && <p className="mt-2 text-ink-soft leading-relaxed">{data.description}</p>}
    </div>
  );
}

export function WelcomeSection({ data }: SectionProps<"welcome">) {
  return (
    <div className="rounded-3xl border border-line bg-paper-raised/80 p-8 text-center backdrop-blur-sm">
      <p className="text-ink-soft leading-relaxed">{data.message}</p>
    </div>
  );
}

export function StorySection({ data }: SectionProps<"story">) {
  return (
    <div className="rounded-3xl border border-line bg-paper-raised/70 p-8 text-left">
      {data.title && <h2 className="font-display text-xl">{data.title}</h2>}
      <p className="mt-2 text-sm text-ink-soft leading-relaxed">{data.body}</p>
    </div>
  );
}

export function ScheduleSection({ data, ctx }: SectionProps<"schedule">) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {data.entries.map((entry) => (
        <div key={entry.id} className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
          <dt className="text-[11px] font-medium uppercase tracking-wide" style={{ color: ctx.accent }}>
            {entry.label}
          </dt>
          <dd className="mt-1 text-sm text-ink">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DateTimeSection({ data, ctx }: SectionProps<"dateTime">) {
  return <Countdown date={data.eventDate} accent={ctx.accent} />;
}

export function VenueSection({ data }: SectionProps<"venue">) {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Venue</div>
      <div className="mt-1 text-sm text-ink">{data.name}</div>
      {data.address && <div className="mt-1 text-sm text-ink-soft">{data.address}</div>}
    </div>
  );
}

export function MapLinkSection({ data, ctx }: SectionProps<"mapLink">) {
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ borderColor: ctx.accent, color: ctx.accent }}
    >
      {data.label}
    </a>
  );
}

export function DressCodeSection({ data }: SectionProps<"dressCode">) {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-center">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Dress Code</div>
      <div className="mt-1 text-sm text-ink">{data.description}</div>
    </div>
  );
}

export function GallerySection({ data }: SectionProps<"gallery">) {
  return (
    <div>
      <div className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft">A few moments</div>
      <div className="grid grid-cols-3 gap-3" aria-hidden="true">
        {data.items.map((item) =>
          item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- structural placeholder only, no image pipeline/upload exists yet
            <img key={item.id} src={item.imageUrl} alt={item.alt} className="aspect-square rounded-xl object-cover" />
          ) : (
            <div key={item.id} className="aspect-square rounded-xl" style={{ background: item.colorFallback || "var(--line)" }} />
          )
        )}
      </div>
    </div>
  );
}

export function RsvpSection({ data, ctx }: SectionProps<"rsvp">) {
  if (!ctx.canRsvp) return null;
  return (
    <div>
      {data.prompt && <p className="mb-2 text-center text-sm text-ink-soft">{data.prompt}</p>}
      <RsvpForm accent={ctx.accent} inviteId={ctx.inviteId} guestId={ctx.guestId} defaultName={ctx.guestName} />
    </div>
  );
}

export function MusicSection({ data, ctx }: SectionProps<"music">) {
  return <MusicToggle song={data.label || ctx.song || "Our song"} accent={ctx.accent} />;
}

export function ClosingSection({ data }: SectionProps<"closing">) {
  return <p className="text-center font-display text-xl italic text-ink-soft">{data.message}</p>;
}

export function CustomTextSection({ data }: SectionProps<"customText">) {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
      {data.heading && <h2 className="font-display text-lg">{data.heading}</h2>}
      <p className="mt-1 text-sm text-ink-soft leading-relaxed">{data.body}</p>
    </div>
  );
}
