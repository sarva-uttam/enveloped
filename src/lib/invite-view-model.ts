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
import type { PublicInvite, PreviewInvite, StoredInvite } from "./storage-queries";
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
  /** Whether the underlying invitation is actually published. True for
   *  every public-route model (buildPublicInviteViewModel() only ever
   *  returns non-null when publishedAt is set) and every demo (demos are
   *  always "viewable", the local equivalent of published). Stage 5
   *  (2026-09-10, see PROJECT_STATUS.md) introduces the one case where
   *  this can be false: a private preview token can unlock an
   *  UNPUBLISHED invitation's content (buildPreviewInviteViewModel()) —
   *  every route passes this straight through as the composition
   *  renderer's `canRsvp` prop (Stage 6, see
   *  src/components/composition/CompositionRenderer.tsx /
   *  RsvpSection in sections.tsx), which decides whether RSVP is
   *  offered at all: "never enable RSVP for an unpublished preview." */
  isPublished: boolean;
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
    // This builder only ever returns non-null when publishedAt is set
    // (see the guard above) — isPublished is therefore always true for
    // every model that reaches a caller from here.
    isPublished: true,
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
    // Demos are always "viewable" — the local, no-database equivalent of
    // published — so RSVP (gated on isPublished, not isDemo, in the
    // composition renderer's RsvpSection) stays exactly as available as
    // it always was.
    isPublished: true,
  };
}

/**
 * Builds the view model for a PRIVATE PREVIEW TOKEN's sanitized payload
 * — Stage 5 (2026-09-10, see PROJECT_STATUS.md's Stage 5 section).
 * Returns null for a token that doesn't resolve to anything (invalid,
 * malformed — though malformed tokens are already rejected earlier by
 * isValidPreviewTokenFormat() before a database call is even made —
 * rotated, or revoked): fetchInvitePreview()/get_invite_preview()
 * already collapse every one of those reasons into the same `null`/no
 * row, so there is only one branch here too, matching
 * buildPublicInviteViewModel()'s "one safe unavailable response" shape
 * exactly.
 *
 * Unlike buildPublicInviteViewModel(), `isPublished` here reflects the
 * REAL, current publication state of the underlying invitation — a
 * preview token unlocks content regardless of whether publishedAt is
 * set, so this is the one builder where isPublished can actually be
 * false. PublicInviteView reads this to decide whether to offer RSVP at
 * all: an unpublished invitation previewed this way never gets an RSVP
 * section, exactly as if it had been viewed through the ordinary
 * (published-only) /invite/[id] path and found not-yet-published.
 *
 * No guest personalization of any kind — guestId/guestName are always
 * undefined here, by construction (get_invite_preview() has no
 * parameter for a guest token and no notion of one at all): "never
 * resolve guest personalization through the preview token."
 */
export function buildPreviewInviteViewModel(preview: PreviewInvite | null): InviteViewModel | null {
  if (!preview) return null;

  return {
    inviteId: preview.slug,
    guestId: undefined,
    guestName: undefined,
    tier: preview.tier ?? "bronze",
    content: preview.content,
    eventDate: preview.eventDate ?? undefined,
    song: preview.song ?? undefined,
    isDemo: false,
    isPublished: Boolean(preview.publishedAt),
  };
}

/**
 * Builds the view model an invitation's OWNER sees for their own
 * invitation, from the owner-only read (getInviteServer()/StoredInvite —
 * never a raw row handed to any OTHER caller) — Stage 5, used by
 * src/app/dashboard/invite/[id]/page.tsx. Reuses the same trusted
 * composition renderer (Stage 6, src/components/composition/
 * CompositionRenderer.tsx) the public route and preview route use, so
 * an owner previewing their own unpublished invitation sees genuinely
 * the same rendering their eventual guests will, not a
 * separately-maintained "owner preview" markup that could drift out of
 * sync with it.
 *
 * `content`/`eventDate`/`song`/`tier` all come from the owner-only row,
 * never withheld — the owner is always entitled to see their own
 * invitation regardless of publishedAt, the same reasoning
 * buildPreviewInviteViewModel() applies for a valid preview token.
 * `isPublished` reflects the real publishedAt, so RSVP is offered here
 * (via can_insert_rsvp(), still re-verified server-side regardless) only
 * once the invitation is actually live — an owner testing their own
 * unpublished invitation never gets a working-looking RSVP form that
 * would silently fail.
 */
export function buildOwnerInviteViewModel(stored: StoredInvite): InviteViewModel {
  return {
    inviteId: stored.id,
    guestId: undefined,
    guestName: undefined,
    tier: stored.answers.tier || "bronze",
    content: stored.content,
    eventDate: stored.answers.eventDate || undefined,
    song: stored.answers.song || undefined,
    isDemo: false,
    isPublished: Boolean(stored.publishedAt),
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
