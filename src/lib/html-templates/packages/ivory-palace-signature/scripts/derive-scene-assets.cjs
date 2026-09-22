/* eslint-disable @typescript-eslint/no-require-imports -- intentionally
   plain CommonJS: a one-off, local, dev-time asset-prep script, not
   part of the app bundle or its ESM module graph. */
/**
 * Derives delivery-ready AVIF/WebP scene assets (plus a blurred,
 * darkened "backdrop" derivative used for the centered-9:16 desktop
 * presentation strategy documented in SCENE-SPEC.md §Desktop) from the
 * Owner-approved Ivory Palace — Signature Edition source package.
 *
 * Source masters are read from the extracted owner-review package
 * (SOURCE_ROOT below, outside the repo) and are never modified. Only
 * derivatives are written, into ../assets/scenes and
 * ../assets/particles. Re-run this script any time the source package
 * changes; it always regenerates from SOURCE_ROOT, never from a
 * previous derivative.
 *
 * Run with: node src/lib/html-templates/packages/ivory-palace-signature/scripts/derive-scene-assets.cjs
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SOURCE_ROOT =
  "/tmp/claude-1000/-home-sarvauttam-projects-Enveloped/76cf585b-6b03-479b-a265-b89d93ee9b11/scratchpad/ivory-palace/ivory-palace-signature";
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const SCENES_DIR = path.join(ASSETS_DIR, "scenes");
const PARTICLES_DIR = path.join(ASSETS_DIR, "particles");

// Opaque 9:16 scene masters (941x1672). Two delivery widths: 541 (small
// mobile) and 941 (native/2x). Backdrop derivative is generated only
// at a small width since it's heavily blurred and shown at low detail
// behind the crisp centered artwork on desktop.
const SCENE_MASTERS = [
  { key: "opening-closed", file: "opening/masters/IP-OPEN-001-closed-mobile-master.png", backdrop: false },
  { key: "opening-reveal", file: "opening/masters/IP-OPEN-002-reveal-mobile-master.png", backdrop: true },
  { key: "monogram", file: "monogram/IP-MONO-001-mobile-master.png", backdrop: true },
  { key: "introduction", file: "introduction/IP-INTRO-001-mobile-master.png", backdrop: true },
  { key: "haldi", file: "ceremonies/haldi/IP-HALDI-001-mobile-master.png", backdrop: true },
  { key: "mehendi", file: "ceremonies/mehendi/IP-MEHENDI-001-mobile-master.png", backdrop: true },
  { key: "sangeet", file: "ceremonies/sangeet/IP-SANGEET-001-mobile-master.png", backdrop: true },
  { key: "wedding", file: "ceremonies/wedding/IP-WEDDING-001-mobile-master.png", backdrop: true },
  { key: "reception", file: "ceremonies/reception/IP-RECEPTION-001-mobile-master.png", backdrop: true },
  { key: "formal", file: "ceremonies/wedding/IP-FORMAL-001-mobile-master.png", backdrop: true },
  { key: "gallery", file: "gallery/IP-GALLERY-001-mobile-master.png", backdrop: true },
  { key: "venue", file: "venue-response/IP-VENUE-001-mobile-master.png", backdrop: true },
  { key: "blessing", file: "blessing/IP-BLESSING-001-mobile-master.png", backdrop: true },
  { key: "finale-bg", file: "finale/IP-FINALE-BG-001-mobile-master.png", backdrop: true },
];

// Transparent overlay (couple layer composited over finale-bg) — alpha
// must survive, so no JPEG-family intermediate, AVIF/WebP only.
const ALPHA_OVERLAYS = [{ key: "finale-couple", file: "finale/IP-FINALE-COUPLE-001.png" }];

// Shared decorative sprite sheets (both 1536x1024, matching the
// timeless-editorial-v2 petal-sheet grid convention — see particles.ts
// for the per-cell crop math). Delivered once, at native size, since
// they're reused across every scene via CSS background-position.
const SHARED_SHEETS = [
  { key: "petal-sheet", file: "shared/particles/IP-SHARED-PETALS-001.png" },
  { key: "sparkle-sheet", file: "shared/lighting/IP-SHARED-LIGHT-001.png" },
];

const WIDTHS = [541, 941];
const BACKDROP_WIDTH = 480;
const BACKDROP_BLUR_SIGMA = 28;

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function deriveScene(scene) {
  const srcPath = path.join(SOURCE_ROOT, scene.file);
  const report = [];

  for (const width of WIDTHS) {
    const base = sharp(srcPath).resize({ width, withoutEnlargement: true });
    const webpPath = path.join(SCENES_DIR, `${scene.key}-${width}.webp`);
    const avifPath = path.join(SCENES_DIR, `${scene.key}-${width}.avif`);

    const webpBuf = await base.clone().webp({ quality: width >= 941 ? 72 : 68 }).toBuffer();
    await fs.promises.writeFile(webpPath, webpBuf);

    const avifBuf = await base.clone().avif({ quality: width >= 941 ? 55 : 50 }).toBuffer();
    await fs.promises.writeFile(avifPath, avifBuf);

    report.push([`${scene.key}-${width}.webp`, webpBuf.length]);
    report.push([`${scene.key}-${width}.avif`, avifBuf.length]);
  }

  // Retained PNG source-quality fallback at native width, for browsers
  // without AVIF/WebP support (last resort in <picture>).
  const pngPath = path.join(SCENES_DIR, `${scene.key}-941.png`);
  await sharp(srcPath).resize({ width: 941, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(pngPath);
  const pngStat = await fs.promises.stat(pngPath);
  report.push([`${scene.key}-941.png`, pngStat.size]);

  if (scene.backdrop) {
    const backdropWebp = await sharp(srcPath)
      .resize({ width: BACKDROP_WIDTH })
      .blur(BACKDROP_BLUR_SIGMA)
      .modulate({ brightness: 0.55, saturation: 0.9 })
      .webp({ quality: 55 })
      .toBuffer();
    const backdropPath = path.join(SCENES_DIR, `${scene.key}-backdrop.webp`);
    await fs.promises.writeFile(backdropPath, backdropWebp);
    report.push([`${scene.key}-backdrop.webp`, backdropWebp.length]);
  }

  return report;
}

async function deriveOverlay(overlay) {
  const srcPath = path.join(SOURCE_ROOT, overlay.file);
  const report = [];
  const base = sharp(srcPath).resize({ width: 941, withoutEnlargement: true });

  const webpBuf = await base.clone().webp({ quality: 75, alphaQuality: 90 }).toBuffer();
  await fs.promises.writeFile(path.join(SCENES_DIR, `${overlay.key}-941.webp`), webpBuf);
  report.push([`${overlay.key}-941.webp`, webpBuf.length]);

  const avifBuf = await base.clone().avif({ quality: 55 }).toBuffer();
  await fs.promises.writeFile(path.join(SCENES_DIR, `${overlay.key}-941.avif`), avifBuf);
  report.push([`${overlay.key}-941.avif`, avifBuf.length]);

  const pngPath = path.join(SCENES_DIR, `${overlay.key}-941.png`);
  await base.clone().png({ compressionLevel: 9 }).toFile(pngPath);
  const pngStat = await fs.promises.stat(pngPath);
  report.push([`${overlay.key}-941.png`, pngStat.size]);

  return report;
}

async function deriveSheet(sheet) {
  const srcPath = path.join(SOURCE_ROOT, sheet.file);
  const report = [];
  const base = sharp(srcPath);

  const webpBuf = await base.clone().webp({ quality: 80, alphaQuality: 95 }).toBuffer();
  await fs.promises.writeFile(path.join(PARTICLES_DIR, `${sheet.key}.webp`), webpBuf);
  report.push([`${sheet.key}.webp`, webpBuf.length]);

  const avifBuf = await base.clone().avif({ quality: 60 }).toBuffer();
  await fs.promises.writeFile(path.join(PARTICLES_DIR, `${sheet.key}.avif`), avifBuf);
  report.push([`${sheet.key}.avif`, avifBuf.length]);

  const pngPath = path.join(PARTICLES_DIR, `${sheet.key}.png`);
  await base.clone().png({ compressionLevel: 9 }).toFile(pngPath);
  const pngStat = await fs.promises.stat(pngPath);
  report.push([`${sheet.key}.png`, pngStat.size]);

  return report;
}

async function main() {
  await ensureDir(SCENES_DIR);
  await ensureDir(PARTICLES_DIR);

  const allReports = [];
  for (const scene of SCENE_MASTERS) {
    allReports.push(...(await deriveScene(scene)));
  }
  for (const overlay of ALPHA_OVERLAYS) {
    allReports.push(...(await deriveOverlay(overlay)));
  }
  for (const sheet of SHARED_SHEETS) {
    allReports.push(...(await deriveSheet(sheet)));
  }

  console.log("Derived asset sizes (KB):");
  for (const [name, bytes] of allReports) {
    console.log(`  ${name}: ${(bytes / 1024).toFixed(1)} KB`);
  }
  console.log(`\nTotal files: ${allReports.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
