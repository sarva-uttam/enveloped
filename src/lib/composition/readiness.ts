import { InvitationCompositionSchema, type CompositionSection } from "./schema";
import type { EventCategory } from "../types";

/**
 * Publication-readiness assessment — Stage 8 (see PROJECT_STATUS.md's
 * Stage 8 section, Part I). Pure, I/O-free, and deliberately NOT tagged
 * `server-only`: the admin invitation page renders this from the
 * server-fetched saved composition, and the live editor (a Client
 * Component) re-runs the SAME function against the in-progress draft for
 * instant feedback — one implementation, never two.
 *
 * This is an ASSESSMENT, never a gate: nothing in this module changes
 * `published_at`, and nothing here prevents a save or a publish — it
 * only classifies issues as blocking/warning/passed for the admin UI to
 * display (see invitation-admin.server.ts's publishInvitation(), which
 * performs no readiness check of its own at all).
 */

/**
 * Every literal placeholder string composition-admin.server.ts's
 * `defaultSectionFor()` can produce for a freshly pack-initialized
 * section — flagged here as "unresolved placeholder content," never
 * publishable as-is (Part E: "prevent accidental publication while
 * required placeholder content remains"). A deliberately exact-string
 * heuristic, not a generic shortness/emptiness check — a genuinely short
 * real headline the client wrote should never be flagged, only text this
 * project itself generated as an explicit stand-in.
 */
export const PLACEHOLDER_TEXT_VALUES: ReadonlySet<string> = new Set([
  "You're Invited",
  "We would be honored to have you join us.",
  "Our story, to be added.",
  "To be confirmed",
  "Details to follow.",
  "A placeholder gallery item",
  "We can't wait to celebrate with you.",
]);

export interface ReadinessIssue {
  id: string;
  message: string;
}

export interface ReadinessReport {
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  passed: ReadinessIssue[];
}

/** The minimal, non-sensitive shape of "a request's own private fields"
 *  the private-leak check needs — deliberately narrower than
 *  RequestDetail (defined in requests.ts, which this module does not
 *  import, keeping this module free of any server-side type coupling). */
export interface PrivateFieldsForLeakCheck {
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
}

const WEDDING_CATEGORIES: string[] = ["wedding-hindu", "wedding-christian", "wedding-muslim", "wedding-other"];

export function assessPublicationReadiness(rawComposition: unknown, privateFields?: PrivateFieldsForLeakCheck | null): ReadinessReport {
  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const passed: ReadinessIssue[] = [];

  const parsed = InvitationCompositionSchema.safeParse(rawComposition);
  if (!parsed.success) {
    blocking.push({ id: "schema", message: "This composition does not currently pass schema validation — fix the errors shown in the editor first." });
    return { blocking, warnings, passed };
  }
  const composition = parsed.data;
  passed.push({ id: "schema", message: `Composition validates against schema version ${composition.schemaVersion}.` });
  passed.push({ id: "pack", message: `Design pack "${composition.designPackId}" is a trusted, registered pack.` });

  const enabledSections = composition.sections.filter((s) => s.enabled);

  const opening = enabledSections.find((s): s is Extract<CompositionSection, { type: "opening" }> => s.type === "opening");
  if (!opening || !opening.data.headline.trim()) {
    blocking.push({ id: "headline", message: "An enabled opening section with a headline is required." });
  } else {
    passed.push({ id: "headline", message: "Opening headline is present." });
  }

  const placeholders = findPlaceholderText(enabledSections);
  if (placeholders.length > 0) {
    blocking.push({
      id: "placeholders",
      message: `Unresolved placeholder content remains in: ${placeholders.join(", ")}. Replace it with the client's real wording before publishing.`,
    });
  } else {
    passed.push({ id: "placeholders", message: "No unresolved placeholder content detected." });
  }

  const dateTimeSection = enabledSections.find((s) => s.type === "dateTime");
  const isWedding = WEDDING_CATEGORIES.includes(composition.eventCategory as EventCategory);
  if (!dateTimeSection) {
    const issue = { id: "date", message: "No event date/time section is enabled." };
    if (isWedding) blocking.push(issue);
    else warnings.push(issue);
  } else {
    passed.push({ id: "date", message: "An event date/time section is enabled." });
  }

  const venueSection = enabledSections.find((s) => s.type === "venue");
  if (!venueSection && isWedding) {
    warnings.push({ id: "venue", message: "No venue section is enabled — confirm this invitation genuinely has no venue to show." });
  } else if (venueSection) {
    passed.push({ id: "venue", message: "A venue section is enabled." });
  }

  const gallerySection = enabledSections.find((s): s is Extract<CompositionSection, { type: "gallery" }> => s.type === "gallery");
  if (gallerySection && gallerySection.data.items.some((item) => PLACEHOLDER_TEXT_VALUES.has(item.alt))) {
    warnings.push({ id: "gallery-alt", message: "One or more gallery images still use placeholder alt text." });
  } else if (gallerySection) {
    passed.push({ id: "gallery-alt", message: "Gallery image descriptions look configured." });
  }

  const musicSection = enabledSections.find((s): s is Extract<CompositionSection, { type: "music" }> => s.type === "music");
  if (musicSection?.data.src && !musicSection.data.credit) {
    warnings.push({ id: "music-credit", message: "Music is configured with no artist/rights credit — confirm the owner/client holds the rights to use this track." });
  } else {
    passed.push({ id: "music", message: musicSection?.data.src ? "Music is configured with a credit." : "No music configured (not required)." });
  }

  if (privateFields) {
    const privateStrings = [privateFields.email, privateFields.phone, privateFields.notes, privateFields.internalNotes].filter(
      (v): v is string => Boolean(v && v.trim())
    );
    const serialized = JSON.stringify(composition.sections);
    const leaked = privateStrings.filter((v) => serialized.includes(v));
    if (leaked.length > 0) {
      blocking.push({ id: "private-leak", message: "This composition appears to contain private request details (email, phone, or internal notes) — remove them before publishing." });
    } else {
      passed.push({ id: "private-leak", message: "No private request details detected in the composition." });
    }
  }

  passed.push({ id: "sections", message: "Every section uses a supported, registered type." });

  return { blocking, warnings, passed };
}

/** Every string value anywhere inside a JSON-shaped value, however
 *  deeply nested — used so placeholder detection also catches a
 *  placeholder sitting inside an array of objects (schedule.entries[].
 *  value, gallery.items[].alt), not just a section's own top-level
 *  string fields. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function findPlaceholderText(sections: CompositionSection[]): string[] {
  const hits: string[] = [];
  for (const section of sections) {
    const hasPlaceholder = collectStrings(section.data).some((v) => PLACEHOLDER_TEXT_VALUES.has(v));
    if (hasPlaceholder) hits.push(section.type);
  }
  return hits;
}
