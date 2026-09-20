import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const base = path.join(root, "design-library/hindu-wedding/review/minimum-viable-tier-path");
const masterDir = path.join(base, "masters");
const deliveryDir = path.join(base, "delivery");
const cardsDir = path.join(base, "option-cards");
const thumbsDir = path.join(base, "thumbnails");
const detailDir = path.join(base, "details");
const previewDir = path.join(base, "previews");
const motionDir = path.join(base, "motion");

await Promise.all([deliveryDir, cardsDir, thumbsDir, detailDir, previewDir, motionDir, path.join(deliveryDir, "petals")].map((dir) => fs.mkdir(dir, { recursive: true })));

async function splitPair(sourceName, leftName, rightName) {
  const source = path.join(masterDir, sourceName);
  const { width, height } = await sharp(source).metadata();
  const midpoint = Math.floor(width / 2);
  const parts = [
    { left: 0, width: midpoint, name: leftName },
    { left: midpoint, width: width - midpoint, name: rightName },
  ];
  for (const part of parts) {
    const extracted = await sharp(source)
      .extract({ left: part.left, top: 0, width: part.width, height })
      .png()
      .toBuffer();
    await sharp(extracted)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      .extend({ top: 32, bottom: 32, left: 32, right: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(masterDir, part.name));
  }
}

await splitPair("hw-cerem-002-v1-master.png", "hw-cerem-002-v1-left-master.png", "hw-cerem-002-v1-right-master.png");
await splitPair("hw-animal-002-v2-master.png", "hw-animal-002-v2-left-master.png", "hw-animal-002-v2-right-master.png");

const assets = [
  { id: "HW-CANOPY-001-V2", tier: "SILVER", file: "hw-canopy-001-v2-master.png", delivery: "hw-canopy-001-v2-delivery.webp", fit: [1760, 520] },
  { id: "HW-CEREM-002-V1", tier: "SILVER", file: "hw-cerem-002-v1-master.png", delivery: "hw-cerem-002-v1-delivery.webp", fit: [1160, 600] },
  { id: "HW-CEREM-002-V1-LEFT", tier: "SILVER", file: "hw-cerem-002-v1-left-master.png", delivery: "hw-cerem-002-v1-left-delivery.webp", fit: [560, 600] },
  { id: "HW-CEREM-002-V1-RIGHT", tier: "SILVER", file: "hw-cerem-002-v1-right-master.png", delivery: "hw-cerem-002-v1-right-delivery.webp", fit: [560, 600] },
  { id: "HW-ANIMAL-002-V2", tier: "GOLD", file: "hw-animal-002-v2-master.png", delivery: "hw-animal-002-v2-delivery.webp", fit: [1800, 840] },
  { id: "HW-ANIMAL-002-V2-LEFT", tier: "GOLD", file: "hw-animal-002-v2-left-master.png", delivery: "hw-animal-002-v2-left-delivery.webp", fit: [880, 840] },
  { id: "HW-ANIMAL-002-V2-RIGHT", tier: "GOLD", file: "hw-animal-002-v2-right-master.png", delivery: "hw-animal-002-v2-right-delivery.webp", fit: [880, 840] },
  { id: "HW-EFFECT-004-V1", tier: "GOLD", file: "hw-effect-004-v1-master.png", delivery: "hw-effect-004-v1-delivery.webp", fit: [1000, 1778] },
  { id: "HW-EFFECT-002-V2", tier: "GOLD", file: "hw-effect-002-v2-petal-sprite-master.png", delivery: "hw-effect-002-v2-petal-sprite-delivery.webp", fit: [1200, 800] },
  { id: "HW-PEOPLE-005-V2", tier: "PLATINUM", file: "hw-people-005-v2-master.png", delivery: "hw-people-005-v2-delivery.webp", fit: [720, 1080] },
];

function escapeXml(value) { return value.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[m]); }
function labelSvg(width, height, id, tier) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="124" y="${height - 124}" fill="#fffaf0" fill-opacity=".94"/><text x="28" y="${height - 76}" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#30271e">${escapeXml(id)}</text><text x="28" y="${height - 42}" font-family="Arial,sans-serif" font-size="15" letter-spacing="2" fill="#7c5a25">${tier} · UNDER_REVIEW</text></svg>`);
}

