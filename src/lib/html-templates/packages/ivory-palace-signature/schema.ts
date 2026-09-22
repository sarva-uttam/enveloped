/**
 * Composition contract for the Ivory Palace — Signature Edition
 * template.
 *
 * Mirrors the conventions established in
 * ../timeless-editorial-v2/schema.ts: the smallest schema this single
 * template slice needs, bounded safeText()/safeUrl() fields, .strict()
 * objects, nothing free-form. Not yet wired to the public survey UI —
 * see the same "future survey mapping" note pattern as
 * timeless-editorial-v2/schema.ts; no survey code is touched here.
 *
 * Scene-to-field mapping (see assets/source-spec/SCENE-SPEC.md):
 *   1  Palace doors      -> no text fields (pure artwork/animation)
 *   2  Welcome/monogram  -> welcomeLine
 *   3  Couple intro      -> coupleName1/2, introLine
 *   4a Haldi              -> ceremonies.haldi (optional)
 *   4b Mehendi             -> ceremonies.mehendi (optional)
 *   4c Sangeet              -> ceremonies.sangeet (optional)
 *   4d Wedding               -> ceremonies.wedding (required — the one ceremony
 *                              every invitation of this template has)
 *   4e Reception               -> ceremonies.reception (optional)
 *   5  Formal invitation -> formalInvitation
 *   6  Gallery           -> gallery (0-6 photos; 0 renders the documented
 *                           empty-arch fallback, never a fake photo)
 *   7  Venue/response    -> venue, response (response optional = RSVP off)
 *   8  Blessing          -> familyBlessingLine
 *   9  Finale             -> closingLine
 *
 * A ceremony scene is only rendered when its data object is present —
 * this keeps the template reusable across families who don't hold
 * every ceremony (e.g. no Sangeet) without ever rendering an empty
 * section or a section with placeholder text, matching how
 * timeless-editorial-v2 treats its optional `response` section.
 */

import { z } from "zod";
import { safeText, safeUrl } from "@/lib/html-templates/security";

const CeremonySchema = z
  .object({
    dateDisplay: safeText(60),
    timeDisplay: safeText(60).optional(),
    venueName: safeText(120),
    venueDetail: safeText(200).optional(),
  })
  .strict();

const GalleryPhotoSchema = z
  .object({
    url: safeUrl,
    alt: safeText(200),
  })
  .strict();

/**
 * Guest-response ("RSVP") section — identical contract and rendering
 * boundary as timeless-editorial-v2/schema.ts's ResponseSectionSchema:
 * omitting `response` entirely disables it. `url` is populated
 * server-side at personalization time from the existing hardened
 * /guest/[token] route in a later integration phase — never baked
 * into stored composition as a raw token (see
 * docs/html-invitation-generator/ARCHITECTURE.md §6).
 */
const ResponseSectionSchema = z
  .object({
    heading: safeText(80).default("Will you honour us with your presence?"),
    supportingMessage: safeText(200).optional(),
    deadline: safeText(80).optional(),
    buttonLabel: safeText(40).default("Share your response"),
    url: safeUrl,
  })
  .strict();

export const IvoryPalaceDataSchema = z
  .object({
    coupleName1: safeText(80),
    coupleName2: safeText(80),
    eventDateDisplay: safeText(80),
    welcomeLine: safeText(160),
    introLine: safeText(320),

    ceremonies: z
      .object({
        haldi: CeremonySchema.optional(),
        mehendi: CeremonySchema.optional(),
        sangeet: CeremonySchema.optional(),
        wedding: CeremonySchema,
        reception: CeremonySchema.optional(),
      })
      .strict(),

    formalInvitation: z
      .object({
        headline: safeText(120),
        bodyLines: z.array(safeText(160)).min(1).max(9),
      })
      .strict(),

    /** 0–6 photos. Fewer than 6 leaves the remaining arches in the
     * documented empty-fallback state (low-contrast ivory texture),
     * never a black placeholder or a duplicated photo. */
    gallery: z.array(GalleryPhotoSchema).max(6).default([]),

    venue: z
      .object({
        name: safeText(120),
        address: safeText(220),
        mapUrl: safeUrl,
      })
      .strict(),

    response: ResponseSectionSchema.optional(),

    familyBlessingLine: safeText(320),
    closingLine: safeText(200),
  })
  .strict();

export type IvoryPalaceData = z.infer<typeof IvoryPalaceDataSchema>;
export type CeremonyData = z.infer<typeof CeremonySchema>;
export type GalleryPhotoData = z.infer<typeof GalleryPhotoSchema>;
export type ResponseSectionData = z.infer<typeof ResponseSectionSchema>;
