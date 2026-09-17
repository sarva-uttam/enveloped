import fs from "node:fs";
import path from "node:path";

const root = path.resolve("design-library/hindu-wedding");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "registry", name), "utf8"));
const components = read("components.json");
const templates = read("templates.json");
const palettes = read("palettes.json");
const animations = read("animations.json");
const music = read("music.json");
const mappings = read("survey-mapping.json");
const placements = read("placement-rules.json");
const rules = read("compatibility-rules.json");
const failures = [];
const validTiers = new Set(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
const validPricing = new Set(["INCLUDED", "ENHANCED", "PREMIUM", "BESPOKE"]);
const validSlots = new Set(placements.map((p) => p.slot));
const templateIds = new Set(templates.map((t) => t.id));
const paletteIds = new Set(palettes.map((p) => p.id));
const componentIds = new Set(components.map((c) => c.id));
function check(condition, message) { if (!condition) failures.push(message); }
function unique(records, field, label) { const values = records.map((r) => r[field]); check(new Set(values).size === values.length, `${label} contains duplicate ${field} values`); }

for (const [records, field, label] of [[components, "id", "components"], [templates, "id", "templates"], [palettes, "id", "palettes"], [animations, "id", "animations"], [music, "id", "music"], [mappings, "questionId", "survey mappings"], [placements, "id", "placements"], [rules, "id", "compatibility rules"]]) unique(records, field, label);

for (const c of components) {
  for (const field of ["id", "name", "category", "subcategory", "slot", "tier", "pricingClassification", "approvalStatus", "generationStatus", "altText", "provenance"]) check(Boolean(c[field]), `${c.id ?? "unknown component"} missing ${field}`);
  check(validTiers.has(c.tier), `${c.id} has invalid tier ${c.tier}`);
  check(validPricing.has(c.pricingClassification), `${c.id} has invalid pricing classification`);
  check(validSlots.has(c.slot), `${c.id} has unknown slot ${c.slot}`);
  check(Number.isInteger(c.layerNumber) && c.layerNumber >= 0, `${c.id} has invalid layer`);
  check(c.priceAdjustment === null || c.priceAdjustment >= 0, `${c.id} has a negative price`);
  check(c.supportedTemplates.every((id) => templateIds.has(id)), `${c.id} references an unknown template`);
  check(c.supportedPalettes.every((id) => paletteIds.has(id)), `${c.id} references an unknown palette`);
  check(c.conflictingComponents.every((id) => componentIds.has(id)), `${c.id} references an unknown conflicting component`);
  check(c.requiredCompanionComponents.filter((id) => !id.startsWith("RULE:")).every((id) => componentIds.has(id)), `${c.id} references an unknown companion`);
  check(!c.animationAllowed || Boolean(c.reducedMotionFallback), `${c.id} is animated without a reduced-motion fallback`);
  check(c.approvalStatus !== "APPROVED" || (c.sourceFilePath && fs.existsSync(path.resolve(c.sourceFilePath))), `${c.id} is approved without a valid source file`);
  check(c.approvalStatus === "APPROVED" || c.sourceFilePath === null, `${c.id} has an unapproved production file reference`);
  check(c.usageModel === "TEMPLATE_DECLARED_SLOT_ONLY", `${c.id} may only be consumed through a template-declared slot`);
  check(c.executableContentAllowed === false, `${c.id} must not allow executable content`);
}
for (const t of templates) {
  check(t.supportedTiers.every((tier) => validTiers.has(tier)), `${t.id} has an invalid tier`);
  check(paletteIds.has(t.defaultPalette), `${t.id} references an unknown default palette`);
  check([...t.requiredSlots, ...t.optionalSlots].every((slot) => validSlots.has(slot)), `${t.id} references an unknown slot`);
  check(t.renderingModel === "TRUSTED_HTML_DOCUMENT_PACKAGE", `${t.id} must use the HTML Studio document-package renderer`);
  check(t.documentPackageId === null || typeof t.documentPackageId === "string", `${t.id} has an invalid document package id`);
}
for (const p of placements) check(p.x >= 0 && p.y >= 0 && p.x + p.width <= 1000 && p.y + p.height <= 1778, `${p.id} exceeds logical canvas bounds`);
check(new Set(mappings.map((m) => m.stepId)).size === 22, "survey must map all 22 steps");
check(components.filter((c) => c.category === "sacred" && c.subcategory === "ganesha").length >= 10, "at least ten Ganesha choices are required");
check(components.some((c) => c.name === "No Couple Artwork"), "no-couple option is required");
check(templates.length === 8, "exactly eight initial templates are required");
const registry = read("registry.json");
check(registry.architecture?.renderingModel === "TRUSTED_HTML_DOCUMENT_PACKAGE", "registry must defer rendering to trusted HTML document packages");
check(registry.architecture?.prohibitedModel === "ARBITRARY_RUNTIME_LAYER_COMPOSER", "registry must prohibit arbitrary runtime layer composition");
check(rules.some((r) => r.id === "CR-MOTION-001" && r.maxSelections === 3), "ambient animation maximum rule is missing");
check(rules.some((r) => r.id === "CR-FLORA-001" && r.maxSelections === 3), "floral maximum rule is missing");

const counts = (records, key) => Object.fromEntries([...new Set(records.map((r) => r[key]))].sort().map((value) => [value, records.filter((r) => r[key] === value).length]));
const report = { templates: templates.length, plannedComponents: components.length, byCategory: counts(components, "category"), byTier: counts(components, "tier"), byGenerationStatus: counts(components, "generationStatus"), byApprovalStatus: counts(components, "approvalStatus"), surveySteps: new Set(mappings.map((m) => m.stepId)).size, compatibilityRules: rules.length, missingAssets: components.filter((c) => !c.sourceFilePath).length, missingPreviews: components.filter((c) => !c.previewFilePath).length, missingProvenance: components.filter((c) => !c.provenance).length };
if (process.argv.includes("--report")) console.log(JSON.stringify(report, null, 2));
if (failures.length) { console.error(failures.map((f) => `- ${f}`).join("\n")); process.exit(1); }
console.log(`Design library valid: ${report.templates} templates, ${report.plannedComponents} components, ${report.surveySteps} survey steps, ${report.compatibilityRules} rules.`);
