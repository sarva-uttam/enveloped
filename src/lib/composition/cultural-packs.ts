import type { EventCategory } from "../types";
import type { EventTypeId } from "./event-types";
import type { PaletteId } from "./theme";

/**
 * The trusted cultural/design-pack registry — Stage 6 (see
 * PROJECT_STATUS.md's Stage 6 section, Part D). A pack is METADATA and
 * STRUCTURAL DEFAULTS only — supported event types, a suggested section
 * order, wording guidance for whoever is authoring copy, motif/palette/
 * motion identifiers (never raw CSS/images), and optional ceremony
 * terminology. It is explicitly NOT final visual artwork (no new colors,
 * illustrations, or fonts are introduced this stage — see theme.ts) and
 * NOT a claim that unfinished packs are "available": only the two packs
 * actually defined below (`CULTURAL_PACKS`) can ever be selected by a
 * composition — `designPackId` in the Zod schema (schema.ts) is a
 * `z.enum` built directly from this registry's own keys, so a pack id
 * that exists only in the "future packs" comment below is REJECTED by
 * validation, not silently accepted — "future pack identifiers cannot
 * be falsely selected before registration" (Part I), proven by
 * cultural-packs.test.ts / schema.test.ts.
 *
 * Deliberately does not hardcode religious claims or sacred wording as
 * universal truth: `wordingGuidance` is guidance FOR an administrator or
 * client authoring copy (never rendered to a guest verbatim, never
 * treated as the invitation's actual content), and
 * `ceremonyTerminology` is a small set of NEUTRAL, commonly-used naming
 * conventions (e.g. "the couple's families" rather than presuming a
 * specific family structure) — all of it remains editable by the
 * administrator and client when authoring a real composition; nothing
 * here is baked into a guest-facing section unless a human explicitly
 * puts it there.
 */

export interface CulturalPackDefinition {
  id: string;
  label: string;
  description: string;
  applicableCategories: EventCategory[];
  supportedEventTypeIds: EventTypeId[];
  suggestedSectionOrder: string[];
  paletteId: PaletteId;
  /** A trusted, closed identifier — never a URL, never markup. Resolved
   *  to an actual visual treatment (or nothing at all) only by trusted
   *  application code, exactly like paletteId. */
  motifId: "none" | "floral" | "geometric-neutral";
  motionId: "none" | "gentle" | "cinematic";
  wordingGuidance: string;
  ceremonyTerminology?: Record<string, string>;
}

export const CULTURAL_PACK_IDS = ["neutral-classic", "hindu-wedding"] as const;

export type CulturalPackId = (typeof CULTURAL_PACK_IDS)[number];

export const CULTURAL_PACKS: Record<CulturalPackId, CulturalPackDefinition> = {
  "neutral-classic": {
    id: "neutral-classic",
    label: "Classic (culturally neutral)",
    description:
      "A respectful default for civil ceremonies, interfaith couples, or any wedding that doesn't want a specific cultural framing — also the right starting point for a non-wedding event category.",
    applicableCategories: ["wedding-other", "holiday", "vacation", "hotel-package", "birthday", "other"],
    supportedEventTypeIds: ["engagement", "civil_ceremony", "wedding_ceremony", "reception", "dinner", "custom"],
    suggestedSectionOrder: ["opening", "greeting", "welcome", "schedule", "dateTime", "rsvp", "closing"],
    paletteId: "neutral-classic",
    motifId: "none",
    motionId: "gentle",
    wordingGuidance:
      "Keep language warm and inclusive; avoid assuming a specific family structure, religious tradition, or gendered role. Use \"the couple\" rather than presuming who is being married to whom.",
  },
  "hindu-wedding": {
    id: "hindu-wedding",
    label: "Hindu wedding",
    description:
      "A starting point for a multi-event Hindu wedding — haldi, mehendi, sangeet, the wedding ceremony, and reception. Ritual and family details remain the client's own to provide; nothing religious is asserted by default.",
    applicableCategories: ["wedding-hindu"],
    supportedEventTypeIds: ["haldi", "mehendi", "sangeet", "wedding_ceremony", "reception", "custom"],
    suggestedSectionOrder: ["opening", "greeting", "welcome", "story", "schedule", "dateTime", "dressCode", "gallery", "rsvp", "closing"],
    paletteId: "hindu-classic",
    motifId: "floral",
    motionId: "cinematic",
    wordingGuidance:
      "Reflect the specific family/traditions the client describes rather than assuming a single regional or sectarian practice — Hindu wedding customs vary widely by region and family. Confirm ritual names and order with the client before publishing; never invent details that weren't provided.",
    ceremonyTerminology: {
      haldi: "Haldi",
      mehendi: "Mehendi",
      sangeet: "Sangeet",
      ceremony: "Wedding Ceremony",
      reception: "Reception",
    },
  },
};

export function isKnownCulturalPackId(value: string): value is CulturalPackId {
  return (CULTURAL_PACK_IDS as readonly string[]).includes(value);
}

/**
 * FUTURE PACKS — explicitly not registered, not selectable, listed here
 * only so the next addition has an obvious place to land (Part D):
 * "muslim-wedding" (nikah-centered, its own suggested section order and
 * terminology, guided by the same "confirm with the client, never
 * invent" principle as hindu-wedding above); "christian-wedding";
 * "civil-wedding" (distinct from neutral-classic if a dedicated civil-
 * ceremony framing proves useful); "mauritian-multicultural" (the
 * product's own home market — see the `mfe` Kreol Morisien locale
 * already in src/lib/i18n/translations.ts — likely composing elements
 * from more than one single-tradition pack rather than being purely
 * novel); "birthday-classic"; "corporate-classic". None of these exist
 * in CULTURAL_PACKS yet — adding one is a new registry entry plus new
 * event-type rows where needed (event-types.ts), never a schema change.
 */