for (const asset of assets) {
  const source = path.join(masterDir, asset.file);
  await sharp(source).resize({ width: asset.fit[0], height: asset.fit[1], fit: "inside", withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(deliveryDir, asset.delivery));
  const transparent = await sharp(source).resize({ width: 472, height: 720, fit: "inside" }).png().toBuffer();
  const card = sharp({ create: { width: 540, height: 960, channels: 4, background: "#f5efe3" } });
  const meta = await sharp(transparent).metadata();
  await card.composite([
    { input: transparent, left: Math.round((540 - meta.width) / 2), top: Math.max(42, Math.round((800 - meta.height) / 2)) },
    { input: labelSvg(540, 960, asset.id, asset.tier), left: 0, top: 0 },
  ]).webp({ quality: 90 }).toFile(path.join(cardsDir, asset.delivery.replace("-delivery.webp", "-option-card.webp")));
  await sharp(path.join(cardsDir, asset.delivery.replace("-delivery.webp", "-option-card.webp"))).resize(270, 480).webp({ quality: 84 }).toFile(path.join(thumbsDir, asset.delivery.replace("-delivery.webp", "-thumbnail.webp")));
  const srcMeta = await sharp(source).metadata();
  const detailWidth = Math.min(1000, srcMeta.width);
  const detailHeight = Math.min(1000, srcMeta.height);
  await sharp(source).extract({ left: Math.floor((srcMeta.width - detailWidth) / 2), top: Math.floor((srcMeta.height - detailHeight) / 2), width: detailWidth, height: detailHeight }).png().toFile(path.join(detailDir, asset.file.replace("-master.png", "-detail.png")));
}

const petalSource = path.join(masterDir, "hw-effect-002-v2-petal-sprite-master.png");
const petalMeta = await sharp(petalSource).metadata();
for (let row = 0; row < 2; row += 1) {
  for (let col = 0; col < 3; col += 1) {
    const index = row * 3 + col + 1;
    const left = Math.round(col * petalMeta.width / 3);
    const top = Math.round(row * petalMeta.height / 2);
    const width = Math.round((col + 1) * petalMeta.width / 3) - left;
    const height = Math.round((row + 1) * petalMeta.height / 2) - top;
    await sharp(petalSource).extract({ left, top, width, height }).resize({ width: 96, height: 96, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(deliveryDir, "petals", `petal-${String(index).padStart(2, "0")}.webp`));
  }
}

const backgroundPath = path.join(root, "design-library/hindu-wedding/components/backgrounds/paper-textures/hw-bg-001/hw-bg-001-pale-v1-1000x1778.webp");
const architecturePath = path.join(root, "design-library/hindu-wedding/components/architecture/delivery/hw-arch-001-v2-delivery.webp");
const headerPath = path.join(root, "design-library/hindu-wedding/components/typography/ornaments/delivery/hw-header-001-v1-delivery.webp");
const floraPath = path.join(root, "design-library/hindu-wedding/review/flora/delivery/hw-floral-010-v1-base-delivery.webp");
const fontDir = path.join(root, "src/lib/html-templates/packages/timeless-editorial-v2/assets/fonts");
const alexData = (await fs.readFile(path.join(fontDir, "alex-brush-latin-400-normal.woff2"))).toString("base64");
const playfairData = (await fs.readFile(path.join(fontDir, "playfair-display-latin-600-normal.woff2"))).toString("base64");

async function placed(input, width, height) {
  return sharp(input).resize({ width, height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

function copySvg() {
  return Buffer.from(`<svg width="1000" height="1778" xmlns="http://www.w3.org/2000/svg">
    <style>
      @font-face{font-family:Alex;src:url(data:font/woff2;base64,${alexData}) format('woff2');font-weight:400}
      @font-face{font-family:Playfair;src:url(data:font/woff2;base64,${playfairData}) format('woff2');font-weight:600}
      .ui{font-family:Arial,sans-serif}.display{font-family:Playfair,Georgia,serif}.script{font-family:Alex,cursive}
    </style>
    <g text-anchor="middle" fill="#30271e">
      <text class="ui" x="500" y="373" font-size="16" font-weight="700" letter-spacing="4" fill="#6d5532">TOGETHER WITH THEIR FAMILIES</text>
      <text class="script" x="500" y="486" font-size="84" fill="#7c1f2b">Couple Name</text>
      <text class="display" x="500" y="555" font-size="31" letter-spacing="2" fill="#a7792d">Wedding Celebration</text>
      <path d="M434 598 H566" stroke="#a7792d" stroke-width="1"/>
      <text class="display" x="500" y="664" font-size="36">Date · Time</text>
      <text class="display" x="500" y="719" font-size="25">Venue Name</text>
      <text class="display" x="500" y="772" font-size="18">Event details remain editable, accessible HTML.</text>
      <rect x="398" y="810" width="204" height="50" rx="25" fill="#fffaf0" fill-opacity=".75" stroke="#a7792d"/>
      <text class="ui" x="500" y="842" font-size="14" font-weight="700" letter-spacing="2">VIEW DETAILS</text>
      <text class="ui" x="500" y="1732" font-size="14" font-weight="700" letter-spacing="5" fill="#6c5734">ENVELOPED</text>
    </g>
  </svg>`);
}

function glowSvg(platinum = false) {
  return Buffer.from(`<svg width="1000" height="1778" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g"><stop offset="0" stop-color="#fffbee" stop-opacity=".18"/><stop offset=".5" stop-color="#fff8e2" stop-opacity=".09"/><stop offset="1" stop-color="#fff8e2" stop-opacity="0"/></radialGradient>${platinum ? '<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#ffe2a4" stop-opacity="0"/><stop offset=".48" stop-color="#ffe2a4" stop-opacity=".15"/><stop offset=".68" stop-color="#ffe2a4" stop-opacity="0"/></linearGradient>' : ''}</defs><ellipse cx="500" cy="700" rx="380" ry="470" fill="url(#g)"/>${platinum ? '<rect width="1000" height="1778" fill="url(#r)" opacity=".8"/>' : ''}</svg>`);
}

async function renderTier(tier, output) {
  const level = { bronze: 0, silver: 1, gold: 2, platinum: 3 }[tier];
  const background = await sharp(backgroundPath).resize(1000, 1778, { fit: "cover" }).png().toBuffer();
  const composites = [
    { input: await placed(architecturePath, 1000, 1778), left: 0, top: 0 },
  ];
  if (level >= 1) composites.push({ input: glowSvg(level >= 3), left: 0, top: 0 });
  if (level >= 1) composites.push({ input: await placed(path.join(deliveryDir, "hw-canopy-001-v2-delivery.webp"), 880, 260), left: 60, top: 30 });
  composites.push({ input: await placed(headerPath, level >= 1 ? 145 : 170, level >= 1 ? 145 : 170), left: level >= 1 ? 427 : 415, top: level >= 1 ? 210 : 118 });
  if (level >= 3) composites.push({ input: await placed(path.join(deliveryDir, "hw-people-005-v2-delivery.webp"), 380, 570), left: 310, top: 850 });
  if (level >= 1) composites.push({ input: await placed(path.join(deliveryDir, "hw-cerem-002-v1-delivery.webp"), 580, 300), left: 210, top: 1190 });
  if (level >= 2) composites.push({ input: await placed(path.join(deliveryDir, "hw-animal-002-v2-delivery.webp"), 930, 430), left: 35, top: 1160 });
  if (level >= 2) composites.push({ input: await placed(path.join(deliveryDir, "hw-effect-004-v1-delivery.webp"), 1000, 1778), left: 0, top: 0 });
  if (level >= 2) {
    const petalPositions = [[84, 1280, 28], [188, 1380, 24], [820, 1310, 30]];
    for (let i = 0; i < petalPositions.length; i += 1) {
      const [left, top, size] = petalPositions[i];
      composites.push({ input: await placed(path.join(deliveryDir, "petals", `petal-${String(i + 1).padStart(2, "0")}.webp`), size, size), left, top });
    }
  }
  composites.push({ input: await placed(floraPath, 1000, 330), left: 0, top: 1370 });
  composites.push({ input: copySvg(), left: 0, top: 0 });
  await sharp(background).composite(composites).png().toFile(output);
}

for (const tier of ["bronze", "silver", "gold", "platinum"]) await renderTier(tier, path.join(previewDir, `${tier}-complete-1000x1778.png`));
for (const tier of ["bronze", "silver", "gold", "platinum"]) {
  const source = path.join(previewDir, `${tier}-complete-1000x1778.png`);
  await sharp(source).resize(540, 960).png().toFile(path.join(previewDir, `${tier}-mobile-540x960.png`));
  const desktopInvite = await sharp(source).resize({ width: 506, height: 900, fit: "contain" }).png().toBuffer();
  await sharp({ create: { width: 1440, height: 1000, channels: 4, background: "#e9e2d7" } }).composite([{ input: desktopInvite, left: 467, top: 50 }]).png().toFile(path.join(previewDir, `${tier}-desktop-1440x1000.png`));
}
await fs.copyFile(path.join(previewDir, "gold-complete-1000x1778.png"), path.join(motionDir, "gold-falling-petals-motion-poster.png"));
await fs.copyFile(path.join(previewDir, "platinum-complete-1000x1778.png"), path.join(motionDir, "platinum-floral-reveal-motion-poster.png"));
await fs.copyFile(path.join(previewDir, "platinum-complete-1000x1778.png"), path.join(motionDir, "platinum-reduced-motion-static.png"));

const previewFiles = ["bronze-complete-1000x1778.png", "silver-complete-1000x1778.png", "gold-complete-1000x1778.png", "platinum-complete-1000x1778.png"];
const panels = [];
for (let index = 0; index < previewFiles.length; index += 1) {
  const image = await sharp(path.join(previewDir, previewFiles[index])).resize(360, 640).png().toBuffer();
  panels.push({ input: image, left: 36 + index * 384, top: 90 });
}
const sheetLabel = Buffer.from(`<svg width="1608" height="780" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#efe8dc"/><text x="36" y="48" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#30271e">Ivory Palace Progression · Four-tier trial</text><text x="36" y="72" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="#7c5a25">ALL NEW VISUALS UNDER_REVIEW · NOT H01–H08 APPROVAL</text></svg>`);
await sharp(sheetLabel).composite(panels).png().toFile(path.join(previewDir, "four-tier-comparison-sheet.png"));

const reducedPanels = [];
for (const [index, file] of ["platinum-floral-reveal-motion-poster.png", "platinum-reduced-motion-static.png"].entries()) {
  const image = await sharp(path.join(motionDir, file)).resize(405, 720).png().toBuffer();
  reducedPanels.push({ input: image, left: 50 + index * 455, top: 80 });
}
const reducedLabel = Buffer.from(`<svg width="960" height="850" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#efe8dc"/><text x="50" y="46" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#30271e">Motion poster / reduced-motion static</text></svg>`);
await sharp(reducedLabel).composite(reducedPanels).png().toFile(path.join(motionDir, "reduced-motion-comparison.png"));

const cardPanels = [];
for (let index = 0; index < assets.length; index += 1) {
  const asset = assets[index];
  const cardPath = path.join(cardsDir, asset.delivery.replace("-delivery.webp", "-option-card.webp"));
  const card = await sharp(cardPath).resize(270, 480).png().toBuffer();
  cardPanels.push({ input: card, left: 35 + (index % 3) * 290, top: 82 + Math.floor(index / 3) * 500 });
}
const cardSheetHeight = 100 + Math.ceil(assets.length / 3) * 500;
const cardSheet = Buffer.from(`<svg width="940" height="${cardSheetHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#efe8dc"/><text x="35" y="42" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#30271e">Minimum Viable Tier Path · asset contact sheet</text><text x="35" y="66" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="#7c5a25">UNDER_REVIEW</text></svg>`);
await sharp(cardSheet).composite(cardPanels).png().toFile(path.join(previewDir, "asset-contact-sheet.png"));

console.log(`Built ${assets.length} asset packages and tier previews in ${base}`);
