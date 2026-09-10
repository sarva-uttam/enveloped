import { z } from "zod";
import { EVENT_CATEGORIES } from "../categories";
import { LOCALES } from "../i18n/translations";
import { EVENT_TYPE_IDS } from "./event-types";
import { CULTURAL_PACK_IDS } from "./cultural-packs";
import { PALETTE_IDS } from "./theme";

/**
 * The versioned, strict composition schema — Stage 6 (2026-09-10, see
 * PROJECT_STATUS.md's Stage 6 section, Part B). This is the ONE
 * validated shape every invitation's `composition` column must conform
 * to before it is ever rendered:
 *
 *   Structured invitation data → VALIDATED COMPOSITION → trusted
 *   component registry → server-rendered invitation.
 *
 * Never generate or store arbitrary executable HTML, CSS, or
 * JavaScript — enforced structurally throughout this file, not by
 * convention: every free-text field runs through `safeText()` (rejects
 * angle brackets outright, so no tag of any kind can ever survive
 * validation, and rejects `javascript:`/inline-event-handler-looking
 * substrings as defense in depth); every URL runs through `safeUrl()`
 * (protocol allowlist, never `javascript:`/`data:`/anything else);
 * every "which visual treatment" choice (palette, motif, motion,
 * cultural pack, section type itself) is a closed `z.enum(...)` built
 * from a trusted TypeScript registry, never a free string a database
 * row could smuggle an arbitrary component/class/URL through as. There
 * is no field anywhere in this schema whose value is ever interpreted
 * as markup, a stylesheet, or code.
 *
 * `.strict()` on every object schema — an unknown key doesn't get
 * silently stripped (zod's default), it FAILS validation outright:
 * "reject unknown dangerous fields," not "ignore fields we didn't
 * expect."
 */

// ---------------------------------------------------------------------
// Limits — Part B: "define sensible limits for text lengths; number of
// sections; event entries; links; gallery items; theme values; animation
// choices." Centralized here so every section schema below draws from
// the same numbers, and composition.test.ts can assert against them
// directly instead of hardcoding a second copy.
// ---------------------------------------------------------------------

export const LIMITS = {
  shortText: 200,
  mediumText: 600,
  longText: 2000,
  maxSections: 24,
  maxScheduleEntries: 12,
  maxGalleryItems: 12,
} as const;

// ---------------------------------------------------------------------
// Safe primitives
// ---------------------------------------------------------------------

/** Rejects any angle bracket outright — the single cheapest, most
 *  reliable way to guarantee no HTML tag (of any kind, open or self-
 *  closing, known or invented) can ever survive into a stored
 *  composition. Also rejects an inline `javascript:`-looking substring
 *  and inline event-handler syntax (`onclick=`, `onerror=`, ...) as
 *  defense in depth for text that might later be used in an href-like
 *  context by mistake — the actual URL fields below have their own,
 *  stricter protocol allowlist regardless. */
function safeText(maxLen: number, minLen = 1) {
  return z
    .string()
    .trim()
    .min(minLen)
    .max(maxLen)
    .refine((v) => !/[<>]/.test(v), { message: "must not contain HTML" })
    .refine((v) => !/javascript:/i.test(v), { message: "must not contain a script URL" })
    .refine((v) => !/\bon[a-z]+\s*=/i.test(v), { message: "must not contain inline event-handler syntax" });
}

const ALLOWED_URL_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"]);

/** A same-origin-safe relative path, or an absolute URL using one of a
 *  small allowlisted set of protocols — never `javascript:`, `data:`,
 *  `vbscript:`, or anything else. Used for the one field this schema
 *  ever treats as a destination a guest's browser navigates to
 *  (mapLink.url) or loads a resource from (gallery.imageUrl). */
function isSafeUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true; // internal path
  try {
    const url = new URL(value);
    return ALLOWED_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.shortText)
  .refine(isSafeUrl, { message: "must be an internal path or an http(s)/mailto/tel URL" });

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part F) — stricter
 * than `isSafeUrl()` above: audio is fetched and played automatically
 * by the browser the moment a guest presses play, with no further
 * per-request review, so this narrows the allowlist to `https:` only
 * (never plain `http:`, which `safeUrl` still allows for a map link a
 * human clicks through) plus the same internal-relative-path
 * allowance — used for this project's own local/test fixtures (see
 * public/audio/README.md), never a real production track, which
 * should always be an external, trusted HTTPS source.
 */
function isSafeAudioUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true; // internal path (local/test fixtures only)
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const safeAudioUrl = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.shortText)
  .refine(isSafeAudioUrl, { message: "must be an internal path or an https:// URL" });

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;
const hexColor = z.string().regex(HEX_COLOR_PATTERN, { message: "must be a hex color" });

