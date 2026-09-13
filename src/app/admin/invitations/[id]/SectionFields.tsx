"use client";

import { MOTION_PRESETS, type CompositionSection } from "@/lib/composition/schema";
import { EVENT_TYPES } from "@/lib/composition/event-types";

/**
 * Field-level editors for each registered section type — Stage 8 Part D:
 * "a structured form editor, not a free-form page builder." Every input
 * here maps directly to one field of one section's already-Zod-validated
 * `data` shape (src/lib/composition/schema.ts) — there is no raw-HTML/
 * raw-JSON escape hatch anywhere in this file. `onChange` always receives
 * a complete, replacement `data` object for the section it belongs to;
 * InvitationEditor.tsx is the only place that actually mutates the
 * composition array, keeping every field editor here a small, easily
 * keyboard-operable, controlled-input component.
 */

const inputClass = "focus-ring w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-ink-soft";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function MotionPresetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Reveal animation">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {MOTION_PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </Field>
  );
}

type SectionOf<T extends CompositionSection["type"]> = Extract<CompositionSection, { type: T }>;

export function SectionFields({ section, onChange }: { section: CompositionSection; onChange: (data: unknown) => void }) {
  switch (section.type) {
    case "opening": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Eyebrow (small text above the headline)">
            <input className={inputClass} value={d.eyebrow ?? ""} onChange={(e) => onChange({ ...d, eyebrow: e.target.value || undefined })} />
          </Field>
          <Field label="Headline">
            <input className={inputClass} value={d.headline} onChange={(e) => onChange({ ...d, headline: e.target.value })} />
          </Field>
          <Field label="Subheadline">
            <input className={inputClass} value={d.subheadline ?? ""} onChange={(e) => onChange({ ...d, subheadline: e.target.value || undefined })} />
          </Field>
        </div>
      );
    }
    case "greeting":
      return <p className="text-xs text-ink-soft">No content — this section shows a personalized greeting to a named guest link automatically.</p>;
    case "intro": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={d.title} onChange={(e) => onChange({ ...d, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className={inputClass} rows={3} value={d.description ?? ""} onChange={(e) => onChange({ ...d, description: e.target.value || undefined })} />
          </Field>
        </div>
      );
    }
    case "welcome": {
      const d = section.data;
      return (
        <Field label="Welcome message">
          <textarea className={inputClass} rows={3} value={d.message} onChange={(e) => onChange({ ...d, message: e.target.value })} />
        </Field>
      );
    }
    case "story": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={d.title ?? ""} onChange={(e) => onChange({ ...d, title: e.target.value || undefined })} />
          </Field>
          <Field label="Story">
            <textarea className={inputClass} rows={5} value={d.body} onChange={(e) => onChange({ ...d, body: e.target.value })} />
          </Field>
        </div>
      );
    }
    case "schedule": {
      const d = section.data;
      return (
        <div className="space-y-3">
          {d.entries.map((entry, i) => (
            <div key={entry.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
              <Field label="Label">
                <input
                  className={inputClass}
                  value={entry.label}
                  onChange={(e) => {
                    const entries = d.entries.slice();
                    entries[i] = { ...entry, label: e.target.value };
                    onChange({ ...d, entries });
                  }}
                />
              </Field>
              <Field label="When / where">
                <input
                  className={inputClass}
                  value={entry.value}
                  onChange={(e) => {
                    const entries = d.entries.slice();
                    entries[i] = { ...entry, value: e.target.value };
                    onChange({ ...d, entries });
                  }}
                />
              </Field>
              <Field label="Event type">
                <select
                  className={inputClass}
                  value={entry.eventTypeId ?? ""}
                  onChange={(e) => {
                    const entries = d.entries.slice();
                    entries[i] = { ...entry, eventTypeId: (e.target.value || null) as typeof entry.eventTypeId };
                    onChange({ ...d, entries });
                  }}
                >
                  <option value="">—</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={() => onChange({ ...d, entries: d.entries.filter((_, j) => j !== i) })}
                disabled={d.entries.length <= 1}
                className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...d, entries: [...d.entries, { id: `schedule-${Date.now().toString(36)}`, eventTypeId: null, label: "New event", value: "To be confirmed" }] })
            }
            disabled={d.entries.length >= 12}
            className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-ink disabled:opacity-30"
          >
            + Add schedule entry
          </button>
        </div>
      );
    }
    case "dateTime": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Event date and time">
            <input
              type="datetime-local"
              className={inputClass}
              value={d.eventDate.slice(0, 16)}
              onChange={(e) => onChange({ ...d, eventDate: e.target.value })}
            />
          </Field>
          <Field label="Label (e.g. Countdown to the ceremony)">
            <input className={inputClass} value={d.label ?? ""} onChange={(e) => onChange({ ...d, label: e.target.value || undefined })} />
          </Field>
        </div>
      );
    }
    case "venue": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Venue name">
            <input className={inputClass} value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Address">
            <textarea className={inputClass} rows={2} value={d.address ?? ""} onChange={(e) => onChange({ ...d, address: e.target.value || undefined })} />
          </Field>
        </div>
      );
    }
    case "mapLink": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Button label">
            <input className={inputClass} value={d.label} onChange={(e) => onChange({ ...d, label: e.target.value })} />
          </Field>
          <Field label="Map URL (https:// only)">
            <input className={inputClass} value={d.url} onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </Field>
        </div>
      );
    }
    case "dressCode": {
      const d = section.data;
      return (
        <Field label="Dress code">
          <textarea className={inputClass} rows={2} value={d.description} onChange={(e) => onChange({ ...d, description: e.target.value })} />
        </Field>
      );
    }
    case "gallery": {
      const d = section.data;
      return (
        <div className="space-y-3">
          {d.items.map((item, i) => (
            <div key={item.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
              <Field label="Image URL (optional)">
                <input
                  className={inputClass}
                  value={item.imageUrl ?? ""}
                  onChange={(e) => {
                    const items = d.items.slice();
                    items[i] = { ...item, imageUrl: e.target.value || null };
                    onChange({ ...d, items });
                  }}
                />
              </Field>
              <Field label="Alt text (required for accessibility)">
                <input
                  className={inputClass}
                  value={item.alt}
                  onChange={(e) => {
                    const items = d.items.slice();
                    items[i] = { ...item, alt: e.target.value };
                    onChange({ ...d, items });
                  }}
                />
              </Field>
              <Field label="Fallback color">
                <input
                  type="color"
                  className="focus-ring h-9 w-16 rounded border border-line"
                  value={item.colorFallback ?? "#e2c07a"}
                  onChange={(e) => {
                    const items = d.items.slice();
                    items[i] = { ...item, colorFallback: e.target.value };
                    onChange({ ...d, items });
                  }}
                />
              </Field>
              <button
                type="button"
                onClick={() => onChange({ ...d, items: d.items.filter((_, j) => j !== i) })}
                disabled={d.items.length <= 1}
                className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-red-400 hover:text-red-500 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...d, items: [...d.items, { id: `gallery-${Date.now().toString(36)}`, imageUrl: null, alt: "Describe this image", colorFallback: "#e2c07a" }] })
            }
            disabled={d.items.length >= 12}
            className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-ink disabled:opacity-30"
          >
            + Add gallery item
          </button>
        </div>
      );
    }
    case "rsvp": {
      const d = section.data;
      return (
        <Field label="RSVP prompt">
          <input className={inputClass} value={d.prompt ?? ""} onChange={(e) => onChange({ ...d, prompt: e.target.value || undefined })} />
        </Field>
      );
    }
    case "music": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Audio URL (https:// only — leave blank for no music)">
            <input className={inputClass} value={d.src ?? ""} onChange={(e) => onChange({ ...d, src: e.target.value || null })} />
          </Field>
          <Field label="Title">
            <input className={inputClass} value={d.title ?? ""} onChange={(e) => onChange({ ...d, title: e.target.value || null })} />
          </Field>
          <Field label="Artist / rights credit">
            <input className={inputClass} value={d.credit ?? ""} onChange={(e) => onChange({ ...d, credit: e.target.value || null })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.loop} onChange={(e) => onChange({ ...d, loop: e.target.checked })} className="focus-ring" />
            Loop playback
          </label>
          <Field label={`Starting volume (${Math.round(d.startVolume * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={d.startVolume}
              onChange={(e) => onChange({ ...d, startVolume: Number(e.target.value) })}
              className="focus-ring w-full"
            />
          </Field>
          <p className="text-[11px] text-ink-soft">
            The owner/client must hold the rights to use this track — see public/audio/README.md.
          </p>
        </div>
      );
    }
    case "closing": {
      const d = section.data;
      return (
        <Field label="Closing message">
          <textarea className={inputClass} rows={2} value={d.message} onChange={(e) => onChange({ ...d, message: e.target.value })} />
        </Field>
      );
    }
    case "customText": {
      const d = section.data;
      return (
        <div className="space-y-3">
          <Field label="Heading">
            <input className={inputClass} value={d.heading ?? ""} onChange={(e) => onChange({ ...d, heading: e.target.value || undefined })} />
          </Field>
          <Field label="Body">
            <textarea className={inputClass} rows={4} value={d.body} onChange={(e) => onChange({ ...d, body: e.target.value })} />
          </Field>
        </div>
      );
    }
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

export type { SectionOf };
