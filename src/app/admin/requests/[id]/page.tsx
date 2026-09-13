import Link from "next/link";
import { getRequestDetail } from "@/lib/requests-admin.server";
import { REQUEST_STATUS_LABELS } from "@/lib/requests";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { RequestStatusControl } from "../RequestStatusControl";
import { CreateInvitationControl } from "../CreateInvitationControl";

export const metadata = { title: "Request — Admin — Enveloped" };

/**
 * The request detail page — Stage 8 Part B/C. Server-rendered from
 * getRequestDetail() (admin-only; every field here, including internal
 * notes, is intentionally admin-eyes-only — never reachable by an
 * ordinary user, an anonymous visitor, or through any public/preview
 * route, which read from entirely different tables/RPCs and have never
 * been given access to `requests` at all).
 *
 * Shows the "already has an invitation" state distinctly from "no
 * invitation yet" (Part C: "if a request already has an invitation,
 * direct the administrator to the existing invitation instead of
 * silently creating another one") — the create-invitation control only
 * ever renders when there is genuinely nothing to link to yet.
 */
type Props = { params: Promise<{ id: string }> };

export default async function AdminRequestDetailPage({ params }: Props) {
  const { id } = await params;
  const request = await getRequestDetail(id);

  if (!request) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl">Request unavailable</h1>
        <p className="mt-2 text-sm text-ink-soft">This request doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/admin/requests" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          Back to requests
        </Link>
      </div>
    );
  }

  const categoryLabel = EVENT_CATEGORIES.find((c) => c.id === request.category)?.label ?? request.category;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/admin/requests" className="text-xs font-medium text-ink-soft underline-offset-2 hover:underline">
        ← All requests
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">{request.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {request.referenceCode} · Submitted {new Date(request.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft">
          {REQUEST_STATUS_LABELS[request.status]}
        </span>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Field label="Contact" value={[request.email, request.phone].filter(Boolean).join(" · ") || "Not provided"} />
        <Field label="Preferred contact channel" value={request.preferredChannel} />
        <Field label="Event category" value={categoryLabel} />
        <Field label="Requested date" value={request.eventDate ?? "Not specified"} />
        <Field label="Tier interest" value={request.tierInterest ?? "Not specified"} />
        <Field
          label="Requested occasions"
          value={request.requestedOccasions.length > 0 ? request.requestedOccasions.join(", ") : "None specified"}
        />
        <Field
          label="Agreed price"
          value={request.agreedPrice != null ? `${request.agreedCurrency} ${request.agreedPrice}` : "Not yet agreed"}
        />
        <Field label="Status last changed" value={new Date(request.statusChangedAt).toLocaleString()} />
      </div>

      {request.notes && (
        <div className="mt-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Client notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{request.notes}</p>
        </div>
      )}
      {request.internalNotes && (
        <div className="mt-6 rounded-xl border border-dashed border-line p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Internal notes (admin only)</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{request.internalNotes}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Change status</h2>
        <div className="mt-2">
          <RequestStatusControl requestId={request.id} currentStatus={request.status} />
        </div>
      </div>

      <div className="mt-8">
        {request.invitationId ? (
          <div className="rounded-2xl border border-line bg-paper-raised p-6">
            <h2 className="font-display text-xl">Invitation draft</h2>
            <p className="mt-1 text-xs text-ink-soft">This request already has an invitation.</p>
            <Link
              href={`/admin/invitations/${request.invitationId}`}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Open invitation draft
            </Link>
          </div>
        ) : (
          <CreateInvitationControl requestId={request.id} />
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 text-sm text-ink">{value}</div>
    </div>
  );
}
