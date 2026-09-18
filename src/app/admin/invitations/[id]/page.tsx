import Link from "next/link";
import { getAdminInvitationDetail } from "@/lib/invitation-admin.server";
import { getRequestDetail } from "@/lib/requests-admin.server";
import { getInvitationReviewHistory } from "@/lib/review-admin.server";
import { InvitationEditor } from "./InvitationEditor";

export const metadata = { title: "Invitation — Admin — Enveloped" };

/**
 * The admin invitation editor page — Stage 8 Parts D/F/G/H/I. Server-
 * rendered data fetch (getAdminInvitationDetail(), admin-only, narrow —
 * see that function's own comment on exactly what it does and does not
 * return), then handed to InvitationEditor (a Client Component) as
 * plain, already-safe serializable props: no owner id, no payment
 * amount, no preview token hash — `hasPreviewLink` is a boolean, nothing
 * more. `privateFieldsForReadiness` is fetched ONLY when this invitation
 * has a connected request, and only the four fields the readiness
 * check's private-leak scan actually needs — never the full RequestDetail
 * object, and never a client prop the guest-facing bundles could ever
 * reach (this is the admin-only editor route).
 */
type Props = { params: Promise<{ id: string }> };

export default async function AdminInvitationPage({ params }: Props) {
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

  const request = invitation.requestId ? await getRequestDetail(invitation.requestId) : null;
  const reviewHistory = invitation.generatorKind === "concierge" ? await getInvitationReviewHistory(invitation.id) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {request && (
            <Link href={`/admin/requests/${request.id}`} className="focus-ring rounded text-xs font-medium text-ink-soft underline-offset-2 hover:underline">
              ← {request.name}&apos;s request
            </Link>
          )}
          <h1 className="mt-1 font-display text-3xl">Invitation editor</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/invitations/${id}/guests`} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            Manage guests
          </Link>
          <span className="text-xs text-ink-soft">
            Slug: <code>{invitation.slug}</code>
          </span>
        </div>
      </div>

      <div className="mt-8">
        <InvitationEditor
          invitationId={invitation.id}
          slug={invitation.slug}
          initialComposition={invitation.composition}
          initialRevision={invitation.compositionRevision}
          publishedAt={invitation.publishedAt}
          hasPreviewLink={invitation.hasPreviewLink}
          generatorKind={invitation.generatorKind}
          initialReviewHistory={reviewHistory}
          privateFieldsForReadiness={
            request ? { email: request.email, phone: request.phone, notes: request.notes, internalNotes: request.internalNotes } : null
          }
        />
      </div>
    </div>
  );
}
