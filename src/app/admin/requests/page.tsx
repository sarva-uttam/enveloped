import Link from "next/link";
import { listRequests } from "@/lib/requests-admin.server";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, isRequestStatus, type RequestStatus } from "@/lib/requests";
import { EVENT_CATEGORIES } from "@/lib/categories";

export const metadata = { title: "Requests — Admin — Enveloped" };

/**
 * The admin request list — Stage 8 (see PROJECT_STATUS.md's Stage 8
 * section, Part B). Server-rendered: listRequests() runs at request
 * time, re-verifying admin status itself; AdminLayout has already done
 * the same check, but this page (like every admin page in this project)
 * never trusts a parent layout alone for a data-fetching function that
 * could in principle be called from elsewhere later.
 *
 * The status filter is a plain `<select>` submitting a GET — no client
 * JavaScript required for the core "see requests in this status" flow,
 * consistent with this project's progressive-enhancement preference
 * elsewhere (Stage 4/7). `searchParams` is validated against the real
 * status vocabulary before ever reaching listRequests() — an unknown or
 * garbled `?status=` value is treated as "no filter," never forwarded to
 * the database as a raw string.
 */
type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminRequestsPage({ searchParams }: Props) {
  const { status: rawStatus } = await searchParams;
  const status: RequestStatus | undefined = rawStatus && isRequestStatus(rawStatus) ? rawStatus : undefined;

  const requests = await listRequests(status ? { status } : {});
  const categoryLabel = (id: string) => EVENT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Client requests</h1>
          <p className="mt-1 text-sm text-ink-soft">The consultation-led intake pipeline — new inquiries through completed invitations.</p>
        </div>
        <form className="flex items-center gap-2" action="/admin/requests" method="get">
          <label htmlFor="status-filter" className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Status
          </label>
          <select
            id="status-filter"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
          >
            <option value="">All</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-full border border-line px-3 py-1.5 text-sm transition hover:border-ink">
            Filter
          </button>
        </form>
      </div>

      {requests === null ? (
        <p className="mt-10 text-sm text-red-600">Requests are unavailable right now — administrator access could not be confirmed.</p>
      ) : requests.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
          {status ? `No requests with status "${REQUEST_STATUS_LABELS[status]}" yet.` : "No client requests yet."}
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-raised text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Requested date</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Invitation</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-paper-raised/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/requests/${r.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs text-ink-soft">{r.referenceCode}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{categoryLabel(r.category)}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.eventDate ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">
                      {REQUEST_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.invitationId ? (
                      <Link href={`/admin/invitations/${r.invitationId}`} className="text-xs font-medium text-ink underline-offset-2 hover:underline">
                        View draft
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-soft">Not started</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
