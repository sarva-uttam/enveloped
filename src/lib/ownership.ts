/**
 * Pure ownership/visibility resolution for /invite/[id].
 *
 * This exists specifically to replace the old, insecure heuristic
 * `isOwnerView = !demo && !guestSlug` — which treated *anyone* who opened
 * the base link (no ?guest= param) as the owner, including a stranger who
 * simply stripped the query string off a shared guest link. Ownership is
 * now decided ONLY by comparing the authenticated viewer's id against the
 * invite's real `owner_id` — never inferred from the presence/absence of
 * a query param.
 *
 * Kept dependency-free (no Supabase/React imports) so it's trivial to unit
 * test in isolation — see ownership.test.ts.
 *
 * Stage 3 (2026-09-09, see PROJECT_STATUS.md and
 * supabase/migrations/20260909150000_publication_payment_split.sql): the
 * gating input is `isPublished`, not `isPaid` — published_at, not paid,
 * is the actual database-level access gate now, and this function must
 * track that exactly (it previously took `isPaid` here, which is why the
 * kind names below already said "published"/"unpublished" even before
 * this fix — the NAMES were always about publication, only the INPUT
 * driving them was, until now, wrongly payment-derived).
 */

export type ViewerRole =
  | { kind: "demo" }
  | { kind: "not-found" }
  | { kind: "owner-unpublished" } // owner, invite not yet published — show publish/payment status
  | { kind: "owner-published" } // owner, invite published — show share/manage panel
  | { kind: "guest-unpublished" } // non-owner, invite not yet published — nothing to see
  | { kind: "guest-published"; guestSlug: string | null };

export interface ResolveViewerRoleParams {
  isDemo: boolean;
  /** true = row exists, false = confirmed missing, null = still loading */
  storedExists: boolean | null;
  /** Whether published_at is set — THE access gate. Never derived from
   *  `paid`; payment and publication are independent (see PROJECT_STATUS.md's
   *  Stage 3 section). */
  isPublished: boolean;
  /** The signed-in viewer's user id, or null if not authenticated. */
  currentUserId: string | null;
  /** The invite row's owner_id. null for legacy rows created before auth existed. */
  ownerId: string | null;
  guestSlug: string | null;
}

export function resolveViewerRole(params: ResolveViewerRoleParams): ViewerRole | null {
  const { isDemo, storedExists, isPublished, currentUserId, ownerId, guestSlug } = params;

  if (isDemo) return { kind: "demo" };
  if (storedExists === null) return null; // still loading
  if (storedExists === false) return { kind: "not-found" };

  const isOwner = currentUserId !== null && ownerId !== null && currentUserId === ownerId;

  if (isOwner) {
    return isPublished ? { kind: "owner-published" } : { kind: "owner-unpublished" };
  }

  return isPublished ? { kind: "guest-published", guestSlug } : { kind: "guest-unpublished" };
}