/** Stable section/element ids — never used to build a URL, a DOM query,
 *  or an import path, but kept conservative regardless: lowercase
 *  letters/digits/hyphens only, must start with a letter or digit. */
const safeSlug = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, { message: "must be a lowercase-hyphen id" });

// ---------------------------------------------------------------------
// Shared allowlists — Zod enums built directly from trusted TypeScript
// registries (never a hand-duplicated list) — "future pack identifiers
// cannot be falsely selected before registration" holds structurally:
// z.enum() rejects anything not in the array it was built from, and
// that array IS the registry.
// ---------------------------------------------------------------------

const eventCategoryEnum = z.enum(EVENT_CATEGORIES.map((c) => c.id) as [string, ...string[]]);
const localeEnum = z.enum(LOCALES.map((l) => l.code) as [string, ...string[]]);
const eventTypeIdEnum = z.enum(EVENT_TYPE_IDS);
const culturalPackIdEnum = z.enum(CULTURAL_PACK_IDS);
const paletteIdEnum = z.enum(PALETTE_IDS);
const dirEnum = z.enum(["ltr", "rtl", "auto"]);
// Note: motifId/motionId (the cultural pack's own OWN choice of
// decorative treatment — see cultural-packs.ts's CulturalPackDefinition)
// are NOT part of the composition document itself, deliberately — a
// composition only ever carries `featureConfig.ambientMotif` (below),
// which a pack's motifId/motionId informs when a draft is first built
// (composition-admin.server.ts's buildCompositionFromPack()) but which
// remains independently editable afterward. There is accordingly no
// motifEnum/motionEnum here to validate against — only ambientMotifEnum.
const ambientMotifEnum = z.enum(["none", "light", "full"]);

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part B) — the
 * TRUSTED motion preset vocabulary. A section (or the envelope-opening
 * sequence) only ever NAMES one of these eight fixed identifiers;
 * it never supplies actual Framer Motion configuration (durations,
 * easings, transform values) itself — "do not accept arbitrary Framer
 * Motion configuration from stored composition data." Each name is
 * resolved to a real, hand-authored animation definition only by
 * trusted application code (src/lib/motion/presets.ts), the same
 * closed-registry pattern already used for palette/motif/pack ids.
 * `"none"` means exactly that: render the final state immediately, no
 * animation at all (this is also what every preset degrades to when the
 * viewer prefers reduced motion — see src/lib/motion/useReducedMotion.ts,
 * checked by AnimateIn.tsx / StaggeredSchedule.tsx / EnvelopeOpening.tsx /
 * AtmosphericEffect.tsx).
 */
export const MOTION_PRESETS = ["none", "fade", "rise", "scale", "ceremonial", "stagger", "petals", "glow"] as const;
export type MotionPresetId = (typeof MOTION_PRESETS)[number];
const motionPresetEnum = z.enum(MOTION_PRESETS);

// ---------------------------------------------------------------------
// Trusted section types — Part B's starting vocabulary. Each is a
// discriminated-union member: a stable `type` literal (the ONLY thing
// the renderer registry ever keys off), `id` (stable, author-assigned),
// `enabled` (explicit on/off — a disabled section is validated the same
// as an enabled one, but never rendered), a `motionPreset` (Stage 7 —
// which TRUSTED reveal preset this section uses; defaults to "fade" so
// every pre-Stage-7 composition — none of which ever set this field —
// parses unchanged), and a `data` payload specific to that type.
// `.strict()` throughout — an extra key anywhere in any section fails
// validation, it is never silently dropped.
// ---------------------------------------------------------------------

const SectionBase = { id: safeSlug, enabled: z.boolean(), motionPreset: motionPresetEnum.default("fade") };

const OpeningSection = z
  .object({
    ...SectionBase,
    type: z.literal("opening"),
    data: z
      .object({
        eyebrow: safeText(60).optional(),
        headline: safeText(160),
        subheadline: safeText(LIMITS.shortText).optional(),
      })
      .strict(),
  })
  .strict();

const GreetingSection = z
  .object({
    ...SectionBase,
    type: z.literal("greeting"),
    // Deliberately carries NO guest name or other per-guest data — a
    // composition is one shared document for every viewer of an
    // invitation; personalization is injected at render time from the
    // already-resolved, per-request guest context (see
    // src/lib/composition/resolve.ts), never baked into stored JSON.
    data: z.object({}).strict(),
  })
  .strict();

const IntroSection = z
  .object({
    ...SectionBase,
    type: z.literal("intro"),
    data: z
      .object({
        title: safeText(160),
        description: safeText(LIMITS.mediumText).optional(),
      })
      .strict(),
  })
  .strict();

