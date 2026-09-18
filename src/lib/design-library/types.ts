export type ComponentTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
export type PricingClassification = "INCLUDED" | "ENHANCED" | "PREMIUM" | "BESPOKE";
export type AssetApprovalStatus = "PLANNED" | "GENERATED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "RETIRED";
export type AssetGenerationStatus = "NOT_STARTED" | "PROMPT_READY" | "GENERATED" | "TECHNICAL_QA" | "VISUAL_QA" | "APPROVED" | "SUPERSEDED";
export type ComponentCategory = "backgrounds" | "architecture" | "fabric" | "canopy" | "flora" | "sacred" | "ceremonial" | "animals" | "people" | "lighting" | "effects" | "typography" | "interface" | "branding";
export type VisualSlot = "full-background" | "upper-canopy" | "sacred-header" | "invitation-introduction" | "couple-names" | "event-summary" | "centre-artwork" | "lower-ceremonial" | "lower-left" | "lower-right" | "foreground" | "branding-footer";

export interface PlacementRule { id: string; slot: VisualSlot; x: number; y: number; width: number; height: number; safeMargin: number; zIndexRange: [number, number]; cropping: "PROHIBITED" | "CONTAIN" | "COVER"; }
export interface DesignComponent { id: string; name: string; category: ComponentCategory; subcategory: string; tier: ComponentTier; pricingClassification: PricingClassification; priceAdjustment: number | null; currency: string | null; slot: VisualSlot; singleChoiceGroup: string | null; supportedTemplates: string[]; conflictingComponents: string[]; requiredCompanionComponents: string[]; approvalStatus: AssetApprovalStatus; generationStatus: AssetGenerationStatus; altText: string; provenance: string; reducedMotionFallback: string | null; animationAllowed: boolean; sourceFilePath: string | null; usageModel: "TEMPLATE_DECLARED_SLOT_ONLY"; executableContentAllowed: false; }
export interface HinduWeddingTemplate { id: string; name: string; supportedTiers: ComponentTier[]; defaultPalette: string; requiredSlots: VisualSlot[]; optionalSlots: VisualSlot[]; approvalStatus: AssetApprovalStatus; version: string; renderingModel: "TRUSTED_HTML_DOCUMENT_PACKAGE"; documentPackageId: string | null; documentPackageStatus: "NOT_IMPLEMENTED" | "IMPLEMENTED" | "APPROVED" | "RETIRED"; }
export interface Palette { id: string; name: string; colors: Record<string, string>; contrastNotes: string; }
export interface TypographyStyle { id: string; name: string; role: string; licenceStatus: "TO_VERIFY" | "VERIFIED_OPEN_SOURCE" | "VERIFIED_COMMERCIAL"; source: string | null; }
export interface AnimationStyle { id: string; name: string; kind: "AMBIENT" | "OPENING" | "REVEAL"; reducedMotionFallback: string; }
export interface MusicOption { id: string; name: string; sourceType: "CLIENT_PROVIDED" | "LICENSED_LIBRARY" | "NONE"; requiresInteraction: true; }
export interface CompatibilityRule { id: string; scope: string; severity: "ERROR" | "WARNING"; message: string; }
export interface SurveyMapping { stepId: string; questionId: string; kind: "VISUAL" | "CONTENT" | "FUNCTIONAL" | "PRIVACY" | "PRICING" | "ADMINISTRATIVE"; affectsPreview: boolean; }
export interface PreviewState { templateId: string | null; tier: ComponentTier; selections: Record<string, string[]>; reducedMotion: boolean; estimatedTotal: number | null; currency: string | null; }
