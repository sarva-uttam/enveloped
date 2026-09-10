import "server-only";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InvitationCompositionSchema, type InvitationComposition } from "@/lib/composition/schema";
import { CULTURAL_PACKS, type CulturalPackId } from "@/lib/composition/cultural-packs";
import type { EventCategory } from "@/lib/types";
import type { EventTypeId } from "@/lib/composition/event-types";

/**
 * Server-only, ADMINISTRATOR-ONLY composition authoring — Stage 6 (see
 * PROJECT_STATUS.md's Stage 6 section, Part G). Same fail-closed,
 * checkAdmin()-gated, service-role-key-free shape as
 * src/lib/preview-admin.server.ts (Stage 5) — every function here
 * re-verifies admin status itself via the real, database-backed
 * `is_admin()` check before doing anything, and the underlying SQL
 * function (`admin_save_invite_composition()`, see
 * supabase/migrations/20260910140000_composition_authoring.sql)
 * independently re-checks the same thing — defense in depth, not
 * redundancy to trim.
 *
 * "Do not build the full editor UI" — nothing here renders anything;
 * this is the trusted, minimal write boundary a future editor would
 * call into, exactly the way Stage 5's preview-admin.server.ts became
 * the boundary PreviewLinkTool.tsx calls through, before any richer UI
 * existed for it.
 */

export type ValidateCompositionResult =
  | { ok: true; composition: InvitationComposition }
  | { ok: false; reason: "invalid" };

/**
 * Validates a PROPOSED composition — the one and only gate between
 * "arbitrary data someone typed or a generator produced" and "something
 * this project will ever store or render." Pure (no I/O, no admin
 * check of its own — validity is independent of who's asking), so it's
 * exhaustively unit-testable on its own (composition-admin.server.test.ts)
 * separate from the authorization/persistence concerns below.
 */
export function validateComposition(proposed: unknown): ValidateCompositionResult {
  const result = InvitationCompositionSchema.safeParse(proposed);
  if (!result.success) return { ok: false, reason: "invalid" };
  return { ok: true, composition: result.data };
}

/**
 * Builds a fresh DRAFT composition seeded from a trusted cultural pack's
 * defaults (Part D) — "selecting a trusted design pack." Returns
 * `null` for any packId that isn't in the registry (CULTURAL_PACKS),
 * including every "future pack" only ever mentioned in that file's own
 * comments — "future pack identifiers cannot be falsely selected before
 * registration" holds here too, not just at Zod-validation time,
 * because this function is the other place a pack id could otherwise be
 * trusted from. The result is already a fully valid
 * `InvitationComposition` (built entirely from trusted, hardcoded pack
 * defaults plus the caller's own eventCategory/locale, never from
 * unvalidated input) — still run through validateComposition() before
 * returning, as a defensive check, not because it's expected to ever
 * fail.
 */
export function buildCompositionFromPack(params: {
  packId: string;
  eventCategory: EventCategory;
  occasionId?: EventTypeId | null;
  occasionCustomLabel?: string | null;
}): InvitationComposition | null {
  const pack = CULTURAL_PACKS[params.packId as CulturalPackId];
  if (!pack || pack.id !== params.packId) return null;

  const draft = {
    schemaVersion: 1 as const,
    templateId: null,
    designPackId: pack.id,
    eventCategory: params.eventCategory,
    weddingContext: {
      occasionId: params.occasionId ?? null,
      occasionCustomLabel: params.occasionCustomLabel ?? null,
      culturalPackId: pack.id,
    },
    locale: "en" as const,
    dir: "ltr" as const,
    themeTokens: { paletteId: pack.paletteId },
    sections: pack.suggestedSectionOrder
      .map((type) => defaultSectionFor(type))
      .filter((s): s is NonNullable<typeof s> => s !== null),
    featureConfig: {
      motion: pack.motionId !== "none",
      ambientMotif: pack.motifId === "none" ? ("none" as const) : ("light" as const),
      openingBurst: pack.motionId === "cinematic",
    },
  };

  const result = validateComposition(draft);
  return result.ok ? result.composition : null;
}