const WelcomeSection = z
  .object({
    ...SectionBase,
    type: z.literal("welcome"),
    data: z.object({ message: safeText(LIMITS.mediumText) }).strict(),
  })
  .strict();

const StorySection = z
  .object({
    ...SectionBase,
    type: z.literal("story"),
    data: z
      .object({
        title: safeText(160).optional(),
        body: safeText(LIMITS.longText),
      })
      .strict(),
  })
  .strict();

const ScheduleEntry = z
  .object({
    id: safeSlug,
    eventTypeId: eventTypeIdEnum.nullable(),
    label: safeText(120),
    value: safeText(LIMITS.shortText),
  })
  .strict();

const ScheduleSection = z
  .object({
    ...SectionBase,
    type: z.literal("schedule"),
    data: z
      .object({
        entries: z.array(ScheduleEntry).min(1).max(LIMITS.maxScheduleEntries),
      })
      .strict(),
  })
  .strict();

const DateTimeSection = z
  .object({
    ...SectionBase,
    type: z.literal("dateTime"),
    data: z
      .object({
        // ISO 8601 — validated as a real, parseable date rather than an
        // arbitrary string, since this drives a live countdown. Accepts
        // a `Z`, a numeric offset, OR a bare local wall-clock time
        // (`2027-03-06T17:00:00`) — the last is what the survey flow and
        // the demo fixtures actually produce (an event's local time,
        // with no zone attached), so rejecting it would silently break
        // every real self-service invitation with an event date.
        eventDate: z.iso.datetime({ offset: true, local: true }),
        label: safeText(80).optional(),
      })
      .strict(),
  })
  .strict();

const VenueSection = z
  .object({
    ...SectionBase,
    type: z.literal("venue"),
    data: z
      .object({
        name: safeText(160),
        address: safeText(LIMITS.mediumText).optional(),
      })
      .strict(),
  })
  .strict();

const MapLinkSection = z
  .object({
    ...SectionBase,
    type: z.literal("mapLink"),
    data: z.object({ label: safeText(80), url: safeUrl }).strict(),
  })
  .strict();

const DressCodeSection = z
  .object({
    ...SectionBase,
    type: z.literal("dressCode"),
    data: z.object({ description: safeText(LIMITS.mediumText) }).strict(),
  })
  .strict();

const GalleryItem = z
  .object({
    id: safeSlug,
    imageUrl: safeUrl.nullable(),
    alt: safeText(160),
    colorFallback: hexColor.optional(),
  })
  .strict();

const GallerySection = z
  .object({
    ...SectionBase,
    type: z.literal("gallery"),
    data: z
      .object({
        items: z.array(GalleryItem).min(1).max(LIMITS.maxGalleryItems),
      })
      .strict(),
  })
  .strict();

const RsvpSection = z
  .object({
    ...SectionBase,
    type: z.literal("rsvp"),
    data: z.object({ prompt: safeText(160).optional() }).strict(),
  })
  .strict();

/**
 * Stage 7 (Part F) — real, safe music configuration. Every field here
 * is a plain, bounded, validated value — never unrestricted embed HTML,
 * never a raw `<audio>`/`<iframe>` tag, never a third-party embed URL
 * (Spotify/Apple Music/YouTube players are exactly the kind of
 * unrestricted embed this schema forbids; only a direct, playable
 * audio file URL is accepted). `src: null` (the default — every
 * pre-Stage-7 composition, which never set this field, parses with no
 * source at all) means "no track" — src/components/experience/AudioPlayer.tsx
 * renders NOTHING in that case, never a fake/disabled-looking control.
 * `label` (pre-Stage-7) is kept for backward compatibility with
 * already-adapted legacy content; `title`/`credit` are the Stage 7
 * additions actually shown by the real player.
 */
const MusicSection = z
  .object({
    ...SectionBase,
    type: z.literal("music"),
    data: z
      .object({
        label: safeText(80).optional(),
        src: safeAudioUrl.nullable().default(null),
        title: safeText(120).nullable().default(null),
        /** Artist/rights-holder credit — required by this project's own
         *  convention (not by the schema itself) whenever `src` is set
         *  to a real external track, since the owner/client is the one
         *  attesting they hold the rights to use it; not enforced here
         *  as a hard constraint because a trusted, license-free local
         *  test fixture (see public/audio/README.md) has nothing
         *  meaningful to credit. */
        credit: safeText(120).nullable().default(null),
        loop: z.boolean().default(false),
        /** A bounded, safe starting volume — never full 1.0 by default,
         *  never negative, never unbounded. */
        startVolume: z.number().min(0).max(1).default(0.6),
      })
      .strict(),
  })
  .strict();

