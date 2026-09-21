/**
 * The event-type vocabulary — Stage 6 (2026-09-10, see PROJECT_STATUS.md's
 * Stage 6 section). Replaces the permanent Hindu-wedding-only assumption
 * baked into the live database's `invites_occasion_check` CHECK
 * constraint (`haldi` / `sangeet_mehendi` / `wedding_day` / `reception`
 * only — see supabase/migrations/20260905084115_generator_composition.sql)
 * with a general, extensible list of STABLE MACHINE IDENTIFIERS — never
 * human display text as database truth (Part C's own instruction).
 *
 * This file is the single TypeScript source of truth for the vocabulary;
 * `supabase/migrations/20260910130000_wedding_event_taxonomy.sql` seeds
 * the database's `event_types` table with the EXACT SAME ids and labels
 * — kept in sync by convention and by
 * tests/integration/wedding-event-taxonomy.test.ts, which asserts every
 * id here has a matching live row (and vice versa).
 *
 * All four of the ORIGINAL, live values are preserved verbatim below
 * (Part C: "preserve legacy occasion values... do not silently
 * reinterpret existing rows") — `haldi` and `reception` remain
 * first-class (they're perfectly good general terms, not specific to
 * the old, narrower vocabulary), while `sangeet_mehendi` and
 * `wedding_day` are kept reachable but flagged `isLegacy: true`: the new
 * vocabulary splits `sangeet_mehendi` into separate `sangeet`/`mehendi`
 * entries, and replaces `wedding_day` with the clearer
 * `wedding_ceremony` — an EXISTING ROW using either legacy id keeps
 * meaning exactly what it always meant (never reinterpreted, never
 * migrated to the new id automatically); the flag exists only to steer
 * a future admin UI away from SUGGESTING them for new invitations.
 *
 * Deliberately general-purpose, not wedding-exclusive: `custom` exists
 * so any event this vocabulary hasn't anticipated (a non-wedding
 * category, or a wedding tradition not yet named here) can still be
 * represented — paired with a free-text custom label (see
 * `invites.occasion_custom_label` in the migration, and
 * `CustomOccasionLabelSchema` below) rather than forcing a stretch-fit
 * onto an existing id. This is what keeps the core capable of
 * supporting birthdays/corporate events later (Part C's requirement 10)
 * without a schema change: a future cultural pack for either can define
 * its own new event-type rows/ids without touching this file's
 * structure, only its content.
 */

export interface EventTypeDefinition {
  id: string;
  label: string;
  /** Steers future admin tooling away from suggesting this id for a NEW
   *  invitation — never affects validity. A legacy id remains exactly as
   *  valid, forever, as any other. */
  isLegacy: boolean;
}

export const EVENT_TYPES: readonly EventTypeDefinition[] = [
  { id: "engagement", label: "Engagement", isLegacy: false },
  { id: "haldi", label: "Haldi", isLegacy: false },
  { id: "mehendi", label: "Mehendi", isLegacy: false },
  { id: "sangeet", label: "Sangeet", isLegacy: false },
  { id: "civil_ceremony", label: "Civil Ceremony", isLegacy: false },
  { id: "religious_ceremony", label: "Religious Ceremony", isLegacy: false },
  { id: "nikah", label: "Nikah", isLegacy: false },
  { id: "wedding_ceremony", label: "Wedding Ceremony", isLegacy: false },
  { id: "reception", label: "Reception", isLegacy: false },
  { id: "dinner", label: "Dinner", isLegacy: false },
  { id: "custom", label: "Custom", isLegacy: false },
  // Legacy — preserved verbatim, not reinterpreted. See header comment.
  { id: "sangeet_mehendi", label: "Sangeet & Mehendi", isLegacy: true },
  { id: "wedding_day", label: "Wedding Day", isLegacy: true },
] as const;

export const EVENT_TYPE_IDS = EVENT_TYPES.map((e) => e.id) as [string, ...string[]];

export type EventTypeId = (typeof EVENT_TYPES)[number]["id"];

const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.label]));

export function isKnownEventTypeId(value: string): value is EventTypeId {
  return value in EVENT_TYPE_LABELS;
}

export function eventTypeLabel(id: EventTypeId): string {
  return EVENT_TYPE_LABELS[id] ?? id;
}

/**
 * Future, explicitly NOT-yet-registered vocabulary — documented here so
 * "add a birthday/corporate event type later" has an obvious place to
 * land, not because these strings mean anything today. Adding one is a
 * new EVENT_TYPES entry (+ a matching migration row), never a schema
 * change to the shape above.
 *
 * Wedding: none currently missing from the list above for the five
 * cultural contexts this stage targets (Hindu/Muslim/Christian/civil/
 * neutral).
 * Non-wedding (deliberately unbuilt this stage, see PROJECT_STATUS.md):
 * birthday — e.g. "cake_cutting", "milestone_toast";
 * corporate — e.g. "keynote", "networking_reception", "awards".
 */
