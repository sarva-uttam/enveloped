import type { InviteViewModel } from "../invite-view-model";
import { getTier } from "../tiers";
import type { InvitationComposition, CompositionSection } from "./schema";
import { COMPOSITION_SCHEMA_VERSION, parseComposition } from "./schema";

/**
 * The legacy adapter — Stage 6 (2026-09-10, see PROJECT_STATUS.md's
 * Stage 6 section, Part F). Turns the pre-composition `InviteViewModel`
 * shape (Stage 4/5 — `content`/`tier`/`eventDate`/`song`, still built
 * from every non-composition invitation: self-service, demo, or any row
 * whose `composition` column is still null) into a real, schema-
 * validated `InvitationComposition`, so every invitation — old or new —
 * flows through the exact same trusted renderer registry
 * (src/components/composition/CompositionRenderer.tsx).
 *
 * THIS FILE IS DELIBERATELY TEMPORARY. It exists only because existing
 * rows have no `composition` of their own to read — every self-service
 * invite created before this stage, and every one the current `/survey`
 * flow still creates today, has `content` (a `GeneratedInviteContent`)
 * but `composition: null`. Once a real composition-authoring surface
 * (Stage 7+, not built here — see PROJECT_STATUS.md's "Recommended
 * Stage 7 scope") writes actual compositions for these invitations (or
 * `/survey` itself is changed to synthesize one at creation time), this
 * adapter becomes unnecessary for THOSE rows — it is not, and must never
 * become, a second rendering path competing with the real one; it only
 * ever produces the same `InvitationComposition` shape everything else
 * consumes.
 *
 * MAPPING (legacy field → composition section), preserving Stage 4/5's
 * exact rendered output for every existing test fixture and real
 * invitation:
 *   - content.headline/subheadline + tier name → "opening" section
 *     (always present, always enabled).
 *   - guestName (when resolved) → a "greeting" section — carries no
 *     data of its own (see GreetingSection's own schema comment); its
 *     mere presence/absence is the toggle, personalization is injected
 *     at render time from context, never stored.
 *   - content.welcomeMessage → "welcome" (always present).
 *   - eventDate, when set AND tier !== "bronze" → "dateTime" (drives the
 *     Countdown), matching the exact pre-Stage-6 condition
 *     `eventDate && tier !== "bronze"`.
 *   - content.eventDetails → "schedule" (always present — matches the
 *     unconditional `<dl>` block that always rendered before,
 *     regardless of tier).
 *   - content.suggestedPalette, when tier is gold/platinum → "gallery",
 *     as color-swatch-only items (imageUrl: null, colorFallback: the
 *     hex value) — exactly reproducing the pre-Stage-6 swatch grid, not
 *     a real photo gallery (none exists yet — "gallery placeholder").
 *   - RSVP, when tier !== "bronze" AND isPublished → "rsvp" — the exact
 *     pre-Stage-6 `hasRsvp` condition, preserved exactly (Stage 5's
 *     "never enable RSVP for an unpublished preview" requirement flows
 *     through unchanged).
 *   - musicSrc (Stage 7 — a real playable URL; today only ever set on
 *     the `demo-platinum` demo invite) → "music" with that source. Every
 *     other legacy/self-service invitation has no playable audio URL
 *     anywhere, so NO music section is produced for it — the pre-Stage-7
 *     always-present but always-fake "Play our song" toggle is gone for
 *     them (see the `hasMusic` comment below and PROJECT_STATUS.md's
 *     Stage 7 "Remaining design issues").
 *   - content.closingLine → "closing" (always present).
 * NOT synthesized from legacy content at all (no legacy field maps to
 * them): "intro", "story", "venue", "mapLink", "dressCode",
 * "customText" — these are only ever populated by a REAL composition
 * (see PROJECT_STATUS.md's Stage 6 section for confirmation these are
 * registered and tested even though the adapter never emits them).
 *
 * Feature flags (motion/ambientMotif/openingBurst) map from tier
 * exactly as the pre-Stage-6 `hasMotion`/`isPlatinum`/gold-or-platinum
 * checks did.
 *
 * Malformed legacy content fails safely: adaptLegacyContentToComposition()
 * always builds a schema-conformant object (it controls every field
 * itself, there's no user input it blindly trusts into the shape), then
 * runs it back through parseComposition() before returning — if that
 * somehow fails (a defensive check, not an expected path), this returns
 * `null` rather than a partially-built or unsafe object, and the caller
 * (src/lib/composition/resolve.ts) treats that exactly like "no
 * composition available" — never a crash, never a fallback to raw,
 * unvalidated legacy rendering.
 */
