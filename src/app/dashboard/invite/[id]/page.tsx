import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInviteServer } from "@/lib/storage.server";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";
import { isValidSlug, buildOwnerInviteViewModel } from "@/lib/invite-view-model";
import { buildOwnerManagementViewModel } from "@/lib/owner-invite-view-model";
import { OwnerManagementBar } from "./OwnerManagementBar";
import { PublicInviteView } from "@/components/invite/PublicInviteView";
import { UnavailableInvite } from "@/components/invite/UnavailableInvite";

/**
 * The dedicated, authenticated owner-management route — Stage 5
 * (2026-09-10, see PROJECT_STATUS.md's Stage 5 section). Re-hosts the
 * paywall/awaiting-publication status and share-panel behavior Stage 4
 * removed from the public /invite/[id] route (see that stage's
 * "Remaining risks" — this route is the fix), WITHOUT bringing any of
 * that owner-management/PayPal-loading code back onto the public guest
 * page: this is a genuinely separate route with its own bundle, never
 * imported by, or reachable from, /invite/[id].
 *
 * The real authorization boundary lives HERE, server-side, not in
 * OwnerManagementBar (a Client Component) and not in proxy.ts (an
 * optimistic, session-presence-only redirect — see that file's own
 * comment on why a real database check doesn't belong there). Two
 * things are verified, in order, before anything owner-specific is ever
 * rendered:
 *   1. Is there a real, signed-in session at all? (createServerSupabaseClient()
 *      + auth.getUser(), the same session-aware check every other
 *      protected page in this app uses — admin.server.ts's checkAdmin(),
 *      the PayPal order route, etc.)
 *   2. Does getInviteServer(id) — the OWNER-ONLY read, gated by invites'
 *      own owner_id RLS policy (20260901114159_auth_ownership.sql) —
 *      return a row for THIS caller? A non-owner's genuinely
 *      authenticated request for someone else's invite gets exactly
 *      `null` here, the identical result as a slug that doesn't exist at
 *      all, and both render the identical UnavailableInvite response —
 *      "another authenticated user must receive a safe denied/not-found
 *      response," never a distinguishable one, the same principle
 *      /invite/[id] already applies to "missing" vs. "unpublished."
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage your invite — Enveloped",
  // This is an owner-only management surface, not content meant to be
  // discovered or shared — never indexed, matching /preview/[token]'s
  // own reasoning even though the sensitivity here is different (this
  // page requires a real session; a preview token is the credential
  // there).
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ManageInvitePage({ params }: Props) {
  const { id } = await params;

  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = client ? await client.auth.getUser() : { data: { user: null } };

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(sanitizeRedirectPath(`/dashboard/invite/${id}`))}`);
  }

  if (!isValidSlug(id)) {
    return (
      <main>
        <UnavailableInvite homeHref="/dashboard" homeLabel="Back to my invites" />
      </main>
    );
  }

  const invite = await getInviteServer(id);
  if (!invite) {
    return (
      <main>
        <UnavailableInvite homeHref="/dashboard" homeLabel="Back to my invites" />
      </main>
    );
  }

  return (
    <main>
      <OwnerManagementBar initial={buildOwnerManagementViewModel(invite)} />
      <PublicInviteView model={buildOwnerInviteViewModel(invite)} />
    </main>
  );
}
