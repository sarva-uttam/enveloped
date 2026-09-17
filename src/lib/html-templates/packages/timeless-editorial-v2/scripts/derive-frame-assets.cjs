/* eslint-disable @typescript-eslint/no-require-imports -- intentionally
   plain CommonJS: a one-off, local, dev-time asset-prep script (see
   below), not part of the app bundle or its ESM module graph. */
/**
 * Derives the edge-frame pieces used by render.ts from the two
 * owner-supplied source frames (frame-desktop.png, frame-mobile.png).
 *
 * This is a one-time, deterministic, local asset-preparation step —
 * not part of the Next.js build or the request-time rendering path.
 * It uses sharp (already resolved in package-lock.json as a Next.js
 * optional dependency; no new dependency was added to run it) to crop
 * and re-encode. Source PNGs are opened read-only and never modified.
 *
 * Run with: node src/lib/html-templates/packages/timeless-editorial-v2/scripts/derive-frame-assets.cjs
 *
 * --- How the frame was divided (see report for the full rationale) ---
 *
 * The two source images are composed differently, so they're divided
 * differently — neither is redrawn, stretched, or synthesized either
 * way, only cropped:
 *
 * frame-desktop.png (1024x1536) is corner-accented: a top-left rose
 * cluster and a bottom-right rose cluster, joined by a thin vine, with
 * plain gold scrollwork at the other two corners. Spanning that whole
 * design across a desktop viewport far wider than 1024px would force
 * either an upscale-blur or a squeezed-down band that no longer
 * touches the side edges — so desktop uses six pieces: independent
 * TOP-LEFT / TOP-RIGHT / BOTTOM-LEFT / BOTTOM-RIGHT corner pieces
 * (each touches both the edge it sits on and the top/bottom edge) plus
 * LEFT / RIGHT mid-side pieces that exactly fill the gap between the
 * matching corners — boundaries are chosen so adjacent pieces share
 * zero gap and zero overlap, like a frame's mitred joins:
 *
 *   desktop-top-left     x 0-512    y 0-480     top-left rose cluster
 *   desktop-top-right    x 512-1024 y 0-480     top-right gold scrollwork
 *   desktop-bottom-left  x 0-512    y 1056-1536 bottom-left gold scrollwork
 *   desktop-bottom-right x 512-1024 y 1056-1536 bottom-right rose cluster
 *   desktop-left         x 0-160    y 480-1056  left vine, corner-to-corner
 *   desktop-right        x 864-1024 y 480-1056  right vine, corner-to-corner
 *
 * frame-mobile.png (941x1672) is a single continuous garland already
 * spanning corner-to-corner at both the top and bottom edge, so it
 * needs no splitting — at mobile viewport widths (360-430px) scaling
 * the full-width crop down to fit is a modest, proportional shrink
 * (not an upscale, not a distortion), so one top and one bottom piece
 * is both sufficient and truer to the source art than slicing it:
 *
 *   mobile-top    x 0-941 y 0-360      full-width top garland
 *   mobile-bottom x 0-941 y 1312-1672  full-width bottom garland
 *   mobile-left   x 0-110 y 330-1320   left vine, corner-to-corner-ish
 *   mobile-right  x 831-941 y 330-1320 right vine, corner-to-corner-ish
 *
 * Every side piece is a single, non-repeated, non-tiled crop of a
 * genuinely distinct stretch of the original vine — nothing here
 * repeats the same recognizable flower cluster twice.
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SRC_DIR = path.join(__dirname, "..", "assets");
const OUT_DIR = path.join(__dirname, "..", "assets", "frame-pieces");

const PIECES = [
  { name: "desktop-top-left", source: "frame-desktop.png", region: { left: 0, top: 0, width: 512, height: 480 } },
  { name: "desktop-top-right", source: "frame-desktop.png", region: { left: 512, top: 0, width: 512, height: 480 } },
  { name: "desktop-bottom-left", source: "frame-desktop.png", region: { left: 0, top: 1056, width: 512, height: 480 } },
  { name: "desktop-bottom-right", source: "frame-desktop.png", region: { left: 512, top: 1056, width: 512, height: 480 } },
  { name: "desktop-left", source: "frame-desktop.png", region: { left: 0, top: 480, width: 160, height: 576 } },
  { name: "desktop-right", source: "frame-desktop.png", region: { left: 864, top: 480, width: 160, height: 576 } },
  { name: "mobile-top", source: "frame-mobile.png", region: { left: 0, top: 0, width: 941, height: 360 } },
  { name: "mobile-bottom", source: "frame-mobile.png", region: { left: 0, top: 1312, width: 941, height: 360 } },
  { name: "mobile-left", source: "frame-mobile.png", region: { left: 0, top: 330, width: 110, height: 990 } },
  { name: "mobile-right", source: "frame-mobile.png", region: { left: 831, top: 330, width: 110, height: 990 } },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = [];

  for (const piece of PIECES) {
    const srcPath = path.join(SRC_DIR, piece.source);
    const cropped = sharp(srcPath).extract(piece.region);
    const buffer = await cropped.png().toBuffer();

    const pngPath = path.join(OUT_DIR, `${piece.name}.png`);
    const webpPath = path.join(OUT_DIR, `${piece.name}.webp`);
    const avifPath = path.join(OUT_DIR, `${piece.name}.avif`);

    await sharp(buffer).png({ compressionLevel: 9, palette: true }).toFile(pngPath);
    await sharp(buffer).webp({ quality: 82, alphaQuality: 100, effort: 6 }).toFile(webpPath);
    await sharp(buffer).avif({ quality: 55, effort: 6 }).toFile(avifPath);

    const sizes = {
      png: fs.statSync(pngPath).size,
      webp: fs.statSync(webpPath).size,
      avif: fs.statSync(avifPath).size,
    };
    report.push({ name: piece.name, region: piece.region, sizes });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
