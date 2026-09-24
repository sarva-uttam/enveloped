/**
 * Approved Ivory Palace stop-layer baseline lock (second layer
 * Owner-approved at commit 66236606542bd7701fb54f3fe0558fd623a2fbc2;
 * third-layer ceremonial foregrounds Owner-approved from the
 * ivory-palace-final-third-layer package).
 *
 * Fast static regression checks: any accidental change to the approved
 * configuration fails here, before the browser-driven verify.js runs.
 * Changing an approved value is a deliberate decision: update the
 * approval record (docs/html-invitation-generator/
 * IVORY-PALACE-STOP-LAYER-APPROVAL.md) and this file together.
 *
 * Usage (from the repo root):
 *   node --test experiments/ivory-palace-frame-journey/baseline.test.cjs
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node test, not app code */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DIR = __dirname;
const read = (rel) => fs.readFileSync(path.join(DIR, rel), "utf8");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const script = read("script.js");
const css = read("styles.css");
const html = read("index.html");

// Approved values. Keep in step with the approval record.
const APPROVED = {
  stops: [80, 160, 240, 300],
  frameAsset: "assets/ivory-palace-arch-frame.png",
  frameAssetSha256: "ffb1d38eeb863ccf18c09e88ace80bd14a17c39712e655030166fd2089a70e44",
  openingMask: "assets/ivory-palace-arch-frame-opening.png",
  openingMaskSha256: "0876e9d2c5bf0b77ec8b62f10d2f0e622f74082decb3304da5217650b63df6da",
  finaleGrainSha256: "f6d52e8d36c9df095053596b585f6456cd79a142ac57173324e20b1aeab038f8",
  framesSha256: "e21ab777c7c13d14cf3ed09ace8705d145a5028f8abc9ee2515d51aa0a07cf37", // replacement sequence (same source video)
  frameSize: [941, 1672]
};

// The body of the first CSS rule whose selector list matches `selector`.
function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(m, `CSS rule not found: ${selector}`);
  return m[1];
}

test("stop frames are exactly 80, 160, 240 and 300", () => {
  const frames = [...script.matchAll(/\{\s*frame:\s*(\d+),\s*label:\s*"(\w+)"\s*\}/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(frames, [[80, "Welcome"], [160, "Haldi"], [240, "Wedding"], [300, "Finale"]]);
  assert.match(script, /var TOTAL_FRAMES = 300;/);
});

test("the 300 approved background frames (replacement sequence) are unchanged", () => {
  const names = fs.readdirSync(path.join(DIR, "frames")).sort();
  assert.equal(names.length, 300);
  assert.equal(names[0], "ezgif-frame-001.jpg");
  assert.equal(names[299], "ezgif-frame-300.jpg");
  const all = Buffer.concat(names.map((n) => fs.readFileSync(path.join(DIR, "frames", n))));
  assert.equal(sha256(all), APPROVED.framesSha256);
});

test("approved Indian arch frame asset: path, bytes, size and transparency", () => {
  assert.match(html, /<img class="stop-panel__frame" id="stopFrameArt" src="assets\/ivory-palace-arch-frame\.png"\s+width="941" height="1672" alt="" \/>/);
  const png = fs.readFileSync(path.join(DIR, APPROVED.frameAsset));
  assert.equal(sha256(png), APPROVED.frameAssetSha256);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], APPROVED.frameSize);
  assert.equal(png[25], 6, "colour type 6 = RGBA (has alpha)");
  const mask = fs.readFileSync(path.join(DIR, APPROVED.openingMask));
  assert.equal(sha256(mask), APPROVED.openingMaskSha256);
  assert.deepEqual([mask.readUInt32BE(16), mask.readUInt32BE(20)], APPROVED.frameSize);
  assert.match(script, /openingMask\.src = "assets\/ivory-palace-arch-frame-opening\.png";/);
  assert.ok(!fs.existsSync(path.join(DIR, "assets/ivory-palace-ornamental-frame.png")), "rejected floral frame must not return");
});

