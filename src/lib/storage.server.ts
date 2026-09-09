import "server-only";
import { createServerSupabaseClient } from "./supabase/server";
import { supabaseAdmin, supabaseAdminConfigured } from "./supabase/admin";
import { fetchInvite, fetchGuestEntry, fetchPublicInvite, type StoredInvite, type PublicInvite } from "./storage-queries";

/**
 * Server-only data access — for Server Components and Route Handlers.
 * Client components must use storage.ts instead, never this file (it's
 * guarded by the `server-only` import above, which fails the build if
 * client code tries to pull it in).
 *
 * getInviteServer/getGuestEntryServer use the session-aware SERVER client
 * (src/lib/supabase/server.ts) — same RLS as the browser client, just
 * reading the actual caller's cookies via next/headers instead of an
 * unauthenticated, no-cookie instance. This replaces an earlier version
 * of this codebase that called storage.ts's browser-client-backed
 * getInvite() from server contexts (a Route Handler, and
 * generateMetadata) — that worked for public reads only by accident, and
 * @supabase/ssr's createBrowserClient explicitly throws if anything ever
 * calls .auth.* through it outside a real browser. See git history / the
 * prior REVIEW_BRIEF.md note on this for the full trace.
 *
 * markInvitePaid is the one exception that uses the ADMIN (service-role)
 * client, not the session-aware one — see src/lib/supabase/admin.ts for
 * why.
 */

export async function getInviteServer(id: string): Promise<StoredInvite | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  return fetchInvite(client, id);
}

export async function getGuestEntryServer(
  inviteSlug: string,
  guestSlug: string
): Promise<{ id: string; name: string; clickTeaser: string } | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  return fetchGuestEntry(client, inviteSlug, guestSlug);
}

/**
 * Server-side counterpart to storage.ts's getPublicInvite() — for
 * generateMetadata, which runs unauthenticated (or as whoever's session
 * cookie is on the request) and must never see answers/owner_id/
 * paypal_order_id. See PublicInvite / fetchPublicInvite() in
 * storage-queries.ts.
 */
export async function getPublicInviteServer(slug: string): Promise<PublicInvite | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  return fetchPublicInvite(client, slug);
}

/**
 * Marks an invite as paid after a successful, verified PayPal capture.
 *
 * `invitationId` is the invite's internal uuid (invites.id), NOT the
 * slug — the caller is always the capture route, which already has this
 * value authoritatively from the matched `payments` row
 * (payments.invitation_id), never from client input. Keying off the
 * uuid here (rather than the slug, as an earlier version of this
 * function did) avoids a redundant lookup and matches what the caller
 * actually has on hand.
 *
 * Uses the service-role client (bypasses RLS) — this used to live in
 * storage.ts alongside client-callable functions and ran through the
 * public anon-key client, relying on an "update using (true)" policy
 * that also covered everyone else. Now that invites are owner-scoped,
 * that public policy is gone, so this needed its own server-only path to
 * keep working exactly as before. See src/lib/supabase/admin.ts for why
 * that's safe and what it does/doesn't change about payment integrity.
 * Also the one write path exempted from the invites_reject_client_paid_update
 * trigger (supabase/migrations/20260901114212_payment_integrity.sql),
 * since it runs as service_role.
 *
 * Idempotent by design: setting paid=true / paypal_order_id on a row
 * that already has those values is a harmless no-op — this is what lets
 * the capture route safely retry just this step (see the capture route's
 * "already captured, recover the invite flip" branch) without needing to
 * first check whether the previous attempt actually got this far.
 *
 * Stage 3 confirmation (2026-09-09, see PROJECT_STATUS.md): this
 * function sets ONLY paid/paypal_order_id, exactly as it always has —
 * it does not, and must never, touch published_at. Payment must never
 * automatically publish an invitation; that's the owner's explicit
 * business rule this stage implements. Verified, not just asserted: the
 * update payload literally has no published_at key, and the database's
 * own invites_reject_client_paid_update trigger would reject
 * publish_at/paid being set together from anything but this exact
 * service-role path anyway (see
 * supabase/migrations/20260909150000_publication_payment_split.sql).
 * Publishing remains an administrator-only action via
 * publish_invite()/unpublish_invite() — never triggered by this
 * function, directly or indirectly.
 */
export async function markInvitePaid(invitationId: string, paypalOrderId: string): Promise<boolean> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return false;

  const { error } = await supabaseAdmin
    .from("invites")
    .update({ paid: true, paypal_order_id: paypalOrderId })
    .eq("id", invitationId);

  return !error;
}
