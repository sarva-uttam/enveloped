/**
 * Composition contract for the Timeless Editorial Wedding (V2) template.
 *
 * This is intentionally the smallest schema this single-template slice
 * needs — not the full app-wide invitation composition schema. It
 * follows the same conventions (bounded safeText, allowlisted safeUrl,
 * .strict() objects) established in src/lib/composition/schema.ts.
 *
 * Future survey mapping (Part 4): this schema is not yet wired to the
 * public survey UI (src/app/survey) — that UI still writes the legacy
 * `content`/`answers` shape consumed by src/lib/composition. When the
 * survey is extended to author HTML-template invitations, the intended
 * mapping is:
 *   survey "guest response" toggle         -> response.enabled (omit `response` entirely when off)
 *   survey "response heading" text field   -> response.heading
 *   survey "response message" text field   -> response.supportingMessage
 *   survey "response deadline" date field  -> response.deadline (client-formatted display string, not a raw Date)
 *   survey "response button label" field   -> response.buttonLabel
 *   guest-link generation (existing system) -> response.url, populated server-side at
 *     personalization time from the existing hardened /guest/[token] route — never a
 *     client-supplied field, and never a raw token baked into stored composition.
 * No survey UI code is touched in this session — this comment documents the mapping
 * for a future slice, per the owner's instruction not to modify the survey yet.
 */

import { z } from "zod";
import { safeText, safeUrl } from "@/lib/html-templates/security";

const ScheduleItemSchema = z
  .object({
    time: safeText(40),
    title: safeText(80),
    description: safeText(200).optional(),
  })
  .strict();

/**
 * The guest-response ("RSVP") section is optional — not every
 * invitation collects responses (e.g. save-the-dates, adults-only
 * follow-ups where response already happened elsewhere). Omitting
 * `response` entirely is how a client disables it; render.ts renders
 * nothing for this section when it's undefined, never an empty
 * heading or a dangling link with no destination.
 */
const ResponseSectionSchema = z
  .object({
    heading: safeText(80).default("Will you celebrate with us?"),
    supportingMessage: safeText(160).optional(),
    deadline: safeText(80).optional(),
    buttonLabel: safeText(40).default("Share your response"),
    url: safeUrl,
  })
  .strict();

export const TimelessEditorialDataSchema = z
  .object({
    partner1Name: safeText(80),
    partner2Name: safeText(80),
    eventDateDisplay: safeText(80),
    openingLine: safeText(120),
    introLine: safeText(280),
    schedule: z.array(ScheduleItemSchema).min(1).max(8),
    venueName: safeText(120),
    venueAddress: safeText(200),
    mapUrl: safeUrl,
    dressCode: safeText(160).optional(),
    response: ResponseSectionSchema.optional(),
    closingLine: safeText(200),
  })
  .strict();

export type TimelessEditorialData = z.infer<typeof TimelessEditorialDataSchema>;
export type ResponseSectionData = z.infer<typeof ResponseSectionSchema>;
