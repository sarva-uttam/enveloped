"use client";

import { useState } from "react";
import { CompositionRenderer } from "@/components/composition/CompositionRenderer";
import {
  DESIGN_TEMPLATE_IDS,
  DESIGN_TEMPLATES,
  applyDesignTemplate,
  templateConflictsWithDraft,
  templatesForPack,
  type DesignTemplateDefinition,
} from "@/lib/composition/design-templates";
import { CULTURAL_PACKS } from "@/lib/composition/cultural-packs";
import type { InvitationComposition } from "@/lib/composition/schema";

/**
 * The admin template-selection experience — Stage 12 Parts 4/5. Every
 * card's preview is a genuine, small live render of the trusted
 * CompositionRenderer (never a screenshot or stock image) — the exact
 * same component every public/preview/owner surface uses, fed a minimal
 * demo composition built from that template's own defaults via
 * applyDesignTemplate(). "Unfinished templates must not appear
 * available" holds structurally: this list is DESIGN_TEMPLATE_IDS
 * itself, the only ids the schema accepts at all.
 */
export function TemplateLibrary({
  draft,
  onApply,
}: {
  draft: InvitationComposition;
  onApply: (next: InvitationComposition) => void;
}) {
  const [filterPack, setFilterPack] = useState<"all" | string>(draft.designPackId);
  const [pendingTemplate, setPendingTemplate] = useState<DesignTemplateDefinition | null>(null);

  const visible = filterPack === "all" ? DESIGN_TEMPLATE_IDS.map((id) => DESIGN_TEMPLATES[id]) : templatesForPack(filterPack);

  function requestApply(template: DesignTemplateDefinition) {
    if (templateConflictsWithDraft(draft, template.id) || template.culturalPackId !== draft.designPackId) {
      setPendingTemplate(template);
      return;
    }
    onApply(applyDesignTemplate(draft, template.id));
  }

  function confirmApply() {
    if (!pendingTemplate) return;
    onApply(applyDesignTemplate(draft, pendingTemplate.id));
    setPendingTemplate(null);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Template library</h2>
          <p className="mt-1 text-xs text-ink-soft">Applying a template updates palette, typography, and motion only — your wording and events are never touched.</p>
        </div>
        <div className="flex gap-1.5">
          <FilterChip label="All" active={filterPack === "all"} onClick={() => setFilterPack("all")} />
          {Object.values(CULTURAL_PACKS).map((pack) => (
            <FilterChip key={pack.id} label={pack.label} active={filterPack === pack.id} onClick={() => setFilterPack(pack.id)} />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={draft.templateId === template.id}
            isCompatible={template.culturalPackId === draft.designPackId}
            onSelect={() => requestApply(template)}
          />
        ))}
      </div>

      {pendingTemplate && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="template-conflict-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-paper-raised p-6">
            <h3 id="template-conflict-title" className="font-display text-lg">
              Replace current design settings?
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              {pendingTemplate.culturalPackId !== draft.designPackId
                ? `"${pendingTemplate.name}" is designed for the ${CULTURAL_PACKS[pendingTemplate.culturalPackId]?.label ?? pendingTemplate.culturalPackId} pack — your sections and content stay exactly as written, only the visual treatment changes.`
                : `Applying "${pendingTemplate.name}" will replace your current palette, typography, and motion settings. Your wording, events, and guest data are never affected.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingTemplate(null)} className="focus-ring rounded-full border border-line px-4 py-2 text-xs text-ink-soft transition hover:border-ink">
                Cancel
              </button>
              <button
                onClick={confirmApply}
                aria-label={`Apply template — confirm ${pendingTemplate.name}`}
                className="focus-ring rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper"
              >
                Apply template
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring rounded-full px-3 py-1.5 text-xs transition ${active ? "bg-ink text-paper" : "border border-line text-ink-soft hover:border-ink"}`}
    >
      {label}
    </button>
  );
}

/** A minimal, schema-valid demo composition to feed the miniature live
 *  preview — never the admin's real content, just enough sections to
 *  show the template's visual treatment. */
function demoCompositionFor(template: DesignTemplateDefinition): InvitationComposition {
  return applyDesignTemplate(
    {
      schemaVersion: 1,
      templateId: null,
      designPackId: template.culturalPackId,
      eventCategory: template.culturalPackId === "hindu-wedding" ? "wedding-hindu" : "wedding-other",
      weddingContext: null,
      locale: "en",
      dir: "ltr",
      themeTokens: { paletteId: template.paletteId },
      featureConfig: { motion: true, ambientMotif: "light", openingBurst: false, envelopeOpening: false },
      sections: [
        { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { eyebrow: "Together with their families", headline: "Amara & Devin" } },
        { id: "welcome", type: "welcome", enabled: true, motionPreset: "fade", data: { message: "We would be honored to have you join us as we celebrate." } },
      ],
    },
    template.id
  );
}

function TemplateCard({
  template,
  isSelected,
  isCompatible,
  onSelect,
}: {
  template: DesignTemplateDefinition;
  isSelected: boolean;
  isCompatible: boolean;
  onSelect: () => void;
}) {
  const demo = demoCompositionFor(template);
  const pack = CULTURAL_PACKS[template.culturalPackId];

  return (
    <div
      data-testid={`template-card-${template.id}`}
      className={`overflow-hidden rounded-2xl border bg-paper-raised transition ${isSelected ? "border-ink ring-1 ring-ink" : "border-line"}`}
    >
      <div className="relative h-56 overflow-hidden border-b border-line bg-paper">
        <div className="pointer-events-none absolute left-1/2 top-1/2 w-[420px] origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.42]">
          <CompositionRenderer composition={demo} canRsvp={false} />
        </div>
        {template.premium && (
          <span className="absolute right-3 top-3 rounded-full bg-champagne px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink">Premium</span>
        )}
        {isSelected && <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-paper">Selected</span>}
      </div>
      <div className="p-4">
        <h3 className="font-display text-lg">{template.name}</h3>
        <p className="mt-1 text-xs text-ink-soft">{template.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-ink-soft">
          <div>
            <dt className="font-medium uppercase tracking-wide">Pack</dt>
            <dd>{pack?.label ?? template.culturalPackId}</dd>
          </div>
          <div>
            <dt className="font-medium uppercase tracking-wide">Motion</dt>
            <dd className="capitalize">{template.motionPresetDefault}</dd>
          </div>
        </dl>
        {!isCompatible && <p className="mt-2 text-[11px] text-amber-700">Designed for a different cultural pack than this invitation currently uses.</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onSelect}
            disabled={isSelected}
            aria-label={isSelected ? `${template.name} template already applied` : `Apply template — ${template.name}`}
            className="focus-ring flex-1 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition disabled:opacity-40"
          >
            {isSelected ? "Applied" : "Apply template"}
          </button>
        </div>
      </div>
    </div>
  );
}
