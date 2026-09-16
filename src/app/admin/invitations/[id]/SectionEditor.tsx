"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import type { CompositionSection } from "@/lib/composition/schema";
import { SectionFields, MotionPresetSelect } from "./SectionFields";

/** A short, friendly label + one-line description per section type —
 *  UI-only copy, never part of the composition itself. */
const SECTION_INFO: Record<CompositionSection["type"], { label: string; description: string }> = {
  opening: { label: "Opening", description: "The first thing a guest sees — headline and optional eyebrow." },
  greeting: { label: "Personal greeting", description: "Shown automatically to a named guest link. No content to edit." },
  intro: { label: "Introduction", description: "A short title/description block." },
  welcome: { label: "Welcome message", description: "A warm welcome paragraph." },
  story: { label: "Our story", description: "A longer narrative section." },
  schedule: { label: "Schedule", description: "One or more event entries." },
  dateTime: { label: "Date & countdown", description: "The primary event date, driving the live countdown." },
  venue: { label: "Venue", description: "Venue name and address." },
  mapLink: { label: "Map link", description: "A button linking out to directions." },
  dressCode: { label: "Dress code", description: "A short dress-code note." },
  gallery: { label: "Gallery", description: "A small grid of photos." },
  rsvp: { label: "RSVP", description: "The RSVP form guests use to respond." },
  music: { label: "Music", description: "An optional background track." },
  closing: { label: "Closing message", description: "The final sign-off message." },
  customText: { label: "Custom text", description: "A freeform heading + body block." },
};

/**
 * One section's editing card — Stage 8 Part D. "Simple move-up/move-down
 * controls are acceptable and preferable" over drag-and-drop: both
 * buttons are real, labeled, keyboard-reachable `<button>`s (native tab
 * order, native Enter/Space activation — no custom keyboard handling to
 * get wrong), disabled at the ends of the list rather than wrapping
 * around. Reordering is applied via handleMove in InvitationEditor.tsx,
 * which simply moves the section in the array — array order IS section
 * render order (CompositionRenderer, unchanged since Stage 6), so
 * "deterministic" holds by construction, not by a separate ordering
 * field.
 */
export function SectionEditor({
  section,
  index,
  total,
  errors,
  onChangeData,
  onChangeMotionPreset,
  onToggleEnabled,
  onMove,
  onRemove,
}: {
  section: CompositionSection;
  index: number;
  total: number;
  errors: string[];
  onChangeData: (data: unknown) => void;
  onChangeMotionPreset: (preset: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const hasErrors = errors.length > 0;
  const [expanded, setExpanded] = useState(hasErrors);
  const info = SECTION_INFO[section.type];
  const panelId = `section-panel-${section.id}`;

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-2xl border p-4 ${hasErrors ? "border-red-300" : section.enabled ? "border-line bg-paper-raised" : "border-dashed border-line bg-paper opacity-70"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${info.label} section`}
          className="focus-ring -m-1 flex min-w-0 items-center gap-2 rounded p-1 text-left"
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
          {hasErrors ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{info.label}</span>
            <span className="block truncate text-[11px] text-ink-soft">{info.description}</span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${info.label} section up`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-30 focus-ring"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Move ${info.label} section down`}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-30 focus-ring"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <label className="ml-2 flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={section.enabled} onChange={(e) => onToggleEnabled(e.target.checked)} className="focus-ring" />
            Enabled
          </label>
          <button
            type="button"
            aria-label={`Remove ${info.label} section`}
            onClick={onRemove}
            className="ml-2 rounded-full border border-line p-1.5 text-ink-soft transition hover:border-red-400 hover:text-red-500 focus-ring"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId}>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_180px]">
            <div>
              <SectionFields section={section} onChange={onChangeData} />
            </div>
            <MotionPresetSelect value={section.motionPreset} onChange={onChangeMotionPreset} />
          </div>

          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
