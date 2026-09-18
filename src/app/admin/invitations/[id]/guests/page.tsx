import Link from "next/link";
import { getAdminInvitationDetail } from "@/lib/invitation-admin.server";
import { listInvitationGuests, listHouseholds, getGuestDashboardSummary } from "@/lib/guest-admin.server";
import { GuestManagementPanel } from "./GuestManagementPanel";

export const metadata = { title: "Guests — Admin — Enveloped" };

type Props = { params: Promise<{ id: string }> };

/**
 * The admin guest-management page — Stage 10. A dedicated route (not
 * folded into the already-large InvitationEditor.tsx), the same
 * "physically separate" posture /admin/invitations/[id]/preview-frame
 * already established for another self-contained admin concern.
 *
 * Server-fetches everything the panel's first render needs directly
 * through guest-admin.server.ts (already admin-gated internally, same as
 * every other *-admin.server.ts read) — never through this project's own
 * /api/admin/invitations/[id]/guests GET route, which exists for the
 * client panel's own re-fetch-after-mutation calls instead.
 */
export default async function AdminInvitationGuestsPage({ params }: Props) {
  const { id } = await params;
  const invitation = await getAdminInvitationDetail(id);

  if (!invitation) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-ink-soft">This invitation doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/admin/requests" className="focus-ring rounded mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          Back to requests
        </Link>
      </div>
    );
  }

  const [guests, households, dashboard] = await Promise.all([
    listInvitationGuests(id),
    listHouseholds(id),
    getGuestDashboardSummary(id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/admin/invitations/${id}`} className="focus-ring rounded text-xs font-medium text-ink-soft underline-offset-2 hover:underline">
            ← Invitation editor
          </Link>
          <h1 className="mt-1 font-display text-3xl">Guests</h1>
        </div>
        <span className="text-xs text-ink-soft">
          Slug: <code>{invitation.slug}</code>
        </span>
      </div>

      <div className="mt-8">
        <GuestManagementPanel
          invitationId={id}
          initialGuests={guests}
          initialHouseholds={households}
          initialDashboard={dashboard}
          isPublished={Boolean(invitation.publishedAt)}
        />
      </div>
    </div>
  );
}
