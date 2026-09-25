"use client";

import { useId, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import {
  type GuestRow,
  makeEmptyRow,
  nonEmptyGuestCount,
  parseGuestNamesText,
} from "./guest-utils";

/**
 * Stage 11 — replaces the plain 8-row textarea (the primary complaint
 * from the owner's screenshot review) with a structured, one-row-per-
 * guest interface. Reusable as the survey's early guest estimate ONLY —
 * the explanatory copy at the top is deliberate: this is not the Stage 10
 * admin guest-management system (household grouping, contact info,
 * plus-ones, RSVP tracking — src/app/admin/invitations/[id]/guests),
 * which is configured later once an invitation is accepted.
 */
export function GuestListStep({
  rows,
  onChange,
  showValidation,
}: {
  rows: GuestRow[];
  onChange: (rows: GuestRow[]) => void;
  showValidation: boolean;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const countId = useId();

  const count = nonEmptyGuestCount(rows);
  const isEmpty = rows.length === 0;
  const hasNoNamedGuest = showValidation && count === 0;

  function updateRow(id: string, name: string) {
    onChange(rows.map((r) => (r.id === id ? { ...r, name } : r)));
  }

  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow() {
    onChange([...rows, makeEmptyRow()]);
  }

  function applyPasted() {
    const names = parseGuestNamesText(pasteText);
    if (names.length === 0) return;
    const filled = rows.filter((r) => r.name.trim());
    const added = names.map((name) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name }));
    onChange([...filled, ...added]);
    setPasteText("");
    setPasteOpen(false);
  }

  return (
    <div>
      <h2 className="font-display text-3xl">Your guest list</h2>
      <p className="mt-2 max-w-xl text-ink-soft">
        Platinum generates a uniquely named invite and its own personal
        &ldquo;click me&rdquo; link for everyone you add here.
      </p>
      <p className="mt-3 max-w-xl rounded-sm border border-champagne bg-champagne-soft px-4 py-3 text-xs text-ink-soft">
        This is an early estimate to get you started. Detailed guest
        management — households, contact details, plus-ones, and RSVP
        tracking — is configured after your invitation is accepted, from
        your dashboard.
      </p>

      <div className="mt-8 flex items-center justify-between">
        <span id={countId} className="text-sm font-medium text-ink" aria-live="polite">
          <Users className="mr-1.5 inline h-4 w-4 text-ink-soft" aria-hidden="true" />
          {count} {count === 1 ? "guest" : "guests"} added
        </span>
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="focus-ring rounded-sm text-sm text-ink-soft underline underline-offset-4 transition hover:text-ink"
          aria-expanded={pasteOpen}
        >
          {pasteOpen ? "Hide paste option" : "Paste multiple names"}
        </button>
      </div>

      {pasteOpen && (
        <div className="mt-4 rounded-sm border border-line bg-paper-raised p-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-soft" htmlFor="paste-guests">
            Paste names — one per line, or comma-separated
          </label>
          <textarea
            id="paste-guests"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"Aria Thompson\nRohan Mehta\nThe Alvarez Family"}
            className="focus-ring mt-2 w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={applyPasted}
            className="focus-ring mt-3 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft"
          >
            Add these names
          </button>
        </div>
      )}

      <ol className="mt-6 space-y-3" aria-describedby={countId}>
        {rows.map((row, i) => (
          <li key={row.id} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right text-sm text-ink-soft" aria-hidden="true">
              {i + 1}.
            </span>
            <label className="sr-only" htmlFor={`guest-${row.id}`}>
              Guest {i + 1} name
            </label>
            <input
              id={`guest-${row.id}`}
              type="text"
              value={row.name}
              onChange={(e) => updateRow(row.id, e.target.value)}
              placeholder="Guest or household name"
              className="focus-ring min-w-0 flex-1 rounded-sm border border-line bg-paper-raised px-4 py-2.5 text-sm outline-none transition focus:border-ink"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              aria-label={`Remove guest ${i + 1}`}
              className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-paper hover:text-burgundy"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>

      {isEmpty && (
        <div className="mt-6 rounded-sm border border-dashed border-line py-10 text-center">
          <p className="text-sm text-ink-soft">No guests yet.</p>
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="focus-ring mt-4 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink"
      >
        <Plus className="h-4 w-4" />
        {isEmpty ? "Add your first guest" : "Add another guest"}
      </button>

      {hasNoNamedGuest && (
        <p role="alert" className="mt-4 text-sm text-burgundy">
          Add at least one guest name to continue, or go back and choose a different tier.
        </p>
      )}
    </div>
  );
}
