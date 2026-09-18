import type { InviteViewModel } from "../invite-view-model";
import { parseComposition, type InvitationComposition } from "./schema";
import { adaptLegacyContentToComposition } from "./legacy-adapter";

/**
 * The one function every rendering route calls to go from "a sanitized
 * InviteViewModel plus whatever raw `composition` jsonb the database
 * returned" to "a trusted, validated InvitationComposition, or nothing
 * to render" — Stage 6 (see PROJECT_STATUS.md's Stage 6 section).
 *
 * The rule, followed exactly (Part F): a REAL composition (the
 * invitation's own `composition` column is non-null) that fails
 * validation is NOT a signal to fall back to legacy `content` rendering
 * — it's a hard failure, returned as `null` here, exactly like a
 * missing/unpublished invitation. "New compositions must not fall back
 * to arbitrary legacy rendering when validation fails." Only the
 * ABSENCE of a composition (`rawComposition` is null/undefined — every
 * pre-Stage-6 row, and every demo invite) triggers the legacy adapter.
 *
 * `model` may itself be `null` (the invitation isn't viewable at all —
 * Stage 4/5's existing "one safe unavailable response" collapsing,
 * unchanged) — this function passes that straight through without
 * touching the database-shaped `rawComposition` value at all, so a
 * caller never needs its own extra branch for that case.
 */
export function resolveComposition(
  model: InviteViewModel | null,
  rawComposition: unknown | null | undefined
): InvitationComposition | null {
  if (!model) return null;
  if (rawComposition !== null && rawComposition !== undefined) {
    return parseComposition(rawComposition);
  }
  return adaptLegacyContentToComposition(model);
}
