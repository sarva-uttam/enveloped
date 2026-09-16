/**
 * The design-template id list — split out from design-templates.ts
 * (which needs to import InvitationComposition from schema.ts) so that
 * schema.ts itself can import just the id list, without creating a
 * schema.ts <-> design-templates.ts import cycle. Every real template
 * definition (name, pack, palette, typography, ...) lives in
 * design-templates.ts; this file is deliberately minimal.
 */

export const DESIGN_TEMPLATE_IDS = [
  "timeless-ivory",
  "modern-editorial",
  "evening-burgundy",
  "golden-marigold",
  "rose-mandap",
  "royal-sangeet",
] as const;

export type DesignTemplateId = (typeof DESIGN_TEMPLATE_IDS)[number];

export function isKnownDesignTemplateId(value: string): value is DesignTemplateId {
  return (DESIGN_TEMPLATE_IDS as readonly string[]).includes(value);
}