const ClosingSection = z
  .object({
    ...SectionBase,
    type: z.literal("closing"),
    data: z.object({ message: safeText(LIMITS.mediumText) }).strict(),
  })
  .strict();

const CustomTextSection = z
  .object({
    ...SectionBase,
    type: z.literal("customText"),
    data: z
      .object({
        heading: safeText(160).optional(),
        body: safeText(LIMITS.longText),
      })
      .strict(),
  })
  .strict();

export const SectionSchema = z.discriminatedUnion("type", [
  OpeningSection,
  GreetingSection,
  IntroSection,
  WelcomeSection,
  StorySection,
  ScheduleSection,
  DateTimeSection,
  VenueSection,
  MapLinkSection,
  DressCodeSection,
  GallerySection,
  RsvpSection,
  MusicSection,
  ClosingSection,
  CustomTextSection,
]);

export type CompositionSection = z.infer<typeof SectionSchema>;
export type SectionType = CompositionSection["type"];

/** Every registry-known section type, derived from the schema itself —
 *  the renderer registry (src/components/composition/registry.ts) is
 *  tested against this exact list so "a type is validated" and "a type
 *  has a registered component" can never silently drift apart. */
export const SECTION_TYPES = SectionSchema.options.map((o) => o.shape.type.value) as SectionType[];

// ---------------------------------------------------------------------
// Top-level composition document
// ---------------------------------------------------------------------

export const COMPOSITION_SCHEMA_VERSION = 1 as const;

const ThemeTokensSchema = z
  .object({
    paletteId: paletteIdEnum,
    /** An optional, still-hex-only override — never a free CSS value,
     *  never a Tailwind class. */
    accentOverride: hexColor.optional(),
  })
  .strict();

const FeatureConfigSchema = z
  .object({
    motion: z.boolean(),
    ambientMotif: ambientMotifEnum,
    openingBurst: z.boolean(),
    /** Stage 7 — whether the envelope-opening sequence
     *  (src/components/experience/EnvelopeOpening.tsx) runs at all for
     *  this invitation. Defaults to true so pre-Stage-7 compositions
     *  (none of which ever set this) opt in automatically; the
     *  experience shell still additionally gates it on `motion` (an
     *  envelope never appears for a no-motion composition) and on the
     *  viewer's own reduced-motion preference regardless of either
     *  flag — see EnvelopeOpening.tsx's own comment. */
    envelopeOpening: z.boolean().default(true),
  })
  .strict();

const WeddingContextSchema = z
  .object({
    occasionId: eventTypeIdEnum.nullable(),
    /** Required exactly when occasionId is "custom" — enforced by the
     *  superRefine below, mirroring the database's own
     *  `invites_occasion_custom_label_requires_custom` CHECK
     *  constraint (belt and braces, same rule enforced twice). */
    occasionCustomLabel: safeText(120).nullable(),
    culturalPackId: culturalPackIdEnum,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.occasionCustomLabel !== null && v.occasionId !== "custom") {
      ctx.addIssue({
        code: "custom",
        message: "occasionCustomLabel may only be set when occasionId is 'custom'",
        path: ["occasionCustomLabel"],
      });
    }
  });

export const InvitationCompositionSchema = z
  .object({
    schemaVersion: z.literal(COMPOSITION_SCHEMA_VERSION),
    /** Reserved for a future templates-table integration (the existing
     *  `templates` catalogue, see PROJECT_STATUS.md's Stage 0 section) —
     *  not validated against a live catalogue yet, since nothing reads
     *  `templates` at runtime today. Always null from every builder in
     *  this stage. */
    templateId: z.string().max(100).nullable(),
    designPackId: culturalPackIdEnum,
    eventCategory: eventCategoryEnum,
    weddingContext: WeddingContextSchema.nullable(),
    locale: localeEnum,
    dir: dirEnum,
    themeTokens: ThemeTokensSchema,
    sections: z.array(SectionSchema).min(1).max(LIMITS.maxSections),
    featureConfig: FeatureConfigSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.sections.forEach((s, i) => {
      if (ids.has(s.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate section id "${s.id}"`, path: ["sections", i, "id"] });
      }
      ids.add(s.id);
    });
  });

export type InvitationComposition = z.infer<typeof InvitationCompositionSchema>;

/**
 * The one entry point every caller should use to turn an unknown value
 * (a raw jsonb column, a proposed admin edit) into a trusted, validated
 * `InvitationComposition` — never `InvitationCompositionSchema.parse()`
 * directly, so every caller gets the same "null on failure, never a
 * thrown exception a route has to remember to catch" contract.
 */
export function parseComposition(value: unknown): InvitationComposition | null {
  const result = InvitationCompositionSchema.safeParse(value);
  return result.success ? result.data : null;
}
