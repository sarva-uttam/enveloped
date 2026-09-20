import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const base = path.join(root, "design-library/hindu-wedding/review/minimum-viable-tier-path");
const manifest = JSON.parse(await fs.readFile(path.join(base, "metadata/review-manifest.json"), "utf8"));
const errors = [];

if (manifest.approvalStatus !== "UNDER_REVIEW" || manifest.productionSelectable !== false) errors.push("Manifest must remain UNDER_REVIEW and non-selectable.");
if (manifest.assets.length !== 10) errors.push("Expected ten raster review assets, including four directional child components.");

for (const asset of manifest.assets) {
  for (const key of ["master", "deliveryFile", "optionCard", "thumbnail", "detailCrop"]) {
    try { await fs.access(path.join(base, asset[key])); } catch { errors.push(`${asset.id}: missing ${key}`); }
  }
  const master = sharp(path.join(base, asset.master));
  const meta = await master.metadata();
  if (!meta.hasAlpha) errors.push(`${asset.id}: master has no alpha channel`);
  if (meta.space !== "srgb") errors.push(`${asset.id}: master is not sRGB`);
  const cardMeta = await sharp(path.join(base, asset.optionCard)).metadata();
  if (cardMeta.width !== 540 || cardMeta.height !== 960) errors.push(`${asset.id}: option card is not 540x960`);
  const thumbMeta = await sharp(path.join(base, asset.thumbnail)).metadata();
  if (thumbMeta.width !== 270 || thumbMeta.height !== 480) errors.push(`${asset.id}: thumbnail is not 270x480`);
  if (!asset.prompt || !asset.altText || !asset.compatibility?.length || !asset.technical?.alphaBounds) errors.push(`${asset.id}: incomplete prompt/alt/compatibility/technical metadata`);
  if (asset.status !== "UNDER_REVIEW" || asset.productionEligible !== false) errors.push(`${asset.id}: invalid approval state`);
}

for (const tier of ["bronze", "silver", "gold", "platinum"]) {
  for (const suffix of ["complete-1000x1778", "mobile-540x960", "desktop-1440x1000"]) {
    const file = path.join(base, "previews", `${tier}-${suffix}.png`);
    try { await fs.access(file); } catch { errors.push(`Missing ${tier} ${suffix} preview`); }
  }
}

const html = await fs.readFile(path.join(base, "trial.html"), "utf8");
const css = await fs.readFile(path.join(base, "trial.css"), "utf8");
if (!html.includes("<h1") || !html.includes("<time") || !html.includes("<button")) errors.push("Trial composition lacks required semantic HTML.");
if (!css.includes("prefers-reduced-motion: reduce")) errors.push("Reduced-motion media query missing.");
if (!html.includes("Your invitation is complete.")) errors.push("Completion message missing.");
for (const forbidden of ["Mozart Script", "Slight", "Ms Claudy", "Ecatherina", "Modern Symphony"]) if (css.includes(forbidden)) errors.push(`Unlicensed font referenced in CSS: ${forbidden}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Tier-path review valid: ${manifest.assets.length} raster assets, 4 tier previews, mobile/desktop/9:16 coverage, semantic HTML, reduced-motion fallback.`);
