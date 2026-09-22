/* eslint-disable @typescript-eslint/no-require-imports -- intentionally
   plain CommonJS: a one-off, local, dev-time asset-prep script, not
   part of the app bundle or its ESM module graph. Mirrors the pattern
   already established in
   src/lib/html-templates/packages/timeless-editorial-v2/scripts/. */
/**
 * EXPERIMENTAL — NOT PRODUCTION READY
 *
 * Produces AVIF/WebP runtime derivatives of the V2 "Continuous Journey"
 * source PNGs for the disposable scrollymation feasibility prototype.
 * Source masters are read from the owner-supplied review package
 * (outside the repo) and are NEVER modified or copied verbatim into
 * the repo at full master resolution — only re-encoded, resized
 * derivatives are written into this experiment's assets/ directory.
 *
 * Per the core implementation decision (CAMERA-CONTINUITY-PLAN.md /
 * V2-CORRECTION-REPORT.md), only ONE principal world plate (S00) is
 * shipped as a full-frame background — S01/S02/S03 masters are used
 * only as camera-framing references during development and are NOT
 * derived or shipped here.
 *
 * Run with: node src/experiments/ivory-palace-continuous-journey-v2/scripts/derive-assets.cjs
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SOURCE_ROOT =
  "/tmp/claude-1000/-home-sarvauttam-projects-Enveloped/76cf585b-6b03-479b-a265-b89d93ee9b11/scratchpad/ivory-cj-v2/ivory-palace-continuous-journey-v2";
const OUT_DIR = path.join(__dirname, "..", "assets");

// [sourceRelativePath, outBaseName, widths[], { alpha }]
const JOBS = [
  ["opening/IPCJ-V2-S00-THRESHOLD-MASTER.png", "world-plate", [540, 720, 1080], { alpha: false }],
  ["plates/state-02-haldi/IPCJ-V2-HALDI-LAYER.png", "haldi-layer", [678, 1356], { alpha: true }],
  ["transition-occluders/IPCJ-V2-MANDAP-OCCLUDER.png", "mandap-occluder", [583, 1165], { alpha: true }],
  ["finale/foreground/IPCJ-V2-MANDAP-FOREGROUND.png", "mandap-foreground", [1080, 2160], { alpha: true }],
  ["finale/background/IPCJ-V2-FINALE-BACKGROUND.png", "finale-background", [540, 720, 1080], { alpha: false }],
  ["finale/couple-layer/IPCJ-V2-COUPLE-LAYER.png", "couple-layer", [512, 1024], { alpha: true }],
];

async function main() {
  if (!fs.existsSync(SOURCE_ROOT)) {
    console.error(`Source package not found at ${SOURCE_ROOT}`);
    console.error("This script only runs against the locally-extracted owner review package.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];

  for (const [rel, base, widths, { alpha }] of JOBS) {
    const srcPath = path.join(SOURCE_ROOT, rel);
    if (!fs.existsSync(srcPath)) {
      console.error(`Missing source asset: ${srcPath}`);
      process.exit(1);
    }
    const srcStat = fs.statSync(srcPath);

    for (const width of widths) {
      const avifPath = path.join(OUT_DIR, `${base}-${width}.avif`);
      const webpPath = path.join(OUT_DIR, `${base}-${width}.webp`);

      const pipeline = () => sharp(srcPath).resize({ width, withoutEnlargement: true });

      if (!alpha) {
        await pipeline().avif({ quality: 52, effort: 4 }).toFile(avifPath);
        await pipeline().webp({ quality: 68 }).toFile(webpPath);
      } else {
        // Alpha layers: AVIF alpha support is inconsistent across the
        // browsers this prototype targets, so ship WebP (broad alpha
        // support) as the sole delivery format for these; PNG source
        // stays untouched as the origin of truth.
        await pipeline().webp({ quality: 80 }).toFile(webpPath);
      }

      const avifSize = fs.existsSync(avifPath) ? fs.statSync(avifPath).size : null;
      const webpSize = fs.statSync(webpPath).size;
      report.push({
        source: rel,
        sourceBytes: srcStat.size,
        width,
        avifBytes: avifSize,
        webpBytes: webpSize,
      });
    }
  }

  const reportPath = path.join(OUT_DIR, "DERIVATION-REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Derived ${report.length} runtime asset variants.`);
  console.log(`Report written to ${reportPath}`);
  for (const r of report) {
    const avifKb = r.avifBytes ? (r.avifBytes / 1024).toFixed(1) : "n/a";
    const webpKb = (r.webpBytes / 1024).toFixed(1);
    console.log(`  ${r.source} @${r.width}px -> avif ${avifKb}KB / webp ${webpKb}KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
