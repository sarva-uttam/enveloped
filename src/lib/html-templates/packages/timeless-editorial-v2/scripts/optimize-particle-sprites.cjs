/* eslint-disable @typescript-eslint/no-require-imports -- intentionally
   plain CommonJS: a one-off, local, dev-time asset-prep script, not
   part of the app bundle or its ESM module graph. */
/**
 * Produces WebP/AVIF delivery versions of the petal and sparkle sprite
 * sheets, alongside (never replacing) the original PNGs, which stay
 * the canonical source assets and are never modified by this script.
 *
 * These sheets are used whole (cropped per-instance via CSS
 * background-position in render.ts), unlike the frame pieces, so
 * there's nothing to crop here — only re-encode. Quality settings
 * were chosen to match derive-frame-assets.cjs and spot-checked
 * visually against the source PNGs before being accepted (see the
 * finalization report for the before/after transfer sizes).
 *
 * Run with: node src/lib/html-templates/packages/timeless-editorial-v2/scripts/optimize-particle-sprites.cjs
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const SPRITES = ["petal-sprites", "sparkle-sprites"];

async function main() {
  const report = [];

  for (const name of SPRITES) {
    const srcPath = path.join(ASSETS_DIR, `${name}.png`);
    const webpPath = path.join(ASSETS_DIR, `${name}.webp`);
    const avifPath = path.join(ASSETS_DIR, `${name}.avif`);

    await sharp(srcPath).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toFile(webpPath);
    await sharp(srcPath).avif({ quality: 60, effort: 6 }).toFile(avifPath);

    const sizes = {
      png: fs.statSync(srcPath).size,
      webp: fs.statSync(webpPath).size,
      avif: fs.statSync(avifPath).size,
    };
    report.push({ name, sizes });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