/** Minimal, safe placeholder content for each section type a pack might
 *  suggest — deliberately generic ("Welcome" / "We're getting
 *  married..."), meant to be edited by an administrator or client
 *  before publishing, never final copy. Returns null for a type this
 *  function doesn't have a sensible generic default for (kept out of
 *  suggestedSectionOrder in practice, but defensive regardless). */
function defaultSectionFor(type: string) {
  switch (type) {
    case "opening":
      return { id: "opening", type: "opening" as const, enabled: true, data: { headline: "You're Invited" } };
    case "greeting":
      return { id: "greeting", type: "greeting" as const, enabled: true, data: {} };
    case "welcome":
      return {
        id: "welcome",
        type: "welcome" as const,
        enabled: true,
        data: { message: "We would be honored to have you join us." },
      };
    case "story":
      return { id: "story", type: "story" as const, enabled: true, data: { body: "Our story, to be added." } };
    case "schedule":
      return {
        id: "schedule",
        type: "schedule" as const,
        enabled: true,
        data: { entries: [{ id: "schedule-0", eventTypeId: null, label: "Date", value: "To be confirmed" }] },
      };
    case "dateTime":
      return null; // requires a real event date — left for the author to add
    case "dressCode":
      return {
        id: "dress-code",
        type: "dressCode" as const,
        enabled: true,
        data: { description: "Details to follow." },
      };
    case "gallery":
      return {
        id: "gallery",
        type: "gallery" as const,
        enabled: true,
        data: { items: [{ id: "gallery-0", imageUrl: null, alt: "A placeholder gallery item", colorFallback: "#e2c07a" }] },
      };
    case "rsvp":
      return { id: "rsvp", type: "rsvp" as const, enabled: true, data: {} };
    case "closing":
      return { id: "closing", type: "closing" as const, enabled: true, data: { message: "We can't wait to celebrate with you." } };
    default:
      return null;
  }
}

export type SaveCompositionResult =
  | { ok: true }
  | { ok: false; reason: "not-admin" | "invalid" | "invite-not-found" | "database-error" };

/**
 * Saves a composition to an invitation — the ONLY way `invites.composition`
 * (and, together with it, `occasion`/`occasion_custom_label`) is ever
 * set by anything other than a migration or a direct, trusted database
 * operation. Authorization is checked FIRST, before anything else —
 * including before validating the proposed composition — the same
 * "reject an unauthorized caller before doing any work on their input,
 * and before an error message could reveal anything about whether that
 * input was well-formed" ordering every other admin-gated write in this
 * project follows. Only once the caller is confirmed to be a real
 * administrator does this validate the proposed composition (an invalid
 * one never reaches the RPC at all — proven by
 * composition-admin.server.test.ts asserting the mocked RPC is never
 * invoked on that path) and call the SECURITY DEFINER
 * `admin_save_invite_composition()` function through the session-aware
 * server client — never the service-role client, so the real
 * authorization decision is is_admin() reading the caller's own
 * session, the same shape as every other admin write in this project.
 */
export async function saveInviteComposition(params: {
  inviteId: string;
  composition: unknown;
  occasionId?: EventTypeId | null;
  occasionCustomLabel?: string | null;
}): Promise<SaveCompositionResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const validated = validateComposition(params.composition);
  if (!validated.ok) return { ok: false, reason: "invalid" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_save_invite_composition", {
    p_invite_id: params.inviteId,
    p_composition: validated.composition,
    p_occasion: params.occasionId ?? null,
    p_occasion_custom_label: params.occasionCustomLabel ?? null,
  });

  if (error) {
    console.error("saveInviteComposition: admin_save_invite_composition RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "invite-not-found" };

  return { ok: true };
}
