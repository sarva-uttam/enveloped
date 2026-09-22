/**
 * EXPERIMENTAL — NOT PRODUCTION READY
 *
 * Not a pure unit test — writes the rendered prototype document(s) and
 * their assets to a local, gitignored output directory
 * (generator-output/ivory-palace-continuous-journey-v2/) so the
 * scrollymation can be opened and *interacted with* in a real browser,
 * per the Owner's explicit requirement that screenshots alone cannot
 * stand in for running motion. Mirrors the pattern already established
 * in src/lib/html-templates/packages/timeless-editorial-v2/__tests__/.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, existsSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderJourneyDocument } from "../render";
import { JOURNEY_FIXTURE, JOURNEY_FIXTURE_LONG_NAMES } from "../fixture";

const OUTPUT_DIR = path.resolve(__dirname, "../../../../generator-output/ivory-palace-continuous-journey-v2");
const ASSETS_SRC_DIR = path.resolve(__dirname, "../assets");

function writeVariant(dirName: string, html: string) {
  const dir = path.join(OUTPUT_DIR, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html, "utf-8");
  cpSync(ASSETS_SRC_DIR, path.join(dir, "assets"), { recursive: true });
  return dir;
}

describe("Continuous Journey V2 prototype output", () => {
  it("writes the default (Sarvesh & Shakshina) variant with its runtime assets", () => {
    const html = renderJourneyDocument(JOURNEY_FIXTURE);
    const dir = writeVariant("default", html);
    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
    expect(existsSync(path.join(dir, "assets", "world-plate-1080.webp"))).toBe(true);
    expect(existsSync(path.join(dir, "assets", "fonts", "alex-brush-latin-400-normal.woff2"))).toBe(true);
  });

  it("writes the long-name stress-test variant", () => {
    const html = renderJourneyDocument(JOURNEY_FIXTURE_LONG_NAMES);
    const dir = writeVariant("long-names", html);
    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
  });

  it("writes a blocked-media variant (no assets/ directory) to exercise the broken-image fallback path", () => {
    const html = renderJourneyDocument(JOURNEY_FIXTURE);
    const dir = path.join(OUTPUT_DIR, "blocked-media");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html, "utf-8");
    expect(existsSync(path.join(dir, "index.html"))).toBe(true);
    expect(existsSync(path.join(dir, "assets"))).toBe(false);
  });

  it("every asset referenced by the default variant's derivation report actually exists on disk", () => {
    const reportPath = path.join(ASSETS_SRC_DIR, "DERIVATION-REPORT.json");
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as Array<{ width: number; webpBytes: number }>;
    expect(report.length).toBeGreaterThan(0);
    for (const entry of report) {
      expect(entry.webpBytes).toBeGreaterThan(0);
    }
  });
});
