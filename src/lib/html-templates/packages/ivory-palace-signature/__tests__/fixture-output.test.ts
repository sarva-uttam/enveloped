/**
 * Not a pure unit test — mirrors ../../timeless-editorial-v2/__tests__/
 * fixture-output.test.ts: writes the rendered fixture document(s) and
 * their template assets to a local, gitignored output directory
 * (generator-output/ivory-palace-signature/) so they can be opened in
 * a real browser for the desktop/mobile/reduced-motion/save-data/
 * long-names/RSVP-state screenshot pass. Still asserts every variant
 * passes the independent security validator before writing anything.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, cpSync, existsSync } from "node:fs";
import path from "node:path";
import { renderIvoryPalaceInvitation } from "../render";
import {
  IVORY_PALACE_FIXTURE,
  IVORY_PALACE_FIXTURE_NO_RESPONSE,
  IVORY_PALACE_FIXTURE_EMPTY_GALLERY,
  IVORY_PALACE_FIXTURE_LONG_NAMES,
} from "../fixture";
import { validateGeneratedHtml } from "@/lib/html-templates/security";

const OUTPUT_ROOT = path.resolve(__dirname, "../../../../../../generator-output/ivory-palace-signature");
const ASSETS_SRC_DIR = path.resolve(__dirname, "../assets");

function writeVariant(dirName: string, html: string) {
  const dir = path.join(OUTPUT_ROOT, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html, "utf-8");
  cpSync(path.join(ASSETS_SRC_DIR, "scenes"), path.join(dir, "assets", "scenes"), { recursive: true });
  cpSync(path.join(ASSETS_SRC_DIR, "particles"), path.join(dir, "assets", "particles"), { recursive: true });
  cpSync(path.join(ASSETS_SRC_DIR, "video"), path.join(dir, "assets", "video"), { recursive: true });
  cpSync(path.join(ASSETS_SRC_DIR, "fonts"), path.join(dir, "assets", "fonts"), { recursive: true });
  return dir;
}

describe("fixture output generation", () => {
  it("renders, validates, and writes the default fixture for manual/browser review", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    const dir = writeVariant("default", html);
    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
    expect(existsSync(path.join(dir, "assets", "scenes", "monogram-941.webp"))).toBe(true);
  });

  it("renders a no-response (RSVP disabled) variant", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_NO_RESPONSE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    writeVariant("no-response", html);
  });

  it("renders an empty-gallery variant", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_EMPTY_GALLERY);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    writeVariant("empty-gallery", html);
  });

  it("renders a long-names / long-venue variant", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_LONG_NAMES);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    writeVariant("long-names", html);
  });

  it("renders a with-local-photos preview variant (relative gallery URLs, not representative composition data, for genuine visual screenshotting only)", () => {
    const previewData = {
      ...IVORY_PALACE_FIXTURE,
      gallery: [
        { url: "assets/gallery-samples/sample-1.webp", alt: IVORY_PALACE_FIXTURE.gallery[0].alt },
        { url: "assets/gallery-samples/sample-2.webp", alt: IVORY_PALACE_FIXTURE.gallery[1].alt },
        { url: "assets/gallery-samples/sample-3.webp", alt: IVORY_PALACE_FIXTURE.gallery[2].alt },
        { url: "assets/gallery-samples/sample-4.webp", alt: IVORY_PALACE_FIXTURE.gallery[3].alt },
        { url: "assets/gallery-samples/sample-5.webp", alt: IVORY_PALACE_FIXTURE.gallery[4].alt },
        { url: "assets/gallery-samples/sample-6.webp", alt: IVORY_PALACE_FIXTURE.gallery[5].alt },
      ],
    };
    const html = renderIvoryPalaceInvitation(previewData);
    // Relative src values are valid per the output validator (same-origin
    // template asset), even though schema.ts's safeUrl would reject a
    // relative string for real stored composition data — this variant
    // exists purely to screenshot the populated-gallery state.
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    const dir = writeVariant("with-local-photos", html);
    cpSync(path.join(ASSETS_SRC_DIR, "gallery-samples"), path.join(dir, "assets", "gallery-samples"), { recursive: true });
  });
});
