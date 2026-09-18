/**
 * Not a pure unit test — this deliberately writes the rendered fixture
 * document and its template assets to a local, gitignored output
 * directory (generator-output/timeless-editorial-v2/) so it can be
 * opened in a real browser for the desktop/mobile/reduced-motion/
 * no-JS/image-failure screenshot pass. It still asserts the output
 * passes the independent security validator before writing anything.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderTimelessEditorialInvitation } from "../render";
import { TIMELESS_EDITORIAL_FIXTURE, TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE } from "../fixture";
import { validateGeneratedHtml } from "@/lib/html-templates/security";

const OUTPUT_DIR = path.resolve(__dirname, "../../../../../../generator-output/timeless-editorial-v2");
const ASSETS_SRC_DIR = path.resolve(__dirname, "../assets");
const ASSET_FILES = [
  "petal-sprites.png",
  "petal-sprites.webp",
  "petal-sprites.avif",
  "sparkle-sprites.png",
  "sparkle-sprites.webp",
  "sparkle-sprites.avif",
];
const FONT_FILES = readdirSync(path.join(ASSETS_SRC_DIR, "fonts")).filter((f) => f.endsWith(".woff2"));
const FRAME_PIECE_FILES = readdirSync(path.join(ASSETS_SRC_DIR, "frame-pieces")).filter(
  (f) => f.endsWith(".png") || f.endsWith(".webp") || f.endsWith(".avif"),
);

describe("fixture output generation", () => {
  it("renders, validates, and writes the standalone document + assets for manual/browser review", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    const validation = validateGeneratedHtml(html);
    expect(validation).toEqual({ ok: true, errors: [] });

    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(path.join(OUTPUT_DIR, "assets"), { recursive: true });
    mkdirSync(path.join(OUTPUT_DIR, "assets", "fonts"), { recursive: true });
    mkdirSync(path.join(OUTPUT_DIR, "assets", "frame-pieces"), { recursive: true });
    writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf-8");
    for (const file of ASSET_FILES) {
      copyFileSync(path.join(ASSETS_SRC_DIR, file), path.join(OUTPUT_DIR, "assets", file));
    }
    for (const file of FONT_FILES) {
      copyFileSync(path.join(ASSETS_SRC_DIR, "fonts", file), path.join(OUTPUT_DIR, "assets", "fonts", file));
    }
    for (const file of FRAME_PIECE_FILES) {
      copyFileSync(path.join(ASSETS_SRC_DIR, "frame-pieces", file), path.join(OUTPUT_DIR, "assets", "frame-pieces", file));
    }

    // A second copy with the assets directory missing, to exercise the
    // decorative-image-failure fallback path without touching the
    // primary output.
    const noImagesDir = path.join(OUTPUT_DIR, "..", "timeless-editorial-v2-no-images");
    mkdirSync(noImagesDir, { recursive: true });
    writeFileSync(path.join(noImagesDir, "index.html"), html, "utf-8");

    expect(existsSync(path.join(OUTPUT_DIR, "index.html"))).toBe(true);
    for (const file of ASSET_FILES) {
      expect(existsSync(path.join(OUTPUT_DIR, "assets", file))).toBe(true);
    }
    expect(existsSync(path.join(noImagesDir, "index.html"))).toBe(true);
  });

  it("renders a short-names variant (exercises the inline name format) for visual/layout verification", () => {
    const shortNamesData = { ...TIMELESS_EDITORIAL_FIXTURE, partner1Name: "Jo", partner2Name: "Al" };
    const html = renderTimelessEditorialInvitation(shortNamesData);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });

    const dir = path.join(OUTPUT_DIR, "..", "timeless-editorial-v2-short-names");
    mkdirSync(path.join(dir, "assets"), { recursive: true });
    mkdirSync(path.join(dir, "assets", "fonts"), { recursive: true });
    mkdirSync(path.join(dir, "assets", "frame-pieces"), { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html, "utf-8");
    for (const file of ASSET_FILES) copyFileSync(path.join(ASSETS_SRC_DIR, file), path.join(dir, "assets", file));
    for (const file of FONT_FILES) copyFileSync(path.join(ASSETS_SRC_DIR, "fonts", file), path.join(dir, "assets", "fonts", file));
    for (const file of FRAME_PIECE_FILES)
      copyFileSync(path.join(ASSETS_SRC_DIR, "frame-pieces", file), path.join(dir, "assets", "frame-pieces", file));

    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
  });

  it("renders a no-response variant for visual/layout verification", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });

    const dir = path.join(OUTPUT_DIR, "..", "timeless-editorial-v2-no-response");
    mkdirSync(path.join(dir, "assets"), { recursive: true });
    mkdirSync(path.join(dir, "assets", "fonts"), { recursive: true });
    mkdirSync(path.join(dir, "assets", "frame-pieces"), { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html, "utf-8");
    for (const file of ASSET_FILES) copyFileSync(path.join(ASSETS_SRC_DIR, file), path.join(dir, "assets", file));
    for (const file of FONT_FILES) copyFileSync(path.join(ASSETS_SRC_DIR, "fonts", file), path.join(dir, "assets", "fonts", file));
    for (const file of FRAME_PIECE_FILES)
      copyFileSync(path.join(ASSETS_SRC_DIR, "frame-pieces", file), path.join(dir, "assets", "frame-pieces", file));

    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
  });
});
