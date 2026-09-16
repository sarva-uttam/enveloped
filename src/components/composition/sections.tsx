import { Countdown } from "@/components/invite/Countdown";
import { RsvpForm } from "@/components/invite/RsvpForm";
import { AudioPlayer } from "@/components/experience/AudioPlayer";
import { StaggeredSchedule } from "@/components/experience/StaggeredSchedule";
import type { CompositionSection, MotionPresetId } from "@/lib/composition/schema";
import type { TypographyBundle } from "@/lib/composition/typography";
import type { SectionStyleBundle } from "@/lib/composition/section-styles";

/**
 * The trusted section components — Stage 6 (see PROJECT_STATUS.md's
 * Stage 6 section, Part E). "Build simple structural section components
 * only. Visual refinement comes later" — every component here is plain,
 * server-renderable JSX (no "use client") except where it wraps a
 * client island — Countdown/RsvpForm unchanged since Stage 4/5;
 * AudioPlayer, new in Stage 7, replaces the old, non-functional
 * MusicToggle (see MusicSection's own comment below). Each component
 * receives only
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
  /** Stage 7 — the CURRENT section's own trusted motionPreset (set
   *  per-section by CompositionRenderer). Only ScheduleSection actually
   *  reads it, to decide whether to stagger its individual entries; the
   *  outer AnimateIn wrapper consumes the same value independently for
   *  the whole-section reveal. */
  motionPreset: MotionPresetId;
  /** Stage 12 — resolved once per render from
   *  composition.themeTokens.{typographyId,sectionStyleId} by
   *  CompositionRenderer (theme.ts/typography.ts/section-styles.ts's
   *  trusted resolvers), never composition-supplied directly. */
  typography: TypographyBundle;
  style: SectionStyleBundle;
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
          className={`inline-block rounded-full px-4 py-1 ${ctx.typography.eyebrow}`}
          style={{ background: ctx.soft, color: ctx.accent }}
        >
          {data.eyebrow}
        </span>
      )}
      <h1 className={`mt-6 text-4xl leading-tight sm:text-5xl ${ctx.typography.headline}`}>{data.headline}</h1>
      {data.subheadline && <p className={`mt-4 text-lg ${ctx.typography.body}`}>{data.subheadline}</p>}
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

export function IntroSection({ data, ctx }: SectionProps<"intro">) {
  return (
    <div className={`${ctx.style.cardLg} text-center`}>
      <h2 className={`text-2xl ${ctx.typography.headline}`}>{data.title}</h2>
      {data.description && <p className={`mt-2 ${ctx.typography.body}`}>{data.description}</p>}
    </div>
  );
}

export function WelcomeSection({ data, ctx }: SectionProps<"welcome">) {
  return (
    <div className={`${ctx.style.cardLg} text-center`}>
      <p className={ctx.typography.body}>{data.message}</p>
    </div>
  );
}

export function StorySection({ data, ctx }: SectionProps<"story">) {
  return (
    <div className={`${ctx.style.cardLg} text-left`}>
      {data.title && <h2 className={`text-xl ${ctx.typography.headline}`}>{data.title}</h2>}
      <p className={`mt-2 text-sm ${ctx.typography.body}`}>{data.body}</p>
    </div>
  );
}

/**
 * Stage 7 (Part E — "staggered schedule"): the `<dl>` markup is the same
 * server-rendered structure as before; when this section's own
 * motionPreset is "stagger", `StaggeredSchedule` (a client island) adds
 * a per-entry sequential reveal ON TOP of that already-present markup —
 * document order and heading/`<dl>` semantics are untouched, and it
 * degrades to the plain list under reduced motion. Any other preset
 * just renders the plain list (the outer AnimateIn still gives the
 * whole block its reveal).
 */
export function ScheduleSection({ data, ctx }: SectionProps<"schedule">) {
  if (ctx.motionPreset === "stagger") {
    return <StaggeredSchedule entries={data.entries} accent={ctx.accent} />;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {data.entries.map((entry) => (
        <div key={entry.id} className={`${ctx.style.cardSm} text-left`}>
          <dt className={ctx.style.label} style={{ color: ctx.accent }}>
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

export function VenueSection({ data, ctx }: SectionProps<"venue">) {
  return (
    <div className={`${ctx.style.cardSm} text-left`}>
      <div className={ctx.style.label}>Venue</div>
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

export function DressCodeSection({ data, ctx }: SectionProps<"dressCode">) {
  return (
    <div className={`${ctx.style.cardSm} text-center`}>
      <div className={ctx.style.label}>Dress Code</div>
      <div className="mt-1 text-sm text-ink">{data.description}</div>
    </div>
  );
}

export function GallerySection({ data, ctx }: SectionProps<"gallery">) {
  return (
    <div>
      <div className={`mb-3 text-center ${ctx.style.label}`}>A few moments</div>
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

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part F): renders a
 * REAL AudioPlayer only when the section actually carries a trusted
 * `src` — "do not render a fake control when music is unavailable."
 * Every pre-Stage-7 composition (adapted by legacy-adapter.ts from old
 * `content`/`song` data, which never included a playable URL) has
 * `data.src: null` here, so this renders NOTHING for them — a real,
 * deliberate behavior change from the old, always-fake `MusicToggle`,
 * documented in PROJECT_STATUS.md's Stage 7 "Remaining design issues."
 */
export function MusicSection({ data, ctx }: SectionProps<"music">) {
  if (!data.src) return null;
  return (
    <AudioPlayer
      src={data.src}
      title={data.title ?? data.label ?? null}
      credit={data.credit}
      loop={data.loop}
      startVolume={data.startVolume}
      accent={ctx.accent}
    />
  );
}

export function ClosingSection({ data, ctx }: SectionProps<"closing">) {
  return <p className={`text-center text-xl text-ink-soft ${ctx.typography.headline}`}>{data.message}</p>;
}

export function CustomTextSection({ data, ctx }: SectionProps<"customText">) {
  return (
    <div className={`${ctx.style.cardSm} text-left`}>
      {data.heading && <h2 className={`text-lg ${ctx.typography.headline}`}>{data.heading}</h2>}
      <p className={`mt-1 text-sm ${ctx.typography.body}`}>{data.body}</p>
    </div>
  );
}
