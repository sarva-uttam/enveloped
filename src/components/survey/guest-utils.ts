import { CLICK_TEASERS } from "@/lib/categories";
import type { GuestEntry } from "@/lib/types";
import { slugify } from "@/lib/utils";

export interface GuestRow {
  id: string;
  name: string;
}

let rowCounter = 0;
export function newGuestRowId(): string {
  rowCounter += 1;
  return `row-${Date.now().toString(36)}-${rowCounter}`;
}

export function makeEmptyRow(): GuestRow {
  return { id: newGuestRowId(), name: "" };
}

/**
 * The "paste many" adapter — reuses the exact split-on-newline-or-comma
 * rule the old textarea step used, but only as a parser for turning
 * pasted bulk text into structured rows, not as the primary UX anymore.
 */
export function parseGuestNamesText(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export function guestRowsValid(rows: GuestRow[]): boolean {
  const trimmed = rows.map((r) => r.name.trim()).filter(Boolean);
  return trimmed.length > 0;
}

/** Names actually filled in — what the UI counts and what gets submitted. */
export function nonEmptyGuestCount(rows: GuestRow[]): number {
  return rows.filter((r) => r.name.trim().length > 0).length;
}

/**
 * Serializes structured rows back into the plain newline-joined string
 * `SurveyAnswers.guestNames` has always been — the `answers` jsonb column
 * is schema-free, so this doesn't change the stored contract's shape,
 * only guarantees it's built from real rows rather than raw textarea
 * input. Kept for the review step's display and so `answers` stays a
 * faithful, human-readable record of what was actually submitted.
 */
export function guestRowsToNamesString(rows: GuestRow[]): string {
  return rows
    .map((r) => r.name.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The form-boundary adapter: structured rows -> the GuestEntry[] shape
 * saveInvite()/invite_guests has always expected (src/lib/storage.ts).
 * Builds directly from the rows the user actually edited, instead of
 * re-parsing a joined string — sidesteps the previous comma-in-a-single-
 * household-name ambiguity entirely.
 *
 * Stage 11 fix: the slug now embeds this guest's position in THIS
 * submission (`i`), not just a random suffix — the old
 * `${slugify(name)}-${random4char}` could collide across two guests
 * sharing a name in the same invite (invite_guests has a UNIQUE
 * (invite_id, slug) constraint, scoped per invite, so a random suffix
 * alone wasn't guaranteed unique within one list). Position is
 * guaranteed unique per call; the random suffix now only adds
 * non-guessability to the link, not uniqueness.
 */
export function buildGuestEntries(rows: GuestRow[]): GuestEntry[] {
  const names = rows.map((r) => r.name.trim()).filter(Boolean);

  return names.map((name, i) => ({
    id: `${slugify(name)}-${i}`,
    slug: `${slugify(name)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    viewed: false,
    clickTeaser: CLICK_TEASERS[i % CLICK_TEASERS.length],
  }));
}
