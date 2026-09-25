import type { InvitationComposition } from "@/lib/composition/schema";
import { PALETTE_REGISTRY } from "@/lib/composition/theme";
import { CompositionRenderer } from "@/components/composition/CompositionRenderer";
import { EnvelopeOpening } from "./EnvelopeOpening";

/**
 * The reusable invitation experience shell — Stage 7 (see
 * PROJECT_STATUS.md's Stage 7 section, Part G). Wraps the trusted
 * `CompositionRenderer` with the envelope-opening entrance and the
 * motion/reduced-motion presentation layer, WITHOUT changing what the
 * renderer decides to render: "the composition renderer must remain the
 * content authority. The experience shell controls presentation and
 * progression only." This is a plain server component (no "use client")
 * — `CompositionRenderer`'s output is passed as `children` into the
 * client `EnvelopeOpening`, so it stays fully server-rendered (React's
 * children-as-server-content pattern, the same one AnimateIn has relied
 * on since Stage 4).
 *
 * Used identically by all three surfaces (public / private preview /
 * owner-management). Context-specific behavior stays correct WITHOUT
 * this component needing to know the difference, because each caller
 * already supplies it:
 *   - `canRsvp` (built from the invitation's real publication state) is
 *     threaded straight through to CompositionRenderer → RsvpSection —
 *     an unpublished private preview still cannot RSVP, exactly as in
 *     Stage 5.
 *   - the preview indicator (`PreviewBanner`) and the owner-management
 *     bar are rendered by their OWN routes, OUTSIDE this shell — this
 *     component never renders, imports, or knows about either, so no
 *     owner-management or PayPal code is pulled onto the public bundle
 *     by it.
 *   - the raw preview token never reaches here (the preview route
 *     resolves it to a sanitized composition server-side and passes
 *     only that), so it cannot leak into any client prop.
 *   - `mode="review"` (preview + owner routes) skips the envelope
 *     ceremony entirely — a review context wants the content, and its
 *     own indicator, immediately and on every navigation, not a
 *     one-time guest delight in the way. Scrollymation, atmospheric
 *     effects, and real audio still apply in review mode; only the
 *     full-screen opening overlay is suppressed.
 */
export function InvitationExperience({
  composition,
  inviteId,
  guestId,
  guestName,
  song,
  canRsvp,
  mode = "guest",
}: {
  composition: InvitationComposition;
  inviteId?: string;
  guestId?: string;
  guestName?: string;
  song?: string;
  canRsvp: boolean;
  mode?: "guest" | "review";
}) {
  const palette = PALETTE_REGISTRY[composition.themeTokens.paletteId];
  const accent = composition.themeTokens.accentOverride ?? palette.accent;

  const envelopeActive =
    mode === "guest" && composition.featureConfig.envelopeOpening && composition.featureConfig.motion;

  const opening = composition.sections.find((s) => s.type === "opening" && s.enabled);
  const eyebrow = opening && opening.type === "opening" ? (opening.data.eyebrow ?? opening.data.headline) : undefined;

  return (
    <EnvelopeOpening
      active={envelopeActive}
      sessionKey={inviteId ?? `pack:${composition.designPackId}`}
      accent={accent}
      eyebrow={eyebrow}
      openingBurst={composition.featureConfig.openingBurst}
    >
      <CompositionRenderer
        composition={composition}
        inviteId={inviteId}
        guestId={guestId}
        guestName={guestName}
        song={song}
        canRsvp={canRsvp}
      />
    </EnvelopeOpening>
  );
}
