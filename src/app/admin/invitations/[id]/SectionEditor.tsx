"use client";

import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import type { CompositionSection } from "@/lib/composition/schema";
import { SectionFields, MotionPresetSelect } from "./SectionFields";

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
  return (
    <div className={`rounded-2xl border p-4 ${section.enabled ? "border-line bg-paper-raised" : "border-dashed border-line bg-paper opacity-70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft">{section.type}</span>
          <code className="text-[11px] text-ink-soft">{section.id}</code>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${section.type} section up`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Move ${section.type} section down`}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <label className="ml-2 flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={section.enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
            Enabled
          </label>
          <button
            type="button"
            aria-label={`Remove ${section.type} section`}
            onClick={onRemove}
            className="ml-2 rounded-full border border-line p-1.5 text-ink-soft transition hover:border-red-400 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

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
  );
}
