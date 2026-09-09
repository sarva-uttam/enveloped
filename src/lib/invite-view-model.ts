/**
 * Pure sanitization/view-model layer between storage data and the
 * invitation's PRESENTATION components — Stage 4 (2026-09-09, see
 * PROJECT_STATUS.md). Exists for the same reason src/lib/ownership.ts
 * and src/lib/paypal-verify.ts are pure, dependency-free modules: the
 * security-relevant decision (what's safe to render, and from what raw
 * shape) belongs in one small, exhaustively-testable place, not
 * scattered across a React component tree.
 *
 * `InviteViewModel` is deliberately narrow and flat — the ONLY fields an
 * invitation's presentation components ever receive, regardless of
 * whether the source was a real published invite or a static demo. This
 * uniform shape is intentional: it's the seam a future versioned
 * composition renderer (not built yet — see PROJECT_STATUS.md's "What
 * was not built this stage") will replace/extend, not the components
 * that consume it today. Never add a raw database row, `PublicInvite`,
 * or `StoredInvite` to a client component's props — always go through a
 * builder here first.
 */

import type { DemoInvite } from "./demo-invites";
import type { PublicInvite } from "./storage-queries";
import type { GeneratedInviteContent, TierId } from "./types";

export interface InviteViewModel {
  /** The invite's slug — undefined for demo invites, which accept no
   *  RSVPs and have no real database row to reference. */
  inviteId: string | undefined;
  /** The resolved guest's internal id, only ever set from a validated
   *  resolve_invite_guest() result — never anything the browser/URL
   *  could forge directly into this model. */
  guestId: string | undefined;
  guestName: string | undefined;
  tier: TierId;
  content: GeneratedInviteContent;
  eventDate: string | undefined;
  song: string | undefined;
  isDemo: boolean;
}

export interface ResolvedGuestEntry {
  id: string;
  name: string;
  clickTeaser: string;
}

/**
 * Builds the view model for a real (non-demo) invitation from the
 * SANITIZED public read and an optional resolved guest entry — never
 * from a raw table row. Returns null whenever the invitation is not
 * publicly viewable, for ANY reason: doesn't exist, exists but
 * unpublished, or the RPC otherwise returned no content. This single
 * return-null path is what makes "one safe unavailable response"
 * (never revealing WHICH of those reasons applied) trivial for the
 * caller to get right — there's only one branch to render for "no
 * model", never four different ones to accidentally distinguish.
 *
 * A guest token that didn't resolve to anything (invalid, wrong
 * invitation, or the invitation isn't published) simply means
 * `guestEntry` arrives as null here — the model still builds normally
 * for the invitation's base (non-personalized) content when the
 * invitation itself IS published. This is deliberate, existing, intended
 * behavior carried forward exactly: a published invitation with no (or
 * an invalid) guest token still renders — the current data model has no
 * "guest-only, base link forbidden" flag on an invitation, and this
 * function does not invent one.
 */
export function buildPublicInviteViewModel(params: {
  publicInvite: PublicInvite | null;
  guestEntry: ResolvedGuestEntry | null;
}): InviteViewModel | null {
  const { publicInvite, guestEntry } = params;

  if (!publicInvite || !publicInvite.publishedAt || !publicInvite.content) {
    return null;
  }

  return {
    inviteId: publicInvite.slug,
    guestId: guestEntry?.id,
    guestName: guestEntry?.name,
    tier: publicInvite.tier ?? "bronze",
    content: publicInvite.content,
    eventDate: publicInvite.eventDate ?? undefined,
    song: publicInvite.song ?? undefined,
    isDemo: false,
  };
}

/** Demo invites are static, local data — always "viewable", never
 *  accept RSVPs (inviteId stays undefined, matching the pre-Stage-4
 *  behavior of `inviteId={demo ? undefined : params.id}`). */
export function buildDemoInviteViewModel(demo: DemoInvite): InviteViewModel {
  return {
    inviteId: undefined,
    guestId: undefined,
    guestName: demo.guestName,
    tier: demo.tier,
    content: demo.content,
    eventDate: demo.eventDate,
    song: demo.song,
    isDemo: true,
  };
}

/**
 * High-confidence input validation for route/query values BEFORE they
 * ever reach a database call — "Do not blindly pass arbitrary route/
 * query values into database calls." Every real slug this app ever
 * generates matches this shape:
 *   - invite slugs: `${slugify(names)}-${Date.now().toString(36)}`
 *     (src/components/survey/SurveyFlow.tsx)
 *   - guest slugs: `${slugify(name)}-${random base36}`
 *     (same file, buildGuestList())
 *   - demo ids: literal `demo-bronze` etc.
 * All of them are lowercase, start with a letter or digit, and contain
 * only letters/digits/hyphens. Deliberately conservative — reject
 * anything else outright (empty, too long, wrong charset) rather than
 * pass it through and rely solely on the database/RPC layer to say no.
 * A slug this rejects is treated exactly like "not found" — see
 * src/app/invite/[id]/page.tsx.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function isValidSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}