test("warm ivory panel is 85% opaque and masked to the frame opening", () => {
  const fill = cssRule(".stop-panel__fill");
  assert.match(fill, /background: rgba\(253, 249, 241, 0\.85\);/);
  assert.match(fill, /mask: url\("assets\/ivory-palace-arch-frame-opening\.png"\) center \/ 100% 100% no-repeat;/);
  assert.match(fill, /inset: 0;/);
});

test("framed panel keeps the artwork ratio at ~90% of the invitation", () => {
  const panel = cssRule(".stop-panel");
  assert.match(panel, /width: min\(90cqw, calc\(90cqh \* 941 \/ 1672\)\);/);
  assert.match(panel, /aspect-ratio: 941 \/ 1672;/);
  assert.match(panel, /transform: translate\(-50%, -50%\);/);
  assert.match(cssRule(".frame-box"), /container-type: size;/);
});

test("layer order: canvas, fill, frame, ornaments, reserved wording, finale light, loader, controls", () => {
  const order = ['id="frameCanvas"', 'class="stop-panel__fill"', 'id="stopFrameArt"', 'class="stop-ornaments"', 'id="stopContent"', 'id="finaleLight"', 'id="loader"', 'id="navUp"', 'id="navDown"'];
  const positions = order.map((token) => html.indexOf(token));
  positions.forEach((p, i) => assert.ok(p > 0, `${order[i]} present`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /<section class="stop-content" id="stopContent" hidden inert><\/section>/, "no live wording yet");
});

test("panel fades: 1.4s ease-out in, 1.0s ease-in out; finale 1.2s / 0.8s", () => {
  const root = cssRule(":root");
  assert.match(root, /--panel-enter-ms: 1400ms;/);
  assert.match(root, /--panel-exit-ms: 1000ms;/);
  assert.match(root, /--ease-settle: cubic-bezier\(0\.22, 0\.61, 0\.36, 1\);/);
  assert.match(root, /--ease-dissolve: cubic-bezier\(0\.42, 0, 1, 1\);/);
  assert.match(root, /--finale-enter-ms: 1200ms;/);
  assert.match(root, /--finale-exit-ms: 800ms;/);
  assert.match(cssRule(".stop-panel"), /transition: opacity var\(--panel-exit-ms\) var\(--ease-dissolve\);/);
  assert.match(cssRule('.frame-box[data-surface="panel"] .stop-panel'), /opacity: 1;\s*transition: opacity var\(--panel-enter-ms\) var\(--ease-settle\);/);
});

test("frame-300 finale is the unchanged full-box warm-white light", () => {
  const finale = css.match(/\.finale-light \{\n  inset: 0;\n  z-index: 2;([^}]*)\}/);
  assert.ok(finale, "finale-light fills the invitation box");
  assert.equal(
    finale[1],
    '\n  background:\n    url("mist/paper-grain.svg") 0 0 / 240px 240px repeat,\n    radial-gradient(ellipse 85% 65% at 50% 44%, #fffdf9, #fcf7ee 58%, #f8f0e2);\n  transition: opacity var(--finale-exit-ms) ease-in-out;\n'
  );
  assert.match(cssRule('.frame-box[data-surface="finale"] .finale-light'), /opacity: 1;\s*transition: opacity var\(--finale-enter-ms\) cubic-bezier\(0\.4, 0, 0\.2, 1\);/);
  assert.equal(sha256(fs.readFileSync(path.join(DIR, "mist/paper-grain.svg"))), APPROVED.finaleGrainSha256);
  assert.match(script, /var FINALE_INDEX = CHAPTERS\.length - 1;/);
  assert.match(script, /if \(index === FINALE_INDEX\) \{\s*frameBox\.setAttribute\("data-surface", "finale"\);/);
});

test("background journey: real-time 30fps pace with gentleEase and a hard 30fps ceiling", () => {
  assert.match(script, /var SOURCE_FPS = 30;/);
  assert.match(script, /var FLOOR_GAP_MS = 1000 \/ 30;/);
  assert.match(script, /return \(frames \/ SOURCE_FPS\) \* 1000;/);
  assert.match(script, /function gentleEase\(t\) \{\s*var w = 0\.3;\s*return \(1 - w\) \* t \+ w \* easeInOutCubic\(t\);/);
  assert.match(script, /var duration = realTimeDuration\(currentFrame, target\);\s*animateFrameStepped\(target, duration, gentleEase,/);
  assert.match(script, /animateFrameStepped\(CHAPTERS\[0\]\.frame, duration, linear,/, "opening stays linear video pace");
  assert.match(script, /var floorOk = elapsed - lastCommitElapsed >= FLOOR_GAP_MS;/);
  assert.match(script, /var painted = renderFrame\(nextInt, direction\); \/\/ always exactly one frame, never skips/);
  assert.doesNotMatch(script, /cinematicEase|journeyDuration/, "reverted cinematic journey must not return");
});

test("input is locked during fades and journeys", () => {
  assert.match(script, /if \(isAnimating\) return;/, "goToChapter ignores input while busy");
  assert.match(script, /navDown\.classList\.remove\("is-visible"\);\s*\/\/ Lock every input source[^\n]*\n[^\n]*\n\s*isAnimating = true;\s*leaveSurface\(/);
  assert.match(script, /function arriveAtStop\(index\) \{\s*isAnimating = true;\s*enterSurface\(index, function \(\) \{\s*isAnimating = false;\s*updateNavVisibility\(\);/);
  assert.equal((script.match(/if \(isAnimating \|\| Date\.now\(\) < lockUntil\)/g) || []).length, 2, "wheel and touch guards");
  assert.match(script, /setTimeout\(onCleared, cssMs\(current === "finale" \? "--finale-exit-ms" : "--panel-exit-ms"\)\);/, "travel waits for the exit fade");
});

test("decoded-frame cache and memory ceiling unchanged", () => {
  assert.match(script, /var FRAME_BYTES_ESTIMATE = 720 \* 1280 \* 4;/);
  assert.match(script, /var MAX_CACHED_FRAMES = 36;/);
  assert.match(script, /var WINDOW_AHEAD_MOVING = 20;/);
  assert.match(script, /var WINDOW_BEHIND_MOVING = 10;/);
  assert.match(script, /var WINDOW_RADIUS_IDLE = 16;/);
});

// ---------------- Third layer (Owner-approved) ----------------

const ORNAMENTS = [
  ["0", "left", "frame-080-left-intro-drape-urli.png", 1168, 1346, "09f4bdb22bf9cb07c564b1b1a73021a3f719a17d37ac7dbeee57aa9072cb9c83"],
  ["0", "right", "frame-080-right-intro-diya-kalash.png", 1158, 1358, "a10f93a2ed3a4ebb319bc88030aa874face6c1ef619de311c20d0958b0217a5d"],
  ["1", "left", "frame-160-left-haldi-kalash-textile.png", 1145, 1374, "42b547389cdc51ebe13c893049c3092805182619232b795394b9e81d963092d6"],
  ["1", "right", "frame-160-right-haldi-floral-kalash.png", 1152, 1365, "8d4af05bc731e5464c09f1940d036712219190484980e14ceda1b4f64996ca88"],
  ["2", "left", "frame-240-left-wedding-lanterns.png", 1131, 1391, "8d408cdfa328f1551aea1dc6314a6c70c359b5e5b5bccc23221a37c7e55b410d"],
  ["2", "right", "frame-240-right-wedding-lotus-urli.png", 1145, 1374, "c72e46b66d9d953ebb522f454d9b0430c0128766150c72dcd0c664caf18aa5b8"]
];

test("approved third-layer ornaments: exact files, stop/side mapping and alpha", () => {
  const files = fs.readdirSync(path.join(DIR, "assets/ornaments")).sort();
  assert.deepEqual(files, ORNAMENTS.map((o) => o[2]).sort());
  for (const [stop, side, file, w, h, hash] of ORNAMENTS) {
    const png = fs.readFileSync(path.join(DIR, "assets/ornaments", file));
    assert.equal(sha256(png), hash, file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [w, h], file);
    assert.equal(png[25], 6, `${file} is RGBA`);
    const tag = new RegExp(`class="stop-ornament stop-ornament--${side}" data-stop="${stop}" src="assets/ornaments/${file.replace(/\./g, "\\.")}" width="${w}" height="${h}"`);
    assert.match(html, tag, `${file} mapped to stop ${stop} ${side}`);
  }
});

test("approved third-layer placement and motion", () => {
  const root = cssRule(":root");
  assert.match(root, /--ornament-enter-ms: 1400ms;/);
  assert.match(root, /--ornament-exit-ms: 900ms;/);
  assert.match(root, /--ornament-shift: 9cqw;/);
  assert.match(root, /--ease-ornament-in: cubic-bezier\(0\.33, 1, 0\.68, 1\);/);
  const base = cssRule(".stop-ornament");
  assert.match(base, /bottom: var\(--orn-bottom, 0px\);/);
  assert.match(base, /height: min\(calc\(var\(--orn-h\) \* 1cqh\), calc\(var\(--orn-reach\) \* 1cqw \/ var\(--orn-ratio\)\), 44cqh\);/);
  assert.match(base, /width: auto;/);
  assert.match(base, /object-fit: contain;/);
  assert.match(cssRule(".stop-ornament--left"), /left: calc\(var\(--orn-edge, 0px\) \+ var\(--orn-dx, 0px\)\);[\s\S]*transform: translateX\(calc\(-1 \* var\(--ornament-shift\)\)\);/);
  assert.match(cssRule(".stop-ornament--right"), /right: calc\(var\(--orn-edge, 0px\) - var\(--orn-dx, 0px\)\);[\s\S]*transform: translateX\(var\(--ornament-shift\)\);/);
  // Manifest placement map: display height % and inward reach % per asset.
  const map = [["left", "0", 42, 66], ["right", "0", 42, 66], ["left", "1", 43, 66], ["right", "1", 43, 66], ["left", "2", 42, 66], ["right", "2", 42, 66]];
  for (const [side, stop, hgt, reach] of map) {
    assert.match(css, new RegExp(`\\.stop-ornament--${side}\\[data-stop="${stop}"\\] \\{ --orn-h: ${hgt}; --orn-reach: ${reach}; --orn-ratio: [\\d.]+; \\}`), `${stop}-${side}`);
  }
  // Sequence: ornaments after the panel settles; out before the panel.
  assert.match(script, /frameBox\.setAttribute\("data-ornaments", String\(index\)\);\s*setTimeout\(onSettled, cssMs\("--ornament-enter-ms"\)\);\s*\}\);\s*\}, cssMs\("--panel-enter-ms"\)\);/);
  assert.match(script, /surfaceToken\+\+;\s*clearOrnaments\(function \(\) \{\s*frameBox\.setAttribute\("data-surface", "none"\);/);
});

test("background grade: restrained CSS filter on the canvas only", () => {
  const root = cssRule(":root");
  assert.match(root, /--bg-saturate: 1\.1;/);
  assert.match(root, /--bg-contrast: 1\.04;/);
  assert.match(root, /--bg-warmth: 0\.06;/);
  assert.match(root, /--bg-brightness: 1;/);
  assert.match(css, /\.frame-canvas \{\n  filter:\n    sepia\(var\(--bg-warmth\)\)\n    saturate\(var\(--bg-saturate\)\)\n    contrast\(var\(--bg-contrast\)\)\n    brightness\(var\(--bg-brightness\)\);\n\}/);
  assert.equal((css.match(/filter:\s*\n?\s*sepia\(/g) || []).length, 1, "grade applied in exactly one place");
  for (const sel of [".stop-panel", ".stop-panel__fill", ".stop-ornament", ".finale-light", ".nav-btn"]) {
    assert.doesNotMatch(cssRule(sel), /filter:/, `${sel} is not graded`);
  }
});
