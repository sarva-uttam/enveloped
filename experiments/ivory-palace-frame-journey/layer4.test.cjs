/**
 * Layer 4 wording placement — static checks (placement checkpoint, NOT
 * Owner-approved). Locks the zone table, stop mapping, reading/exit order,
 * entrance directions, centring rules, motion contract, reduced motion,
 * dev-only review outlines and the empty stop-300 slots. Behaviour in the
 * browser (sequencing, travel, geometry per viewport) is in verify.js.
 *
 * Usage (from the repo root):
 *   node --test experiments/ivory-palace-frame-journey/layer4.test.cjs
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node test, not app code */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DIR = __dirname;
const read = (rel) => fs.readFileSync(path.join(DIR, rel), "utf8");
const css = read("styles.css");
const html = read("index.html");
const script = read("script.js");
const controller = read("layer4-wording.js");
const sandbox = {};
new Function("window", read("layer4-content.js"))(sandbox);
const DATA = sandbox.IVORY_LAYER4_CONTENT;

// id, top, width, height, entrance — the Owner's placement brief.
const SPEC = {
  80: [["intro-heading", 20.5, 30, 8.5, "up"], ["intro-message", 35.5, 60, 17.5, "up"]],
  160: [
    ["haldi-sacred-opening", 15.7, 36, 9.5, "up"], ["haldi-title", 25.2, 49, 6.5, "up"], ["haldi-introduction", 32.1, 63, 5, "left"],
    ["haldi-hosts", 37.4, 48, 4.3, "right"], ["haldi-invitation", 41.7, 62, 5, "left"], ["haldi-bride-name", 46.9, 30, 7.7, "up"],
    ["haldi-date-time", 55, 70, 10, "right"], ["haldi-venue", 65.6, 33, 8.8, "left"], ["haldi-closing-note", 75.3, 46, 4.5, "up"] // fit correction (was 32% x 4%)
  ],
  240: [
    ["wedding-sacred-opening", 15, 36, 10, "up"], ["wedding-title", 25.3, 40, 6.2, "up"], ["wedding-grandparents", 31.6, 64, 7, "left"],
    ["wedding-hosts", 38.6, 65, 4.4, "right"], ["wedding-invitation", 43, 65, 6, "left"], ["wedding-bride-name", 49, 30, 5.8, "up"],
    ["wedding-groom-name", 55.8, 30, 5.8, "up"], ["wedding-groom-lineage", 61.6, 64, 3.2, "right"], ["wedding-date-time", 65, 65, 7.5, "left"],
    ["wedding-venue", 72.6, 40, 7.8, "right"], ["wedding-guest-note", 80.8, 38, 3.3, "up"]
  ],
  300: [["closing-enclosure-top", 34, 60, 4, "none"], ["closing-appreciation", 38.7, 60, 9.2, "up"], ["closing-family", 49.4, 60, 9.8, "up"], ["closing-enclosure-bottom", 60.3, 60, 4, "none"]]
};
const REVIEW = {
  160: ["red", "blue", "yellow", "green", "yellow", "darkgreen", "black", "purple", "orange"],
  240: ["red", "blue", "yellow", "green", "purple", "black", "black", "#f4c2d7", "orange", "#ff4fa3", "cyan"],
  300: ["black", "red", "blue", "black"]
};
// The knot is not in the Owner's colour list (it has its own review colour).

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(m, `CSS rule not found: ${selector}`);
  return m[1];
}

test("stop-to-wording mapping, zone IDs and coordinates match the placement brief", () => {
  assert.deepEqual([...new Set(DATA.zones.map((z) => z.stop))], [80, 160, 240, 300]);
  for (const [frame, rows] of Object.entries(SPEC)) {
    const zones = DATA.zones.filter((z) => z.stop === Number(frame) && z.kind !== "symbol" && z.kind !== "component");
    assert.deepEqual(zones.map((z) => [z.id, z.top, z.width, z.height, z.enter === "fade" ? "none" : z.enter]), rows, `stop ${frame}`);
  }
  assert.equal(new Set(DATA.zones.map((z) => z.id)).size, DATA.zones.length, "unique IDs");
  assert.notEqual(DATA.status.indexOf("pending-owner-review"), -1, "not marked approved");
});

