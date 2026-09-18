"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RSVP_STATUS_LABELS,
  MIN_PERMITTED_ATTENDEES,
  MAX_PERMITTED_ATTENDEES,
  type AdminGuestRow,
  type AdminGuestHousehold,
  type AdminGuestDashboardSummary,
  type RsvpStatus,
} from "@/lib/guests";
import { parseGuestImportCsv, type GuestCsvParseResult } from "@/lib/guest-csv";

/**
 * Admin guest management — Stage 10. One self-contained panel covering
 * the guest list, search/filter, create/edit, household management,
 * personalized-link controls, CSV import (client-side preview, explicit
 * confirm to apply), and CSV export. Mutates through
 * /api/admin/invitations/[id]/guests* and refreshes via router.refresh()
 * — the same "server data is the source of truth, re-fetch rather than
 * guess" pattern ReviewPanel.tsx already established.
 *
 * Every raw token this panel ever shows (create/rotate link) comes back
 * in the mutation response exactly once and lives only in local
 * component state for as long as the "shown once" banner is visible —
 * never persisted, never logged.
 */
export function GuestManagementPanel({
  invitationId,
  initialGuests,
  initialHouseholds,
  initialDashboard,
  isPublished,
}: {
  invitationId: string;
  initialGuests: AdminGuestRow[];
  initialHouseholds: AdminGuestHousehold[];
  initialDashboard: AdminGuestDashboardSummary | null;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RsvpStatus>("all");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminGuestRow | "new" | null>(null);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    return initialGuests.filter((g) => {
      if (activeFilter === "active" && !g.isActive) return false;
      if (activeFilter === "inactive" && g.isActive) return false;
      if (statusFilter !== "all" && g.rsvpStatus !== statusFilter) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        if (!g.name.toLowerCase().includes(needle) && !(g.householdName ?? "").toLowerCase().includes(needle) && !(g.contactEmail ?? "").toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [initialGuests, search, statusFilter, activeFilter]);

  async function callGuestAction(guestId: string, action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/guests/${guestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: typeof body.error === "string" ? body.error : "Something went wrong.", tone: "error" });
        return null;
      }
      router.refresh();
      return body;
    } catch {
      setMessage({ text: "Network error. Please try again.", tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOrUpdate(guestId: string | null, input: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const url = guestId ? `/api/admin/invitations/${invitationId}/guests/${guestId}` : `/api/admin/invitations/${invitationId}/guests`;
      const res = await fetch(url, {
        method: guestId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: typeof body.error === "string" ? body.error : "Something went wrong.", tone: "error" });
        return;
      }
      setEditing(null);
      setMessage({ text: guestId ? "Guest updated." : "Guest added.", tone: "info" });
      router.refresh();
    } catch {
      setMessage({ text: "Network error. Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkAction(guest: AdminGuestRow, action: "create-link" | "rotate-link" | "revoke-link") {
    if (action === "rotate-link" && !window.confirm("Rotate this guest's link? The previous link will stop working immediately.")) return;
    if (action === "revoke-link" && !window.confirm("Revoke this guest's link? They will no longer be able to open it.")) return;
    const body = await callGuestAction(guest.id, action);
    if (body?.token) {
      setRevealedTokens((prev) => ({ ...prev, [guest.id]: body.token }));
    }
  }

  async function handleDelete(guest: AdminGuestRow) {
    if (!window.confirm(`Delete ${guest.name}? This cannot be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/guests/${guest.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: typeof body.error === "string" ? body.error : "Something went wrong.", tone: "error" });
        return;
      }
      router.refresh();
    } catch {
      setMessage({ text: "Network error. Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {!isPublished && (
        <p className="rounded-2xl border border-line bg-paper-raised p-4 text-xs text-ink-soft">
          This invitation isn&apos;t published yet — guest links won&apos;t resolve until it is.
        </p>
      )}

      <DashboardSummary dashboard={initialDashboard} />

      {message && (
        <p role="status" className={`text-xs ${message.tone === "error" ? "text-red-500" : "text-ink-soft"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, household, or email"
          aria-label="Search guests"
          className="focus-ring w-64 rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | RsvpStatus)}
          aria-label="Filter by response status"
          className="focus-ring rounded-full border border-line bg-paper px-3 py-2 text-xs text-ink outline-none"
        >
          <option value="all">All responses</option>
          {Object.entries(RSVP_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "active" | "inactive" | "all")}
          aria-label="Filter by active state"
          className="focus-ring rounded-full border border-line bg-paper px-3 py-2 text-xs text-ink outline-none"
        >
          <option value="active">Active</option>
          <option value="inactive">Archived</option>
          <option value="all">All</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setEditing("new")} className="focus-ring rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper">
            Add guest
          </button>
          <button onClick={() => setImportOpen(true)} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            Import CSV
          </button>
          <a href={`/api/admin/invitations/${invitationId}/guests/export`} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            Export guests
          </a>
          <a href={`/api/admin/invitations/${invitationId}/rsvps/export`} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            Export responses
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-raised text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Household</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Attendees</th>
              <th className="px-4 py-3">Link</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((guest) => (
              <tr key={guest.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{guest.name}</p>
                  {!guest.isActive && <p className="text-[11px] text-ink-soft">Archived</p>}
                  {guest.contactEmail && <p className="text-[11px] text-ink-soft">{guest.contactEmail}</p>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{guest.householdName ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{RSVP_STATUS_LABELS[guest.rsvpStatus]}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {guest.rsvpStatus === "attending" ? guest.attendeeCount : "—"} / {guest.permittedAttendees}
                </td>
                <td className="px-4 py-3">
                  {guest.hasLink ? (guest.linkRevoked ? "Revoked" : "Active") : "None"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button disabled={busy} onClick={() => setEditing(guest)} className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink transition hover:border-ink disabled:opacity-40">
                      Edit
                    </button>
                    {!guest.hasLink && (
                      <button disabled={busy} onClick={() => handleLinkAction(guest, "create-link")} className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink transition hover:border-ink disabled:opacity-40">
                        Create link
                      </button>
                    )}
                    {guest.hasLink && (
                      <>
                        <button disabled={busy} onClick={() => handleLinkAction(guest, "rotate-link")} className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink transition hover:border-ink disabled:opacity-40">
                          Rotate
                        </button>
                        {!guest.linkRevoked && (
                          <button disabled={busy} onClick={() => handleLinkAction(guest, "revoke-link")} className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-40">
                            Revoke
                          </button>
                        )}
                      </>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => callGuestAction(guest.id, guest.isActive ? "deactivate" : "activate")}
                      className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink transition hover:border-ink disabled:opacity-40"
                    >
                      {guest.isActive ? "Archive" : "Reactivate"}
                    </button>
                    {!guest.hasLink && guest.rsvpStatus === "pending" && (
                      <button disabled={busy} onClick={() => handleDelete(guest)} className="focus-ring rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-40">
                        Delete
                      </button>
                    )}
                  </div>
                  {revealedTokens[guest.id] && (
                    <div className="mt-2 rounded-xl border border-line bg-paper p-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">Shown once — copy it now</p>
                      <code className="mt-1 block break-all text-[11px] text-ink">
                        {typeof window !== "undefined" ? window.location.origin : ""}/guest/{revealedTokens[guest.id]}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            ?.writeText(`${window.location.origin}/guest/${revealedTokens[guest.id]}`)
                            .catch(() => {})
                        }
                        className="focus-ring mt-1 rounded-full border border-line px-2 py-1 text-[11px] transition hover:border-ink"
                      >
                        Copy link
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No guests match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <HouseholdManager invitationId={invitationId} households={initialHouseholds} onChange={() => router.refresh()} />

      {editing && (
        <GuestEditModal
          guest={editing === "new" ? null : editing}
          households={initialHouseholds}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(input) => handleCreateOrUpdate(editing === "new" ? null : editing.id, input)}
        />
      )}

      {importOpen && <ImportWizard invitationId={invitationId} onClose={() => setImportOpen(false)} onImported={() => router.refresh()} />}
    </div>
  );
}

function DashboardSummary({ dashboard }: { dashboard: AdminGuestDashboardSummary | null }) {
  if (!dashboard) return null;
  const cells: [string, number][] = [
    ["Invited", dashboard.totalInvited],
    ["Responded", dashboard.responded],
    ["Attending", dashboard.attending],
    ["Declined", dashboard.declined],
    ["Pending", dashboard.pending],
    ["Expected attendees", dashboard.totalExpectedAttendees],
    ["Plus-ones", dashboard.plusOneCount],
    ["Dietary notes", dashboard.withDietaryNotes],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-line bg-paper-raised p-4 text-center">
          <p className="text-2xl font-display text-ink">{value}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
        </div>
      ))}
    </div>
  );
}

function HouseholdManager({ invitationId, households, onChange }: { invitationId: string; households: AdminGuestHousehold[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/guest-households`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this household grouping? Guests keep their own records.")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/guest-households/${id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Households</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {households.map((h) => (
          <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink">
            {h.name}
            <button disabled={busy} onClick={() => remove(h.id)} aria-label={`Remove household ${h.name}`} className="focus-ring rounded text-ink-soft hover:text-red-500">
              ×
            </button>
          </span>
        ))}
        {households.length === 0 && <p className="text-xs text-ink-soft">No households yet.</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New household name"
          className="focus-ring w-56 rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
        />
        <button disabled={busy} onClick={add} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}

function GuestEditModal({
  guest,
  households,
  busy,
  onCancel,
  onSave,
}: {
  guest: AdminGuestRow | null;
  households: AdminGuestHousehold[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(guest?.name ?? "");
  const [householdId, setHouseholdId] = useState(guest?.householdId ?? "");
  const [contactEmail, setContactEmail] = useState(guest?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(guest?.contactPhone ?? "");
  const [permittedAttendees, setPermittedAttendees] = useState(guest?.permittedAttendees ?? 1);
  const [allowPlusOne, setAllowPlusOne] = useState(guest?.allowPlusOne ?? false);
  const [internalNotes, setInternalNotes] = useState(guest?.internalNotes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label={guest ? "Edit guest" : "Add guest"}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-xl">{guest ? "Edit guest" : "Add guest"}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-ink-soft">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none" />
          </label>
          <label className="block text-xs text-ink-soft">
            Household
            <select value={householdId ?? ""} onChange={(e) => setHouseholdId(e.target.value || null as unknown as string)} className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none">
              <option value="">None</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            Contact email (private)
            <input type="email" value={contactEmail ?? ""} onChange={(e) => setContactEmail(e.target.value)} className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none" />
          </label>
          <label className="block text-xs text-ink-soft">
            Contact phone (private)
            <input value={contactPhone ?? ""} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none" />
          </label>
          <label className="block text-xs text-ink-soft">
            Permitted attendees
            <input
              type="number"
              min={MIN_PERMITTED_ATTENDEES}
              max={MAX_PERMITTED_ATTENDEES}
              value={permittedAttendees}
              onChange={(e) => setPermittedAttendees(Number(e.target.value))}
              className="focus-ring mt-1 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={allowPlusOne} onChange={(e) => setAllowPlusOne(e.target.checked)} className="focus-ring h-4 w-4 rounded border-line" />
            Allow a plus-one
          </label>
          <label className="block text-xs text-ink-soft">
            Internal notes (never shown to the guest)
            <textarea value={internalNotes ?? ""} onChange={(e) => setInternalNotes(e.target.value)} maxLength={2000} rows={2} className="focus-ring mt-1 w-full rounded-2xl border border-line bg-paper px-4 py-2 text-sm text-ink outline-none" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            Cancel
          </button>
          <button
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                householdId: householdId || null,
                contactEmail: contactEmail.trim() || null,
                contactPhone: contactPhone.trim() || null,
                permittedAttendees,
                allowPlusOne,
                internalNotes: internalNotes.trim() || null,
              })
            }
            className="focus-ring rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportWizard({ invitationId, onClose, onImported }: { invitationId: string; onClose: () => void; onImported: () => void }) {
  const [parseResult, setParseResult] = useState<GuestCsvParseResult | null>(null);
  const [generateLinks, setGenerateLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<{ inserted: number; skipped: number; errored: number; links: string[] } | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    setParseResult(parseGuestImportCsv(text));
    setApplyResult(null);
  }

  async function apply() {
    if (!parseResult || parseResult.rows.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/guests/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.rows, generateLinks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const skipped = body.results.filter((r: { status: string }) => r.status === "skipped").length;
      const errored = body.results.filter((r: { status: string }) => r.status === "error").length;
      setApplyResult({ inserted: body.inserted, skipped, errored, links: Object.values(body.generatedLinks ?? {}) as string[] });
      onImported();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Import guests from CSV">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-display text-xl">Import guests from CSV</h2>
        <p className="mt-1 text-xs text-ink-soft">
          <a href="/api/admin/guests/import-template" className="underline underline-offset-2">
            Download the template
          </a>{" "}
          to see the expected columns.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="focus-ring mt-4 block w-full text-sm text-ink"
        />

        {parseResult && !applyResult && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-ink-soft">
              {parseResult.rows.length} valid row(s), {parseResult.errors.length} error(s)
              {parseResult.truncated ? " (file truncated to 500 rows)" : ""}.
            </p>
            {parseResult.errors.length > 0 && (
              <ul className="max-h-32 overflow-y-auto rounded-xl border border-line p-2 text-xs text-red-500">
                {parseResult.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-paper-raised">
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5">Household</th>
                    <th className="px-2 py-1.5">Email</th>
                    <th className="px-2 py-1.5">Attendees</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5">{r.householdName ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.contactEmail ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.permittedAttendees ?? 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" checked={generateLinks} onChange={(e) => setGenerateLinks(e.target.checked)} className="focus-ring h-4 w-4 rounded border-line" />
              Generate personalized links for imported guests
            </label>
          </div>
        )}

        {applyResult && (
          <div className="mt-4 rounded-xl border border-line bg-paper-raised p-4 text-sm">
            <p>
              Imported {applyResult.inserted}, skipped {applyResult.skipped}, {applyResult.errored} row error(s).
            </p>
            {applyResult.links.length > 0 && (
              <>
                <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-ink-soft">Links shown once — copy them now</p>
                <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs">
                  {applyResult.links.map((token, i) => (
                    <li key={i} className="break-all">
                      {typeof window !== "undefined" ? window.location.origin : ""}/guest/{token}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink transition hover:border-ink">
            {applyResult ? "Close" : "Cancel"}
          </button>
          {!applyResult && (
            <button
              disabled={busy || !parseResult || parseResult.rows.length === 0}
              onClick={apply}
              className="focus-ring rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper disabled:opacity-40"
            >
              Import {parseResult?.rows.length ?? 0} guest(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
