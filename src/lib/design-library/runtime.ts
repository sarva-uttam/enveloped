import type { DesignComponent, PreviewState } from "./types";

const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;

export function replaceSingleChoice(state: PreviewState, component: DesignComponent): PreviewState {
  if (!component.singleChoiceGroup) return { ...state, selections: { ...state.selections, [component.category]: [...(state.selections[component.category] ?? []), component.id] } };
  return { ...state, selections: { ...state.selections, [component.singleChoiceGroup]: [component.id] } };
}

export function calculateAdjustments(components: DesignComponent[]): number | null {
  if (components.some((c) => c.pricingClassification === "BESPOKE" || c.priceAdjustment === null)) return null;
  return components.reduce((total, component) => total + (component.priceAdjustment ?? 0), 0);
}

export function recommendTier(current: PreviewState["tier"], additions: number, basePrices: Partial<Record<PreviewState["tier"], number>>): PreviewState["tier"] | null {
  const currentBase = basePrices[current];
  if (currentBase === undefined) return null;
  const currentTotal = currentBase + additions;
  const currentIndex = TIER_ORDER.indexOf(current);
  return TIER_ORDER.slice(currentIndex + 1).find((tier) => basePrices[tier] !== undefined && basePrices[tier]! <= currentTotal) ?? null;
}