test("reading order, reverse exit order and entrance directions", () => {
  for (const frame of [80, 160, 240, 300]) {
    const animated = DATA.zones.filter((z) => z.stop === frame && z.kind !== "slot");
    assert.deepEqual(animated.map((z) => z.enterOrder), animated.map((_, i) => i + 1), `enter ${frame}`);
    assert.deepEqual(animated.map((z) => z.exitOrder), animated.map((_, i) => animated.length - i), `exit ${frame}`);
    for (const z of animated) assert.match(z.enter, z.kind === "text" || z.kind === "component" ? /^(up|left|right)$/ : /^(fade|fade-up)$/, z.id);
  }
  assert.deepEqual(DATA.zones.filter((z) => z.stop === 300 && z.kind === "text").map((z) => [z.id, z.enter, !!z.slow]), [["closing-appreciation", "up", true], ["closing-family", "up", true]]);
});

test("stop 300 enclosures: approved upright/inverted PNGs in identical zones, gentle fade, order", () => {
  const z300 = DATA.zones.filter((z) => z.stop === 300 && z.kind !== "component");
  assert.deepEqual(z300.map((z) => z.id), ["closing-enclosure-top", "closing-appreciation", "closing-family", "closing-enclosure-bottom"]);
  const [top, , , bottom] = z300;
  for (const z of [top, bottom]) {
    assert.equal(z.kind, "ornament");
    assert.deepEqual([z.width, z.height, z.enter], [60, 4, "fade"]);
    assert.deepEqual(z.lines, []);
  }
  assert.equal(top.image.src, "assets/symbols/enclosure-e2-upper.png");
  assert.equal(bottom.image.src, "assets/symbols/enclosure-e2-lower.png");
  assert.deepEqual([top.top, bottom.top], [34, 60.3]);
  assert.match(cssRule(".closing-enclosure img"), /width: 100%;\s*height: 100%;\s*object-fit: contain;\s*object-position: center;/);
  assert.match(cssRule('.wording-motion[data-enter="fade"]'), /--dx: 0px; --dy: 0px;/, "no slide");
  assert.doesNotMatch(css, /closing-enclosure[^{]*\{[^}]*(scaleY\(-1\)|rotate|filter|box-shadow|border)/, "no runtime flip, filter, shadow or lines");
  assert.doesNotMatch(css, /closing-enclosure[^{]*::(before|after)/, "no pseudo-element replacements");
});

test("nuptial knot sits between the names on the 50% axis, in the couple-names group", () => {
  const w = DATA.zones.filter((z) => z.stop === 240);
  const ids = w.map((z) => z.id);
  assert.deepEqual(ids.slice(ids.indexOf("wedding-bride-name"), ids.indexOf("wedding-groom-name") + 1), ["wedding-bride-name", "wedding-nuptial-knot", "wedding-groom-name"]);
  const [bride, knot, groom] = ["wedding-bride-name", "wedding-nuptial-knot", "wedding-groom-name"].map((id) => w.find((z) => z.id === id));
  assert.deepEqual([bride.group, knot.group, groom.group], Array(3).fill("wedding-couple-names"));
  assert.equal(knot.kind, "symbol");
  assert.equal(knot.image.src, "assets/symbols/symbol-nuptial-knot-charcoal.png");
  assert.equal(knot.centerY, (bride.top + bride.height + groom.top) / 2, "centred between the bride zone bottom and groom zone top");
  assert.deepEqual([bride.enterOrder + 1, knot.enterOrder + 1], [knot.enterOrder, groom.enterOrder], "bride, knot, groom in sequence");
  assert.equal(knot.enter, "fade-up");
  assert.ok(DATA.zones.filter((z) => z.kind === "symbol").every((z) => z.stop === 240), "knot only at stop 240");
  const k = cssRule(".wedding-nuptial-knot");
  for (const rule of [/width: clamp\(38px, 10cqw, 72px\);/, /height: auto;/, /max-height: clamp\(16px, 2\.6cqh, 30px\);/, /object-fit: contain;/]) assert.match(k, rule);
  assert.match(cssRule(".wording-zone.wording-symbol-zone"), /top: var\(--center-y\);[\s\S]*transform: translate\(-50%, -50%\);/);
  assert.match(css, /--wd-symbol-rise: 4px;/);
  assert.match(controller, /subgroups\[z\.group\]\.className = "wording-subgroup " \+ z\.group;/);
});

test("Layer 4 images: decorative, no input, no selection, no filters", () => {
  assert.match(cssRule(".wording-layer img"), /pointer-events: none;\s*user-select: none;/);
  assert.match(controller, /img\.draggable = false;/);
  assert.match(controller, /if \(!image\.alt\) img\.setAttribute\("aria-hidden", "true"\);/);
  const l4css = css.slice(css.indexOf("/* ---------- Layer 4"), css.indexOf("/* ---------- Loader"));
  assert.doesNotMatch(l4css, /filter:/, "no colour filter on Layer 4");
});

test("typography: script titles/names in crimson, serif supporting wording in charcoal, structured serif date", () => {
  const root = cssRule(":root");
  assert.match(root, /--l4-crimson: #9f163a;/);
  assert.match(root, /--l4-charcoal: #382b23;/);
  assert.match(css, /@font-face \{\s*font-family: "Ivory Script";\s*src: url\("assets\/fonts\/alex-brush-latin-400-normal\.woff2"\)/);
  assert.match(css, /@font-face \{\s*font-family: "Ivory Serif";\s*src: url\("assets\/fonts\/playfair-display-latin-600-normal\.woff2"\)/);
  const zone = cssRule(".wording-zone");
  assert.match(zone, /font-family: var\(--l4-serif\);/);
  assert.match(zone, /color: var\(--l4-charcoal\);/);
  assert.match(css, /\.wording-zone\[data-role="groom-name"\] \{\s*font-family: var\(--l4-script\);[\s\S]*?color: var\(--l4-crimson\);/);
  assert.match(cssRule('.wording-zone[data-role="date-time"]'), /font-weight: 600;/);
  for (const f of ["alex-brush-latin-400-normal.woff2", "playfair-display-latin-400-normal.woff2", "playfair-display-latin-600-normal.woff2", "LICENSE-alex-brush.txt", "LICENSE-playfair-display.txt"]) {
    assert.ok(fs.existsSync(path.join(DIR, "assets/fonts", f)), f);
  }
  assert.match(controller, /document\.fonts\.ready/, "fonts loaded before the entrance");
});

test("every wording zone has content and a recorded source/status", () => {
  const statuses = new Set(["catalogue-approved", "catalogue-provisional", "sample-data", "placeholder", "pending-review", "owner-approved-asset", "slot", "component"]);
  for (const z of DATA.zones) {
    assert.ok(statuses.has(z.status), `${z.id} status`);
    assert.ok(z.source, `${z.id} source`);
    if (z.kind === "text") assert.ok(z.lines.length && z.lines.every((l) => l.text.trim()), `${z.id} text`);
  }
  // Exact approved catalogue wording where the brief conflicted with it.
  const text = (id) => DATA.zones.find((z) => z.id === id).lines.map((l) => l.text);
  assert.deepEqual(text("wedding-title"), ["Vivah Vidhi"]);
  assert.deepEqual(text("wedding-guest-note"), ["No gift boxes please"]);
  assert.deepEqual(text("closing-appreciation"), ["Your presence will be highly appreciated."]);
  assert.deepEqual(text("closing-family")[0], "Best Compliments From:");
});

test("zones are centred on the zone; motion lives on an inner wrapper", () => {
  const zone = cssRule(".wording-zone");
  for (const rule of [/left: 50%;/, /transform: translateX\(-50%\);/, /text-align: center;/, /box-sizing: border-box;/, /top: var\(--top\);/, /width: var\(--w\);/, /height: var\(--h\);/]) assert.match(zone, rule);
  assert.match(cssRule(".wording-motion"), /transform: translate3d\(var\(--dx, 0px\), var\(--dy, 0px\), 0\);/);
  assert.match(cssRule('.wording-stop[data-state="in"] .wording-motion'), /transform: none;/);
  const others = css.replace(cssRule(".wording-zone"), "").replace(cssRule(".wording-zone.wording-symbol-zone"), "");
  assert.doesNotMatch(others, /\.wording-zone[^{]*\{[^}]*transform:/, "no other rule transforms a zone (the knot zone keeps -50% on x)");
  assert.doesNotMatch(css, /\.wording-zone[^{]*\{[^}]*(animation|scale|rotate)/, "no scale/rotate/keyframes on zones");
});

test("motion contract: durations, stagger, offsets, easing within the brief", () => {
  const root = cssRule(":root");
  const ms = (name) => Number((root.match(new RegExp(`--${name}: (\\d+)ms;`)) || [])[1]);
  const px = (name) => Number((root.match(new RegExp(`--${name}: (\\d+)px;`)) || [])[1]);
  assert.ok(ms("wd-enter-ms") >= 600 && ms("wd-enter-ms") <= 850);
  assert.ok(ms("wd-stagger-ms") >= 90 && ms("wd-stagger-ms") <= 140);
  assert.ok(ms("wd-exit-ms") >= 350 && ms("wd-exit-ms") <= 500);
  assert.ok(px("wd-shift") >= 12 && px("wd-shift") <= 20);
  assert.ok(px("wd-rise") >= 10 && px("wd-rise") <= 16);
  assert.match(root, /--ease-wording: cubic-bezier\(0\.22, 1, 0\.36, 1\);/);
  assert.match(cssRule('.wording-stop[data-state="in"] .wording-motion'), /calc\(var\(--i\) \* var\(--wd-stagger-ms\)\)/, "staggered in reading order");
  assert.match(cssRule(".wording-motion"), /calc\(var\(--j\) \* var\(--wd-exit-stagger-ms\)\)/, "exit staggered in reverse order");
});

test("reduced motion: opacity only, no translation, no stagger", () => {
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const rule of [/--wd-stagger-ms: 0ms;/, /--wd-exit-stagger-ms: 0ms;/, /--wd-shift: 0px;/, /--wd-rise: 0px;/, /--wd-enter-ms: 220ms;/, /--wd-exit-ms: 160ms;/]) assert.match(rm, rule);
  assert.match(controller, /setTimeout\(function \(\) \{\s*if \(t === token\) done\(\);\s*\}, enterTotal\(group\)\);/, "completion by timer, never by animation events");
});

test("stacking: wording above the stop layer and finale light, below controls, no input capture", () => {
  const layer = cssRule(".wording-layer");
  assert.match(layer, /z-index: 3;/);
  assert.match(layer, /pointer-events: none;/);
  const z = (sel) => Number((cssRule(sel).match(/z-index: (\d+);/) || [])[1]);
  assert.ok(z(".wording-layer") > z(".stop-panel"));
  assert.ok(z(".invite-controls") > z(".wording-layer"));
  assert.match(controller, /frameBox\.insertBefore\(layer, document\.getElementById\("loader"\)\);/);
});

test("sequencing hooks: enter after Layers 2-3, exit before Layer 3", () => {
  assert.match(script, /function enterSurface\(index, onSettled\) \{\s*onSettled = afterWordingEntrance\(index, onSettled\);/);
  assert.match(script, /function clearOrnaments\(done\) \{\s*\/\/ Layer 4 wording always leaves first[^\n]*\n\s*if \(window\.IvoryLayer4 && window\.IvoryLayer4\.isShowing\(\)\) \{\s*window\.IvoryLayer4\.exit\(function \(\) \{\s*clearOrnaments\(done\);/);
  assert.match(controller, /var wait = index === FINALE_INDEX \? cssMs\("--finale-enter-ms"\) : 0;/, "finale wording waits for the finale light");
  assert.ok(html.indexOf('src="layer4-content.js"') < html.indexOf('src="layer4-wording.js"'));
  assert.ok(html.indexOf('src="layer4-wording.js"') < html.indexOf('src="script.js"'));
});

test("review outlines are development-only and use the reference colours", () => {
  assert.match(controller, /if \(\/\[\?&\]review=wording\\b\/\.test\(location\.search\)\) frameBox\.classList\.add\("wording-review"\);/);
  const outlineRules = (css.match(/[^}]*\{[^}]*outline:[^}]*\}/g) || []).filter((r) => /wording/.test(r));
  assert.ok(outlineRules.length >= 1 && outlineRules.every((r) => /\.frame-box\.wording-review \.wording-zone/.test(r)), "wording outlines only under .wording-review");
  assert.match(cssRule(".frame-box.wording-review .wording-zone"), /outline-offset: -2px;/);
  for (const [frame, colours] of Object.entries(REVIEW)) {
    assert.deepEqual(DATA.zones.filter((z) => z.stop === Number(frame) && z.kind !== "symbol" && z.kind !== "component").map((z) => z.reviewColor), colours, `stop ${frame}`);
  }
  const intro = DATA.zones.filter((z) => z.stop === 80).map((z) => z.reviewColor);
  assert.equal(new Set(intro).size, 2, "stop 80 uses two distinct colours");
});

test("no backing panels, shadows or gradients on wording yet", () => {
  const wordingCss = css.slice(css.indexOf("/* ---------- Layer 4"), css.indexOf("/* ---------- Loader"));
  assert.doesNotMatch(wordingCss, /background|box-shadow|text-shadow|gradient|backdrop-filter/);
});

// ---------------- Approved symbols (Ganesha) ----------------

const crypto = require("node:crypto");
const SYMBOLS = {
  "symbol-ganesha-crimson.png": [1151, 1128, "4ca7987bbc17cc4bc4286be219d89ff49e18779bba351ec1629582befecd2cd2"],
  "symbol-nuptial-knot-charcoal.png": [1715, 852, "f949328507429fbaa78b2fc574770cb9045039e6dff4adb357ea8c285cdf26a6"],
  "enclosure-e2-upper.png": [2027, 498, "f7ea924bbbe08732327011fb3909f307c4a1b6e519b7f3ae13a9fa2c1e7c647c"],
  "enclosure-e2-lower.png": [1974, 500, "aaf71bda9542ba7e0514121a3622b42f1f5aea9f8ad421ed7c00ceeb3c8187ad"]
};

test("approved symbol assets: exact files, sizes, RGBA and genuine transparency", async () => {
  assert.deepEqual(fs.readdirSync(path.join(DIR, "assets/symbols")).sort(), Object.keys(SYMBOLS).sort());
  const sharp = require(require.resolve("sharp", { paths: [path.join(DIR, "../..")] }));
  for (const [file, [w, h, hash]] of Object.entries(SYMBOLS)) {
    const buf = fs.readFileSync(path.join(DIR, "assets/symbols", file));
    assert.equal(crypto.createHash("sha256").update(buf).digest("hex"), hash, file);
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [w, h, 4], file);
    let transparent = 0, opaqueMatte = 0, edge = 0;
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3], x = i % w, y = (i / w) | 0;
      if (a === 0) transparent++;
      if (a === 255) { const mx = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), mn = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); if (mx < 12 || mn > 243) opaqueMatte++; }
      if (a > 0 && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) edge++;
    }
    assert.ok(transparent / (w * h) > 0.8, `${file} mostly transparent`);
    assert.ok(opaqueMatte / (w * h) < 0.001, `${file} has no opaque black/white matte`);
    assert.equal(edge, 0, `${file} artwork does not touch the canvas edge`);
  }
});

test("Ganesha is paired with the mantra inside both sacred-opening zones", () => {
  const sacred = DATA.zones.filter((z) => z.role === "sacred-invocation");
  assert.deepEqual(sacred.map((z) => [z.id, z.stop]), [["haldi-sacred-opening", 160], ["wedding-sacred-opening", 240]]);
  for (const z of sacred) {
    assert.deepEqual(z.lines, [{ text: "ॐ श्री गणेशाय नमः", lang: "sa" }]);
    assert.deepEqual(z.symbol, { src: "assets/symbols/symbol-ganesha-crimson.png", width: 1151, height: 1128, alt: "Ganesha" });
  }
  assert.ok(DATA.zones.filter((z) => z.symbol).every((z) => z.role === "sacred-invocation"), "Ganesha appears only with the mantra");
  assert.match(controller, /var zone = document\.createElement\(!isText \|\| z\.symbol \? "div"/, "div container (no div inside p)");
  assert.match(controller, /motion\.appendChild\(makeImage\(z\.symbol, "sacred-opening__ganesha"\)\);\s*lineHost = document\.createElement\("div"\);\s*lineHost\.className = "sacred-opening__mantra";/, "image first, then the mantra");
  assert.match(controller, /\(z\.symbol \? " sacred-opening" : ""\)/, "symbol and mantra share one motion wrapper");
  assert.match(controller, /ready\.then\(start\)/, "symbols decoded before the entrance");
  const g = cssRule(".sacred-opening__ganesha");
  for (const rule of [/width: clamp\(34px, 10cqw, 72px\);/, /height: auto;/, /max-height: 52%;/, /object-fit: contain;/, /flex: 0 0 auto;/]) assert.match(g, rule);
  assert.match(cssRule(".sacred-opening"), /flex-direction: column;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*gap: clamp\(2px, 0\.5cqh, 6px\);/);
  assert.match(cssRule(".sacred-opening__mantra"), /width: 100%;[\s\S]*text-align: center;[\s\S]*white-space: normal;/);
});

// ---------------- Visual-refinement pass: fit corrections, rail ----------------

test("fit corrections: Haldi closing note and wedding invitation", () => {
  const note = DATA.zones.find((z) => z.id === "haldi-closing-note");
  assert.deepEqual([note.top, note.height, note.widthCss], [75.3, 4.5, "clamp(144px, 46%, 280px)"]);
  const n = cssRule(".wording-zone#haldi-closing-note");
  assert.match(n, /width: clamp\(144px, 46%, 280px\);/);
  assert.match(n, /font-size: clamp\(11px, 3cqw, 16px\);/);
  assert.match(n, /line-height: 1\.05;/);
  const inv = DATA.zones.find((z) => z.id === "wedding-invitation");
  assert.deepEqual([inv.top, inv.width, inv.height], [43, 65, 6], "invitation coordinates unchanged");
  const i = cssRule(".wording-zone#wedding-invitation");
  assert.match(i, /font-size: clamp\(11px, 1\.6cqh, 24\.5px\);/, "about 6% below the 1.7cqh / 26px supporting size");
  assert.match(i, /line-height: 1\.04;/);
});

test("narrow-phone sacred-opening correction stays inside the container", () => {
  const block = css.slice(css.indexOf("@container (max-width: 360px)"));
  assert.match(block, /\.sacred-opening \{ padding-top: calc\(2px \+ 1\.6cqh\); \}/, "shifts the centred group down 0.8cqh");
  assert.match(block, /\.sacred-opening__ganesha \{ width: clamp\(28px, 8\.5cqw, 72px\); \}/);
  for (const id of ["haldi-sacred-opening", "wedding-sacred-opening"]) {
    const z = DATA.zones.find((x) => x.id === id);
    assert.ok(z.top === 15.7 || z.top === 15, "outer container unchanged");
  }
});

test("interface layer: utilities upper right, navigation rail middle right, reusable controls", () => {
  const aside = html.slice(html.indexOf('<aside class="invite-controls"'), html.indexOf("</aside>"));
  assert.match(aside, /aria-label="Invitation controls"/);
  assert.match(aside, /<div class="invite-controls__utilities" role="toolbar" aria-label="Invitation utilities"><\/div>/, "utilities populated by the reusable component");
  assert.match(aside, /<nav class="invite-controls__navigation" aria-label="Invitation navigation">/);
  assert.ok(aside.indexOf('id="navUp"') < aside.indexOf('id="navDown"'), "previous above next");
  assert.match(aside, /id="navUp" class="invite-control invite-control--previous" type="button" aria-label="Previous chapter"/);
  assert.match(aside, /id="navDown" class="invite-control invite-control--next" type="button" aria-label="Next chapter"/);
  assert.doesNotMatch(html, /nav-btn/, "old centred buttons removed");
  assert.match(cssRule(".invite-controls"), /position: absolute;\s*inset: 0;\s*z-index: 6;\s*pointer-events: none;/);
  const util = cssRule(".invite-controls__utilities");
  for (const rule of [/top: max\(1\.6cqh, 10px, env\(safe-area-inset-top\)\);/, /right: max\(8px, calc\(3\.5cqw - 4px\), env\(safe-area-inset-right\)\);/, /flex-direction: row;/]) assert.match(util, rule);
  const nav = cssRule(".invite-controls__navigation");
  for (const rule of [/right: max\(8px, calc\(3\.5cqw - 4px\), env\(safe-area-inset-right\)\);/, /top: 47%;/, /transform: translateY\(-50%\);/, /flex-direction: column;/]) assert.match(nav, rule);
  const btn = cssRule(".invite-control");
  assert.match(btn, /width: clamp\(44px, 8cqw, 60px\);/, "at least 44px touch target");
  assert.match(btn, /height: clamp\(44px, 8cqw, 60px\);/);
  assert.match(btn, /background: var\(--ctl-surface\);/);
  assert.match(btn, /border: 1px solid var\(--ctl-border\);/);
  assert.doesNotMatch(btn, /opacity: 0\.[1-9]/, "no whole-button translucency");
  assert.match(css, /\n\.invite-control:focus-visible \{\s*outline: 2px solid var\(--ctl-focus\);/, "visible keyboard focus");
  assert.match(css, /\.invite-control:disabled \{\s*background: var\(--ctl-surface-disabled\);/);
  const theme = cssRule(".theme-ivory-palace");
  for (const rule of [/--ctl-icon: #9f163a;/, /--ctl-icon-quiet: #382b23;/, /--ctl-border: rgba\(166, 124, 60, 0\.62\);/]) assert.match(theme, rule);
  assert.match(html, /<main id="app" class="app theme-ivory-palace" hidden>/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
  assert.match(script, /navDown\.addEventListener\("click", advance\);\s*navUp\.addEventListener\("click", retreat\);/, "directions not reversed");
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(rm, /\.invite-control \{\s*transition-duration: 0\.01ms !important;/);
  for (const f of ["components/icons.js", "components/event-core.js", "invitation-config.js", "components/controls.js"]) {
    assert.ok(html.indexOf(`src="${f}"`) > 0 && html.indexOf(`src="${f}"`) < html.indexOf('src="script.js"'), `${f} loads before script.js`);
  }
});

test("stop-300 event strips: component zone below the lower enclosure", () => {
  const z = DATA.zones.find((x) => x.id === "closing-events");
  assert.deepEqual([z.stop, z.kind, z.component, z.top, z.width, z.enter], [300, "component", "event-strips", 71.9, 76, "up"]);
  assert.ok(z.top > 60.3 + 4, "below the lower enclosure (60.3% + 4%)");
  assert.equal(DATA.zones.filter((x) => x.kind === "component").length, 1, "strips only at stop 300");
  const zone = css.match(/\.wording-zone\.closing-events \{([^}]*)\}/)[1];
  assert.match(zone, /width: min\(94%, max\(76%, 272px\)\);/);
  const strip = cssRule(".event-strip");
  assert.match(strip, /--strip-h: clamp\(46px, 4\.3cqh, 72px\);/);
  assert.match(strip, /border: 1px solid var\(--strip-border\);/);
  assert.match(strip, /pointer-events: auto;/);
  assert.match(cssRule(".event-strip .event-action"), /width: 44px;\s*height: 44px;/);
  assert.match(cssRule(".event-strip__time"), /font-variant-numeric: tabular-nums lining-nums;/, "tabular numerals");
  assert.match(controller, /components\.forEach\(function \(c\) \{ if \(c\.stop === STOP_FRAMES\[index\]\) c\.api\.start\(\); \}\);/, "tick only while shown");
  assert.match(controller, /components\.forEach\(function \(c\) \{ c\.api\.stop\(\); \}\);/, "timers stopped on exit");
});