export function adaptLegacyContentToComposition(model: InviteViewModel): InvitationComposition | null {
  const { content, tier, guestName, eventDate, song, musicSrc, isDemo, isPublished } = model;
  const meta = getTier(tier);
  const hasMotion = tier !== "bronze";
  const hasGallery = tier === "gold" || tier === "platinum";
  // Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part F): a music
  // section is emitted ONLY when there is a real, playable source —
  // `model.musicSrc`, which is set for exactly one thing today, the
  // `demo-platinum` demo invite pointing at this project's own
  // synthesized test tone (public/audio/README.md). No real
  // self-service or legacy invitation has ever stored a playable audio
  // URL anywhere, so for every one of them this is `undefined` and no
  // music section is produced at all — the old, always-present but
  // always-fake "Play our song" toggle is simply gone for them.
  const hasMusic = Boolean(musicSrc);
  const hasRsvp = tier !== "bronze" && isPublished;
  const hasDateTime = Boolean(eventDate) && tier !== "bronze";

  // Stage 7 (Part E) — each section gets a deliberate, TRUSTED
  // motionPreset (src/lib/composition/schema.ts's MOTION_PRESETS,
  // resolved by src/lib/motion/presets.ts): a "ceremonial" settle for
  // the opening moment, "stagger" for the schedule (its own component
  // additionally staggers the individual entries), "petals" for the
  // ambient gallery, "glow" for the soft close — never arbitrary
  // animation config, just a name from a fixed list. Every one of these
  // still degrades to an instant, fully-visible render under reduced
  // motion or a no-motion composition (AnimateIn.tsx).
  const sections: CompositionSection[] = [];

  sections.push({
    id: "opening",
    type: "opening",
    enabled: true,
    motionPreset: "ceremonial",
    data: { eyebrow: `${meta.name} Invitation`, headline: content.headline, subheadline: content.subheadline },
  });

  if (guestName) {
    sections.push({ id: "greeting", type: "greeting", enabled: true, motionPreset: "fade", data: {} });
  }

  sections.push({
    id: "welcome",
    type: "welcome",
    enabled: true,
    motionPreset: "fade",
    data: { message: content.welcomeMessage },
  });

  if (hasDateTime && eventDate) {
    sections.push({
      id: "date-time",
      type: "dateTime",
      enabled: true,
      motionPreset: "rise",
      data: { eventDate },
    });
  }

  sections.push({
    id: "schedule",
    type: "schedule",
    enabled: true,
    motionPreset: "stagger",
    data: {
      entries: content.eventDetails.map((d, i) => ({
        id: `schedule-${i}`,
        eventTypeId: null,
        label: d.label,
        value: d.value,
      })),
    },
  });

  if (hasGallery) {
    sections.push({
      id: "gallery",
      type: "gallery",
      enabled: true,
      motionPreset: "petals",
      data: {
        items: content.suggestedPalette
          .concat(content.suggestedPalette)
          .slice(0, 6)
          .map((c, i) => ({ id: `gallery-${i}`, imageUrl: null, alt: "A color from this invitation's palette", colorFallback: c })),
      },
    });
  }

  if (hasRsvp) {
    sections.push({ id: "rsvp", type: "rsvp", enabled: true, motionPreset: "rise", data: {} });
  }

  if (hasMusic && musicSrc) {
    sections.push({
      id: "music",
      type: "music",
      enabled: true,
      motionPreset: "none",
      data: { src: musicSrc, title: song ?? null, credit: null, loop: false, startVolume: 0.6 },
    });
  }

  sections.push({
    id: "closing",
    type: "closing",
    enabled: true,
    motionPreset: "glow",
    data: { message: content.closingLine },
  });

  const draft = {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    // Legacy content has no real design-pack concept — neutral-classic
    // is the closest honest default; isDemo carries no special meaning
    // here (a demo invite is legacy-content-shaped exactly like a real
    // self-service one).
    designPackId: "neutral-classic" as const,
    eventCategory: "wedding-other" as const,
    weddingContext: null,
    locale: "en" as const,
    dir: "ltr" as const,
    themeTokens: { paletteId: tier },
    sections,
    featureConfig: {
      motion: hasMotion,
      ambientMotif: tier === "platinum" ? ("full" as const) : tier === "gold" ? ("light" as const) : ("none" as const),
      openingBurst: tier === "platinum",
    },
  };

  // isDemo is intentionally unused above beyond documentation — kept as
  // a destructured binding so a future adapter change that DOES need it
  // (e.g. a demo-specific designPackId) doesn't have to re-add the
  // destructure; referenced here only to satisfy the linter without an
  // eslint-disable comment.
  void isDemo;

  return parseComposition(draft);
}
