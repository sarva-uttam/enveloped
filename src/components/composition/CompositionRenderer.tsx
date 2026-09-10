import type { ComponentType } from "react";
import type { InvitationComposition, SectionType } from "@/lib/composition/schema";
import { PALETTE_REGISTRY } from "@/lib/composition/theme";
import { AnimateIn } from "@/components/invite/AnimateIn";
import { OpeningBurst } from "@/components/invite/OpeningBurst";
import { FloatingMotif } from "@/components/site/FloatingMotif";
import { resolveSectionComponent } from "./registry";
import type { SectionRenderContext } from "./sections";

/** Vertical rhythm between sections, by type — matches the exact
 *  spacing the pre-Stage-6 `PublicInviteView.tsx` used for each of its
 *  hardcoded blocks (opening had none, being first; welcome/dateTime/
 *  schedule/gallery all used `mt-12`; rsvp used the slightly larger
 *  `mt-14`; closing used `mt-16`). New (non-legacy-mapped) section
 *  types default to `mt-12`, the most common value. Kept as simple,
 *  fixed Tailwind classes — never a computed/arbitrary value. */
const SECTION_MARGIN: Partial<Record<SectionType, string>> = {
  opening: "",
  rsvp: "mt-14",
  closing: "mt-16",
};
const DEFAULT_SECTION_MARGIN = "mt-12";

/**
 * THE trusted composition renderer — Stage 6 (see PROJECT_STATUS.md's
 * Stage 6 section, Part E). Replaces the old, monolithic
 * `PublicInviteView.tsx` (deleted this stage): rather than one component
 * with every section's markup inlined, this walks a validated
 * `InvitationComposition`'s `sections` array and dispatches each one to
 * its registered component (src/components/composition/registry.ts) —
 * "map known section types to known React components... never resolve
 * arbitrary imported component names from database strings."
 *
 * Used identically by all three rendering surfaces — public
 * (src/app/invite/[id]/page.tsx), private preview
 * (src/app/preview/[token]/page.tsx), and owner-management
 * (src/app/dashboard/invite/[id]/page.tsx) — "public invitation, private
 * preview and owner-management surfaces must use the same composition
 * renderer." No "use client" here: this component and the section
 * components it calls directly are plain server-renderable JSX; the
 * genuinely interactive pieces (Countdown, RsvpForm, MusicToggle,
 * OpeningBurst) remain their own small, unchanged client islands, same
 * as Stage 4 established.
 *
 * Two sections get special placement, matching the pre-Stage-6 layout
 * (see legacy-adapter.ts's and sections.tsx's own comments for exactly
 * what "matching" does and doesn't mean here): "greeting" renders BEFORE the
 * animated section sequence, un-animated (a personalized banner that
 * should already be visible, not fade in on scroll); "music" renders
 * OUTSIDE the centered column entirely, as a fixed-position overlay
 * (MusicToggle's own className already positions it — nesting depth
 * doesn't matter for a `position: fixed` element). Every other section
 * renders in composition order, each wrapped in the same scroll-reveal
 * `AnimateIn` Stage 4 introduced, active only when
 * `featureConfig.motion` is true.
 *
 * An unknown or unresolvable section type is skipped entirely — never
 * thrown, never a crashed page (`resolveSectionComponent()`'s own
 * "unconditionally safe" contract, exercised directly by
 * registry.test.ts and again here end-to-end by
 * CompositionRenderer.test.tsx).
 */
export function CompositionRenderer({
  composition,
  inviteId,
  guestId,
  guestName,
  song,
  canRsvp,
}: {
  composition: InvitationComposition;
  inviteId?: string;
  guestId?: string;
  guestName?: string;
  song?: string;
  canRsvp: boolean;
}) {
  const palette = PALETTE_REGISTRY[composition.themeTokens.paletteId];
  const accent = composition.themeTokens.accentOverride ?? palette.accent;
  const soft = palette.soft;

  const ctx: SectionRenderContext = { accent, soft, inviteId, guestId, guestName, song, canRsvp };

  const enabledSections = composition.sections.filter((s) => s.enabled);
  const greetingSection = enabledSections.find((s) => s.type === "greeting");
  const musicSection = enabledSections.find((s) => s.type === "music");
  const flowSections = enabledSections.filter((s) => s.type !== "greeting" && s.type !== "music");

  const { featureConfig } = composition;
  const ambientCount = featureConfig.ambientMotif === "full" ? 20 : featureConfig.ambientMotif === "light" ? 10 : 0;

  return (
    <div className="relative overflow-hidden bg-paper">
      {featureConfig.openingBurst && <OpeningBurst colors={["#7c3aed", "#b8862f", "#c26b7a", "#f8ecd2"]} />}
      {featureConfig.ambientMotif !== "none" && (
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
          <FloatingMotif count={ambientCount} />
        </div>
      )}

      <div className="relative mx-auto max-w-2xl px-6 py-20">
        {greetingSection && renderSection(greetingSection, ctx)}

        {flowSections.map((section) => {
          const rendered = renderSection(section, ctx);
          if (rendered === null) return null;
          const margin = SECTION_MARGIN[section.type] ?? DEFAULT_SECTION_MARGIN;
          return (
            <AnimateIn key={section.id} active={featureConfig.motion} className={margin || undefined}>
              {rendered}
            </AnimateIn>
          );
        })}
      </div>

      {musicSection && renderSection(musicSection, ctx)}
    </div>
  );
}

function renderSection(
  section: InvitationComposition["sections"][number],
  ctx: SectionRenderContext
) {
  const Component = resolveSectionComponent(section.type);
  if (!Component) return null;
  // Each union member's `data` shape is already narrowed by `section.type`
  // at the type level; the registry's per-key typing
  // (SECTION_REGISTRY: { [K in SectionType]: SectionComponent<K> }) makes
  // this assignment sound without a manual per-branch switch.
  const Rendered = Component as ComponentType<{ data: unknown; ctx: SectionRenderContext }>;
  return <Rendered data={section.data} ctx={ctx} />;
}
