#!/usr/bin/env node
/**
 * Reproduction / verification script for the Ivory Palace frame-journey
 * experiment. Spins up a local static server for this directory, drives
 * the page with Playwright, and checks the properties documented in
 * docs/html-invitation-generator/IVORY-PALACE-FRAME-JOURNEY-METHOD.md:
 *
 *   - opening (1->80) and every chapter transition land on the exact
 *     approved frame, in both directions, with zero skipped frames
 *   - the render rate never exceeds ~30fps (the approved ceiling)
 *   - the decoded-frame sliding cache never exceeds ~150MB (36 frames)
 *   - one transition is flicker-free: every actually-composited frame
 *     (captured via CDP screencast, not periodic screenshots) is
 *     checked for an anomalous near-black flash
 *   - forward + reverse works via touch swipe on a mobile viewport
 *   - stop surfaces (METHOD §11): the framed ivory panel is never visible
 *     during frame travel, rests fully visible at 80/160/240, frame 300
 *     rests on full-box warm light instead, leaving a stop clears the
 *     right surface, rapid input cannot strand or double a transition,
 *     opacity never jumps, the panel keeps the frame artwork's ratio at
 *     90% of the invitation's limiting side with an 85% ivory fill that
 *     stays inside the frame, layouts hold across seven viewports,
 *     reduced motion keeps every state, and the reserved wording layer
 *     is empty, hidden and inert
 *
 *   - approved-baseline lock (docs/html-invitation-generator/
 *     IVORY-PALACE-STOP-LAYER-APPROVAL.md): each chapter journey keeps its
 *     approved real-time pace (~3.5s per 80-frame leg) and the page loads
 *     the approved arch frame asset. Static source/asset locks live in
 *     baseline.test.cjs.
 *
 * Set VERIFY_SHOTS=<dir> to also save one screenshot per viewport.
 *
 * Requires the `playwright` package (a devDependency of the parent
 * repo) and Python 3 (`python3 -m http.server`) to be on PATH.
 *
 * Usage (from the repo root):
 *   node experiments/ivory-palace-frame-journey/verify.js
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node script, not app code */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const DIR = __dirname;
const PORT = 4531;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;

const CHAPTERS = [80, 160, 240, 300];
const MEMORY_BUDGET_MB = 150;
const MAX_CACHED_FRAMES = 36;
const SHOTS_DIR = process.env.VERIFY_SHOTS || null;

let failures = 0;
function check(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

function analyzeFrameLog(log) {
  const frames = log.map((x) => x[0]);
  const times = log.map((x) => x[1]);
  let maxJump = 0;
  let minGap = Infinity;
  const skips = [];
  for (let i = 1; i < frames.length; i++) {
    const fdelta = Math.abs(frames[i] - frames[i - 1]);
    const tgap = times[i] - times[i - 1];
    if (fdelta > 1) skips.push({ from: frames[i - 1], to: frames[i] });
    maxJump = Math.max(maxJump, fdelta);
    if (tgap > 0) minGap = Math.min(minGap, tgap);
  }
  return { frames, minGap, maxJump, skips };
}

// Minimal PNG brightness check (no external image lib): sums raw
// (post-filter-byte, pre-unfilter — fine for relative brightness) IDAT
// bytes. A genuine blank/flash frame collapses toward 0.
function pngAvgBrightness(buf) {
  let pos = 8;
  let idat = Buffer.alloc(0);
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat = Buffer.concat([idat, buf.subarray(pos + 8, pos + 8 + len)]);
    if (type === "IEND") break;
    pos += 8 + len + 4;
  }
  const raw = zlib.inflateSync(idat);
  const n = Math.min(raw.length, 300000);
  let total = 0;
  for (let i = 0; i < n; i++) total += raw[i];
  return total / n;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
      cwd: DIR,
      stdio: "ignore"
    });
    p.on("error", reject);
    setTimeout(() => resolve(p), 700);
  });
}

async function waitSettle(page, getFrame, expected, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await getFrame()) === expected) {
      await page.waitForTimeout(500);
      if ((await getFrame()) === expected) return true;
    }
    await page.waitForTimeout(60);
  }
  return false;
}


// ---------------- Stop-surface helpers ----------------

// Installed before page scripts: samples the overlay state on every
// animation frame so travel-time visibility and opacity jumps can be
// checked after the fact, independent of the driver's polling cadence.
function installOverlaySampler() {
  window.__frameLog = [];
  window.__overlaySamples = [];
  (function sample() {
    if (window.__overlayState) {
      const o = window.__overlayState();
      const visible = o.ornamentStates.filter((s) => s[2] > 0.01);
      const tx = (t) => {
        const m = /matrix\(([^)]+)\)/.exec(t || "");
        return m ? parseFloat(m[1].split(",")[4]) : 0;
      };
      window.__overlaySamples.push([
        o.frame, o.surface, o.panelOpacity, o.finaleOpacity, performance.now(),
        o.ornaments,
        visible.reduce((m, s) => Math.max(m, s[2]), 0),
        [...new Set(visible.map((s) => s[0]))].join(","),
        visible.map((s) => [s[1], s[2], tx(s[3])]),
        o.wording ? Math.max(0, ...o.wording.groups.map((g) => g[1])) : 0,
        o.wording ? o.wording.active : -1,
        o.wording ? o.wording.groups.map((g) => g[1]) : []
      ]);
    }
    requestAnimationFrame(sample);
  })();
}

const overlay = (page) => page.evaluate(() => window.__overlayState());

// ---------------- Third-layer ornament helpers (placement prototype) ----------------

const translateXOf = (transform) => {
  const m = /matrix\(([^)]+)\)/.exec(transform || "");
  return m ? parseFloat(m[1].split(",")[4]) : 0;
};

const ORNAMENT_FILES = {
  0: ["frame-080-left-intro-drape-urli.png", "frame-080-right-intro-diya-kalash.png"],
  1: ["frame-160-left-haldi-kalash-textile.png", "frame-160-right-haldi-floral-kalash.png"],
  2: ["frame-240-left-wedding-lanterns.png", "frame-240-right-wedding-lotus-urli.png"]
};

// Sequencing measured from the rAF samples. Sample layout:
// [frame, surface, panelOpacity, finaleOpacity, time, ornamentsAttr, ornMax, visibleStops, visibleDetail]
function analyzeOrnamentSequence(samples) {
  const r = { arrivals: [], departures: [], mixed: 0, wrongDirection: 0, travelLeaks: 0 };
  const stops = new Set(CHAPTERS);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s[7] && s[7].includes(",")) r.mixed++;
    if (s[0] > 1 && !stops.has(s[0]) && s[6] > 0.02) r.travelLeaks++;
    for (const [side, opacity, tx] of s[8] || []) {
      if (opacity < 0.98 && ((side === "left" && tx > 0.5) || (side === "right" && tx < -0.5))) r.wrongDirection++;
    }
    if (i === 0) continue;
    const prevAttr = samples[i - 1][5], attr = s[5];
    if (prevAttr === "none" && attr !== "none") {
      // Arrival: panel must already be settled when the ornaments start.
      let panelSettledAt = null;
      for (let j = i; j >= 0 && samples[j][1] === "panel"; j--) if (samples[j][2] >= 0.995) panelSettledAt = samples[j][4];
      let firstVisible = null, full = null;
      for (let j = i; j < samples.length && samples[j][5] === attr; j++) {
        if (firstVisible === null && samples[j][6] > 0.01) firstVisible = samples[j][4];
        if (samples[j][6] >= 0.995) { full = samples[j][4]; break; }
      }
      r.arrivals.push({ stop: attr, panelSettledBeforeOrnaments: panelSettledAt !== null && panelSettledAt <= s[4] + 1, enterMs: full !== null ? full - s[4] : null, firstVisibleAfterMs: firstVisible !== null ? firstVisible - s[4] : null });
    }
    if (prevAttr !== "none" && attr === "none") {
      // Departure: ornaments clear, then the panel fades, then frames move.
      const t0 = s[4], startFrame = s[0];
      let cleared = null, panelStarts = null, moves = null;
      for (let j = i; j < samples.length; j++) {
        if (cleared === null && samples[j][6] <= 0.01) cleared = samples[j][4];
        if (panelStarts === null && samples[j][2] < 0.995) panelStarts = samples[j][4];
        if (samples[j][0] !== startFrame) { moves = samples[j][4]; break; }
      }
      r.departures.push({ from: prevAttr, exitMs: cleared - t0, panelStartsAfterMs: panelStarts - t0, framesMoveAfterMs: moves - t0, ornamentsClearedBeforePanel: cleared <= panelStarts + 1 });
    }
  }
  return r;
}

// Approved third-layer geometry, measured from the VISIBLE ARTWORK (not
// the PNG canvas): each ornament is rendered alone over the flat frame-box
// background and its pixel bounds are found, as % of the invitation box.
async function ornamentArtBounds(page, stop, side) {
  await page.evaluate(({ stop, side }) => {
    for (const s of ["#frameCanvas", ".stop-panel__fill", "#stopFrameArt", ".invite-control", ".wording-stop"]) document.querySelectorAll(s).forEach((e) => (e.style.visibility = "hidden"));
    document.querySelectorAll(".stop-ornament").forEach((e) => (e.style.visibility = e.dataset.stop === stop && e.classList.contains("stop-ornament--" + side) ? "" : "hidden"));
  }, { stop, side });
  await page.waitForTimeout(80);
  const png = await page.locator("#frameBox").screenshot();
  await page.evaluate(() => document.querySelectorAll("#frameCanvas, .stop-panel__fill, #stopFrameArt, .invite-control, .stop-ornament, .wording-stop").forEach((e) => (e.style.visibility = "")));
  return analyzePng(page, png, `
    const c = rgb(Math.floor(w / 2), Math.floor(h / 3));
    let l = w, r = -1, t = h, b = -1;
    for (let y = 0; y < h; y++) for (let x = 2; x < w - 2; x++) {
      const p = rgb(x, y);
      if (Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) > 24) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    }
    return { l: l / w * 100, r: (r + 1) / w * 100, t: t / h * 100, b: (b + 1) / h * 100 };
  `);
}

// Owner-approved placement (final-third-layer manifest): visible artwork
// rises from the bottom outer corner to ~57-60% of the invitation height
// on 9:16 invitations (lower on taller phones, where the manifest's
// inward-reach cap takes over), reaches the bottom and the outer edge,
// stays on its own side of the centre (≤ 49% reach), keeps its aspect
// ratio, and the down control stays clickable on top.
async function ornamentPlacementProblems(page, stop) {
  const problems = [];
  const files = await page.evaluate((stop) => [...document.querySelectorAll(`.stop-ornament[data-stop="${stop}"]`)].map((img) => {
    const r = img.getBoundingClientRect();
    return { side: img.classList.contains("stop-ornament--left") ? "left" : "right", src: img.getAttribute("src").split("/").pop(),
      ratioOk: Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) < 0.01, fit: getComputedStyle(img).objectFit };
  }), stop);
  if (files.map((f) => f.src).join() !== ORNAMENT_FILES[stop].join()) problems.push(`stop ${stop} assets ${files.map((f) => f.src).join()}`);
  const layout = await page.evaluate(() => { const r = document.getElementById("frameBox").getBoundingClientRect(); return { overflowX: document.documentElement.scrollWidth > innerWidth, aspect: r.width / r.height }; });
  const art = {};
  for (const f of files) {
    const a = (art[f.side] = await ornamentArtBounds(page, stop, f.side));
    const tag = `${stop}-${f.side}`;
    if (!f.ratioOk || f.fit !== "contain") problems.push(`${tag} aspect ratio or fit changed`);
    const topMax = layout.aspect >= 0.55 ? 61 : 68;
    if (a.t < 55 || a.t > topMax) problems.push(`${tag} art top ${a.t.toFixed(1)}% (want 55-${topMax}%)`);
    if (a.b < 98) problems.push(`${tag} art bottom ${a.b.toFixed(1)}% (not anchored to the bottom)`);
    if (f.side === "left" ? a.l > 2.5 : a.r < 97.5) problems.push(`${tag} not anchored to its outer edge`);
    if (f.side === "left" ? a.r > 67 : a.l < 33) problems.push(`${tag} reaches past the 66% inward cap`);
  }
  if (layout.overflowX) problems.push("horizontal overflow");
  if (!(await navHit(page, "navDown"))) problems.push("down control not clickable above the ornaments");
  return { problems, art };
}


// Waits until the page is at rest on `chapter` with its surface fully in.
async function waitSurface(page, frame, timeoutMs = 12000) {
  const want = frame === 300 ? "finale" : "panel";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const o = await overlay(page);
    const opacity = want === "finale" ? o.finaleOpacity : o.panelOpacity;
    const ornOk = want === "finale" || o.ornamentStates.filter((s) => s[0] === o.ornaments).every((s) => s[2] >= 0.999);
    if (o.frame === frame && !o.isAnimating && o.surface === want && opacity >= 0.999 && ornOk) return o;
    await page.waitForTimeout(50);
  }
  return overlay(page);
}

async function navHit(page, id) {
  return page.evaluate((id) => {
    const b = document.getElementById(id);
    if (!b.classList.contains("is-visible")) return false;
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === b || b.contains(hit);
  }, id);
}

// Decodes a PNG in the page and runs `body` (a function-body string that
// receives w, h, lum(x,y), rgb(x,y), arg) against its pixels.
function analyzePng(page, png, body, arg) {
  return page.evaluate(
    async ({ b64, body, arg }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const rgb = (x, y) => {
        const i = (y * c.width + x) * 4;
        return [d[i], d[i + 1], d[i + 2]];
      };
      const lum = (x, y) => {
        const [r, gg, b] = rgb(x, y);
        return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      };
      return new Function("w", "h", "lum", "rgb", "arg", body)(c.width, c.height, lum, rgb, arg);
    },
    { b64: png.toString("base64"), body, arg }
  );
}

// Measures the framed panel over the flat, dark frame-box background
// (canvas and controls hidden for the capture, then restored): geometry
// from the DOM, fill opacity and the frame's clear exterior from pixels.
const FRAME_RATIO = 941 / 1672;
async function measurePanel(page) {
  const dom = await page.evaluate(() => {
    const box = document.getElementById("frameBox").getBoundingClientRect();
    const panel = document.getElementById("stopPanel").getBoundingClientRect();
    const fill = document.querySelector(".stop-panel__fill");
    const img = document.getElementById("stopFrameArt");
    return {
      boxW: box.width, boxH: box.height,
      x: panel.left - box.left, y: panel.top - box.top, w: panel.width, h: panel.height,
      fillAlpha: /^rgb\(/.test(getComputedStyle(fill).backgroundColor) ? 1 : parseFloat((getComputedStyle(fill).backgroundColor.match(/,\s*([\d.]+)\)$/) || [0, 0])[1]),
      img: { complete: img.complete, natural: img.naturalWidth + "x" + img.naturalHeight }
    };
  });
  await page.evaluate(() => {
    for (const sel of ["#frameCanvas", ".invite-control", ".stop-ornaments", ".wording-stop"]) document.querySelectorAll(sel).forEach((el) => (el.style.visibility = "hidden"));
  });
  await page.waitForTimeout(120);
  const png = await page.locator("#frameBox").screenshot();
  await page.evaluate(() => {
    for (const sel of ["#frameCanvas", ".invite-control", ".stop-ornaments", ".wording-stop"]) document.querySelectorAll(sel).forEach((el) => (el.style.visibility = ""));
  });
  const px = await analyzePng(
    page,
    png,
    `
    const bg = Math.min(lum(1, 1), lum(w - 2, h - 2));
    const sx = w / arg.boxW, sy = h / arg.boxH;
    const at = (fx, fy) => [Math.round((arg.x + fx * arg.w) * sx), Math.round((arg.y + fy * arg.h) * sy)];
    const mean = (fx, fy, r) => { const [cx, cy] = at(fx, fy); let t = 0, n = 0;
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { t += lum(x, y); n++; } return t / n; };
    // Opaque paper #f7f0e3 has luminance ~240.5; at 100% opacity the centre
    // reads as the paper itself over the dark test background (ratio ~1).
    const centreAlpha = (mean(0.5, 0.5, 6) - bg) / (240.5 - bg);
    const [cx, cy] = at(0.5, 0.5); const [r, , b] = rgb(cx, cy);
    // The artwork's transparent exterior margin, plus the arch spandrels
    // between the cusped arch and the top bar (clear in both artwork and
    // fill mask), must stay empty.
    const margin = [[0.03, 0.5], [0.97, 0.5], [0.3, 0.02], [0.7, 0.02], [0.3, 0.985], [0.7, 0.985], [0.3, 0.075], [0.7, 0.075], [0.25, 0.1], [0.75, 0.1]]
      .map(([fx, fy]) => mean(fx, fy, 1) - bg);
    // Box area just outside the panel, where there is room for it.
    let outside = 0; const top = Math.floor(arg.y * sy), bottom = Math.ceil((arg.y + arg.h) * sy);
    for (let x = 2; x < w - 2; x += 3) {
      if (top > 4) outside = Math.max(outside, lum(x, top - 3) - bg);
      if (h - bottom > 4) outside = Math.max(outside, lum(x, bottom + 3) - bg);
    }
    return { bg, centreAlpha, warm: r - b, marginMax: Math.max(...margin), outside };
  `,
    dom
  );
  return { ...dom, ...px, ratio: dom.w / dom.h, fracW: dom.w / dom.boxW, fracH: dom.h / dom.boxH };
}

// Artwork ratio preserved; fits inside 90% x 90% of the invitation and
// reaches 90% on its limiting side; 85% fill confirmed in pixels; nothing
// drawn in the artwork's transparent margin, its arch spandrels or outside the panel.
function panelOk(m) {
  return Math.abs(m.ratio - FRAME_RATIO) < 0.004 && m.fracW <= 0.905 && m.fracH <= 0.905 &&
    Math.max(m.fracW, m.fracH) >= 0.895 && m.fillAlpha === 1 && Math.abs(m.centreAlpha - 1) < 0.03 &&
    m.warm >= 3 && m.marginMax < 4 && m.outside < 4 && m.img.complete && m.img.natural === "941x1672";
}

function describePanel(m) {
  return `panel ${m.w.toFixed(0)}x${m.h.toFixed(0)}px = ${(m.fracW * 100).toFixed(1)}% x ${(m.fracH * 100).toFixed(1)}% of ${m.boxW.toFixed(0)}x${m.boxH.toFixed(0)} box; ` +
    `ratio=${m.ratio.toFixed(4)} fill=${m.fillAlpha} centreAlpha=${m.centreAlpha.toFixed(3)} marginMax=${m.marginMax.toFixed(1)} outside=${m.outside.toFixed(1)} img=${m.img.natural}`;
}

async function measureFinale(page) {
  await page.evaluate(() => document.querySelectorAll(".invite-control, .wording-stop").forEach((el) => (el.style.visibility = "hidden")));
  await page.waitForTimeout(120);
  const png = await page.locator("#frameBox").screenshot();
  await page.evaluate(() => document.querySelectorAll(".invite-control, .wording-stop").forEach((el) => (el.style.visibility = "")));
  return analyzePng(
    page,
    png,
    `
    let min = 255;
    // 2px inset: the element screenshot can include a sub-pixel seam of
    // the dark pillarbox at fractional box widths.
    for (let y = 2; y < h - 2; y += Math.max(1, Math.floor(h / 64)))
      for (let x = 2; x < w - 2; x += Math.max(1, Math.floor(w / 36))) min = Math.min(min, lum(x, y));
    for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) min = Math.min(min, lum(x, y));
    const [r, g, b] = rgb(Math.floor(w / 2), Math.floor(h / 2));
    return { min, warm: r - b };
  `
  );
}

// Every rAF sample taken while the palace was between stops must show
// no surface at all; consecutive samples must never jump in opacity.
function analyzeOverlaySamples(samples, maxJump) {
  const stops = new Set(CHAPTERS);
  let travelLeaks = 0;
  let travelSamples = 0;
  let worstJump = 0;
  for (let i = 0; i < samples.length; i++) {
    const [frame, surface, panel, finale] = samples[i];
    const ornMax = samples[i][6] || 0;
    const wordMax = samples[i][9] || 0;
    if (frame > 1 && !stops.has(frame)) {
      travelSamples++;
      if (surface !== "none" || panel > 0.02 || finale > 0.02 || ornMax > 0.02 || wordMax > 0.02) travelLeaks++;
    }
    if (i > 0) {
      worstJump = Math.max(worstJump, Math.abs(panel - samples[i - 1][2]), Math.abs(finale - samples[i - 1][3]));
    }
  }
  return { travelLeaks, travelSamples, worstJump, ok: worstJump <= maxJump };
}

// Approved journey pace: real-time frames/30fps with gentleEase, measured
// at ~3.5s per 80-frame leg and ~2.7s for the 60-frame finale leg. A
// slower or faster background journey fails here.
function journeyPaceCheck(label, log) {
  const frames = log.length;
  const spanMs = log[frames - 1][1] - log[0][1];
  const range = frames > 70 ? [3000, 4200] : [2200, 3300];
  check(
    `${label}: approved journey pace (~${frames > 70 ? "3.5" : "2.7"}s)`,
    spanMs >= range[0] && spanMs <= range[1],
    `${(spanMs / 1000).toFixed(2)}s for ${frames} frames`
  );
}

// From the rAF samples: how long each panel entrance takes to reach full
// opacity, and how long after a departure starts (surface -> none) the
// first frame actually moves.
function analyzePanelTiming(samples) {
  const enters = [], exits = [];
  for (let i = 1; i < samples.length; i++) {
    const [frame, surface, , , t] = samples[i];
    const prev = samples[i - 1][1];
    if (surface === "panel" && prev === "none") {
      for (let j = i; j < samples.length; j++) if (samples[j][2] >= 0.999) { enters.push(samples[j][4] - t); break; }
    }
    if (surface === "none" && prev === "panel") {
      for (let j = i; j < samples.length; j++) if (samples[j][0] !== frame) { exits.push(samples[j][4] - samples[i - 1][4]); break; }
    }
  }
  return { enters, exits };
}


// ---------------- Layer 4 wording placement helpers ----------------

const L4 = (() => {
  const window = {};
  new Function("window", fs.readFileSync(path.join(DIR, "layer4-content.js"), "utf8"))(window);
  return window.IVORY_LAYER4_CONTENT;
})();

// Geometry of every Layer 4 zone (hidden groups are still laid out), as
// px deviations from the specified % of the invitation box.
async function layer4Geometry(page) {
  return page.evaluate(() => {
    const box = document.getElementById("frameBox").getBoundingClientRect();
    return [...document.querySelectorAll(".wording-zone")].map((z) => {
      const r = z.getBoundingClientRect();
      const m = z.querySelector(".wording-motion");
      const mr = m ? m.getBoundingClientRect() : null;
      return {
        id: z.id, kind: z.dataset.kind,
        top: r.top - box.top, left: r.left - box.left, w: r.width, h: r.height, boxW: box.width, boxH: box.height,
        centreDev: Math.abs(r.left + r.width / 2 - (box.left + box.width / 2)),
        inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5,
        text: z.textContent, children: z.childElementCount, imgSrc: z.querySelector("img") ? z.querySelector("img").getAttribute("src") : null,
        contentH: m ? m.scrollHeight : 0, contentW: m ? Math.max(...[...m.children].map((c) => c.scrollWidth), 0) : 0,
        motionCentreDev: mr ? Math.abs(mr.left + mr.width / 2 - (r.left + r.width / 2)) : 0
      };
    });
  });
}

function layer4GeometryProblems(geo) {
  const problems = [];
  for (const z of L4.zones) {
    const g = geo.find((x) => x.id === z.id);
    if (!g) { problems.push(`${z.id} missing`); continue; }
    if (z.kind === "component") {
      const w = Math.min(0.94 * g.boxW, Math.max((z.width / 100) * g.boxW, 272)); // min(94%, max(76%, 272px))
      if (Math.abs(g.top - (z.top / 100) * g.boxH) > 0.75 || Math.abs(g.w - w) > 0.75) problems.push(`${z.id} box off spec`);
      if (g.centreDev > 0.5) problems.push(`${z.id} not centred (${g.centreDev.toFixed(2)}px)`);
      if (!g.inside) problems.push(`${z.id} outside the invitation`);
      continue;
    }
    if (z.kind === "symbol") {
      if (g.centreDev > 0.5) problems.push(`${z.id} not centred (${g.centreDev.toFixed(2)}px)`);
      if (!g.inside) problems.push(`${z.id} outside the invitation`);
      continue;
    }
    const w = z.widthCss ? Math.min(280, Math.max(144, (z.width / 100) * g.boxW)) : (z.width / 100) * g.boxW; // clamp(144px, 46%, 280px)
    const want = { top: (z.top / 100) * g.boxH, w, h: (z.height / 100) * g.boxH };
    if (Math.abs(g.top - want.top) > 0.75 || Math.abs(g.w - want.w) > 0.75 || Math.abs(g.h - want.h) > 0.75) problems.push(`${z.id} box off spec`);
    if (g.centreDev > 0.5) problems.push(`${z.id} not centred (${g.centreDev.toFixed(2)}px)`);
    if (!g.inside) problems.push(`${z.id} outside the invitation`);
    if (z.kind === "slot" && (g.text.trim() !== "" || g.children !== 0)) problems.push(`${z.id} slot not empty`);
    if (z.kind === "ornament" && (g.text.trim() !== "" || !g.imgSrc || !g.imgSrc.endsWith(z.image.src))) problems.push(`${z.id} enclosure image missing or wrong`);
  }
  return problems;
}

// Zones whose provisional text does not fit its specified box (reported,
// not failed: typography is not decided yet).
function layer4Overflow(geo) {
  return geo.filter((g) => g.kind === "text" && (g.contentH > g.h + 1 || g.contentW > g.w + 1))
    .map((g) => `${g.id}${g.contentW > g.w + 1 ? " (wider)" : ""}${g.contentH > g.h + 1 ? ` (${g.contentH.toFixed(0)}/${g.h.toFixed(0)}px tall)` : ""}`);
}

// Layer 4 sequencing from rAF samples ([9] wording max opacity, [10]
// active group, [11] per-group opacity).
function analyzeLayer4Sequence(samples) {
  const r = { arrivals: 0, earlyStarts: [], lateExits: [], wrongStop: 0 };
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i], p = samples[i - 1];
    const idx = CHAPTERS.indexOf(s[0]);
    if (s[9] > 0.01) {
      const visibleGroups = (s[11] || []).map((v, k) => [v, k]).filter(([v]) => v > 0.01).map(([, k]) => k);
      if (visibleGroups.some((k) => k !== idx)) r.wrongStop++;
    }
    if (p[9] <= 0.01 && s[9] > 0.01) {
      r.arrivals++;
      const layer23Settled = s[0] === 300 ? s[3] >= 0.995 : s[6] >= 0.995;
      if (!layer23Settled) r.earlyStarts.push(s[0]);
    }
    // Leaving: Layer 3 starts exiting (ornaments attr -> none) or the finale
    // light starts fading; wording must already be fully clear.
    const ornLeaving = p[5] !== "none" && s[5] === "none";
    const finaleLeaving = p[1] === "finale" && s[1] !== "finale";
    if ((ornLeaving || finaleLeaving) && s[9] > 0.01) r.lateExits.push(s[0]);
  }
  return r;
}


// Symbol measurements with every Layer 4 motion wrapper at its rest
// position (transitions disabled while probing, then restored).
async function measureSymbols(page) {
  return page.evaluate(() => {
    const motions = [...document.querySelectorAll(".wording-motion")];
    const saved = motions.map((m) => [m.style.transition, m.style.transform]);
    motions.forEach((m) => { m.style.transition = "none"; m.style.transform = "none"; });
    document.body.getBoundingClientRect();
    const box = document.getElementById("frameBox").getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const textBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const drawn = (img) => { const r = img.getBoundingClientRect(), s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight); return { w: img.naturalWidth * s, h: img.naturalHeight * s, r, s }; };
    const sacred = ["haldi-sacred-opening", "wedding-sacred-opening"].map((id) => {
      const z = document.getElementById(id), zr = z.getBoundingClientRect(), img = z.querySelector(".sacred-opening__ganesha"), d = drawn(img), m = textBox(z.querySelector(".sacred-opening__mantra"));
      const title = document.getElementById(id.replace("sacred-opening", "title")), t = textBox(title);
      return { id, ganesha: `${d.w.toFixed(0)}x${d.h.toFixed(0)}`, centred: Math.abs(d.r.left + d.r.width / 2 - cx) < 0.5, above: d.r.bottom <= m.top + 0.5,
        inside: d.r.top >= zr.top + 0.5 && m.bottom <= zr.bottom - 0.5, clearOfTitle: m.bottom <= t.top, ratio: Math.abs(d.w / d.h - img.naturalWidth / img.naturalHeight) < 0.01, smallerThanTitle: d.h < t.height * 1.6 };
    });
    const knotImg = document.querySelector(".wedding-nuptial-knot"), kd = drawn(knotImg);
    const bride = textBox(document.getElementById("wedding-bride-name")), groom = textBox(document.getElementById("wedding-groom-name"));
    const kTop = kd.r.top + (kd.r.height - kd.h) / 2, kBottom = kTop + kd.h;
    const knot = { size: `${kd.w.toFixed(0)}x${kd.h.toFixed(0)}`, centreDev: Math.abs(kd.r.left + kd.r.width / 2 - cx), gapAbove: kTop - bride.bottom, gapBelow: groom.top - kBottom,
      smaller: kd.h < bride.height && kd.h < groom.height, ratio: Math.abs(kd.w / kd.h - knotImg.naturalWidth / knotImg.naturalHeight) < 0.01,
      inGroup: !!knotImg.closest(".wedding-couple-names") && !knotImg.closest("#wedding-bride-name") && !knotImg.closest("#wedding-groom-name") };
    const enc = ["closing-enclosure-top", "closing-enclosure-bottom"].map((id) => {
      const img = document.getElementById(id).querySelector("img"), d = drawn(img);
      return { id, src: img.getAttribute("src"), box: `${d.r.width.toFixed(1)}x${d.r.height.toFixed(1)}`, art: `${d.w.toFixed(0)}x${d.h.toFixed(0)}`, scale: d.s, centreDev: Math.abs(d.r.left + d.r.width / 2 - cx), top: d.r.top, bottom: d.r.bottom, boxW: d.r.width };
    });
    const closingTop = document.getElementById("closing-appreciation").getBoundingClientRect().top, closingBottom = document.getElementById("closing-family").getBoundingClientRect().bottom;
    motions.forEach((m, i) => { m.style.transform = saved[i][1]; });
    document.body.getBoundingClientRect();
    motions.forEach((m, i) => { m.style.transition = saved[i][0]; });
    return { sacred, knot, enc, encOrder: enc[0].bottom <= closingTop && enc[1].top >= closingBottom, overflowX: document.documentElement.scrollWidth > innerWidth };
  });
}

function symbolProblems(m) {
  const p = [];
  for (const s of m.sacred) if (!(s.centred && s.above && s.inside && s.clearOfTitle && s.ratio && s.smallerThanTitle)) p.push(`${s.id} ${JSON.stringify(s)}`);
  const k = m.knot;
  if (!(k.centreDev < 0.5 && k.gapAbove >= 2 && k.gapBelow >= 2 && k.smaller && k.ratio && k.inGroup)) p.push(`knot ${JSON.stringify(k)}`);
  const [u, l] = m.enc;
  if (!u.src.endsWith("enclosure-e2-upper.png") || !l.src.endsWith("enclosure-e2-lower.png")) p.push("enclosure mapping");
  if (u.centreDev > 0.5 || l.centreDev > 0.5 || Math.abs(u.boxW - l.boxW) > 0.5 || Math.abs(u.scale / l.scale - 1) > 0.01 || !m.encOrder) p.push(`enclosures ${JSON.stringify(m.enc)} order=${m.encOrder}`);
  if (m.overflowX) p.push("horizontal overflow");
  return p;
}


// Visual-refinement pass: opacity of the paper (palace never visible
// through it), texture clipping, and the right-side control rail.
async function paperAndRail(page) {
  const box = await page.evaluate(() => { const r = document.getElementById("frameBox").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const hide = (sel, v) => page.evaluate(({ sel, v }) => document.querySelectorAll(sel).forEach((e) => (e.style.visibility = v)), { sel, v });
  await hide(".wording-stop, .stop-ornaments, .invite-controls", "hidden");
  await page.waitForTimeout(80);
  const withCanvas = await page.screenshot({ clip: box });
  await hide("#frameCanvas", "hidden");
  await page.waitForTimeout(80);
  const noCanvas = await page.screenshot({ clip: box });
  await hide(".stop-panel__fill", "hidden");
  await page.waitForTimeout(80);
  const noFill = await page.screenshot({ clip: box });
  await hide("#frameCanvas, .stop-panel__fill, .wording-stop, .stop-ornaments, .invite-controls", "");
  const geo = await page.evaluate(() => {
    const b = document.getElementById("frameBox").getBoundingClientRect(), p = document.getElementById("stopPanel").getBoundingClientRect();
    return { px: p.left - b.left, py: p.top - b.top, pw: p.width, ph: p.height };
  });
  const pix = await page.evaluate(async ({ a, b, c, geo }) => {
    const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); const cv = document.createElement("canvas"); cv.width = i.width; cv.height = i.height; const g = cv.getContext("2d"); g.drawImage(i, 0, 0); return { d: g.getImageData(0, 0, i.width, i.height).data, w: i.width, h: i.height }; };
    const A = await load(a), B = await load(b), C = await load(c);
    let inDiff = 0, n = 0;
    // Inside the paper opening (panel 20-80% x 25-80%): canvas on vs off must be identical.
    for (let fy = 0.25; fy <= 0.8; fy += 0.01) for (let fx = 0.2; fx <= 0.8; fx += 0.01) {
      const x = Math.round((geo.px + fx * geo.pw) * (A.w / (geo.px * 2 + geo.pw))), y = Math.round((geo.py + fy * geo.ph) * (A.h / (geo.py * 2 + geo.ph)));
      const i = (y * A.w + x) * 4; inDiff = Math.max(inDiff, Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])); n++;
    }
    // Outside the paper (the artwork's transparent exterior margin): fill on vs off must be identical.
    let outDiff = 0;
    for (const [fx, fy] of [[0.03, 0.5], [0.97, 0.5], [0.3, 0.02], [0.7, 0.02], [0.3, 0.985], [0.7, 0.985], [0.3, 0.075], [0.7, 0.075]]) {
      const x = Math.round((geo.px + fx * geo.pw) * (A.w / (geo.px * 2 + geo.pw))), y = Math.round((geo.py + fy * geo.ph) * (A.h / (geo.py * 2 + geo.ph)));
      const i = (y * B.w + x) * 4; outDiff = Math.max(outDiff, Math.abs(B.d[i] - C.d[i]), Math.abs(B.d[i + 1] - C.d[i + 1]), Math.abs(B.d[i + 2] - C.d[i + 2]));
    }
    // Texture subtlety: spread of the paper's luminance across the opening.
    let lo = 255, hi = 0;
    for (let fy = 0.3; fy <= 0.7; fy += 0.01) for (let fx = 0.3; fx <= 0.7; fx += 0.01) {
      const x = Math.round((geo.px + fx * geo.pw) * (B.w / (geo.px * 2 + geo.pw))), y = Math.round((geo.py + fy * geo.ph) * (B.h / (geo.py * 2 + geo.ph))), i = (y * B.w + x) * 4;
      const l = 0.2126 * B.d[i] + 0.7152 * B.d[i + 1] + 0.0722 * B.d[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l);
    }
    return { inDiff, samples: n, outDiff, lumRange: hi - lo, lumMin: lo };
  }, { a: withCanvas.toString("base64"), b: noCanvas.toString("base64"), c: noFill.toString("base64"), geo });
  const rail = await page.evaluate(() => {
    const b = document.getElementById("frameBox").getBoundingClientRect();
    const [u, d] = ["navUp", "navDown"].map((id) => document.getElementById(id).getBoundingClientRect());
    const hit = (el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h); };
    const cs = getComputedStyle(document.getElementById("navUp"));
    return { up: [u.left - b.left, u.top - b.top, u.width, u.height], down: [d.left - b.left, d.top - b.top, d.width, d.height],
      sameAxis: Math.abs(u.left + u.width / 2 - (d.left + d.width / 2)) < 0.5, upAbove: u.bottom <= d.top, rightSide: u.left > b.left + b.width * 0.6,
      inside: [u, d].every((r) => r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom),
      minSize: Math.min(u.width, u.height, d.width, d.height), wholeOpacity: cs.opacity, bg: cs.backgroundColor,
      utilities: (() => {
        const bs = [...document.querySelectorAll(".invite-controls__utilities .invite-control")].map((x) => x.getBoundingClientRect());
        return { count: bs.length, row: bs.every((r) => Math.abs(r.top - bs[0].top) < 0.5), upperRight: bs.every((r) => r.top < b.top + b.height * 0.12 && r.left > b.left + b.width * 0.45),
          inside: bs.every((r) => r.left >= b.left && r.right <= b.right && r.top >= b.top), min: Math.min(...bs.map((r) => Math.min(r.width, r.height))),
          first: bs[0] ? [bs[0].left - b.left, bs[0].top - b.top, bs[0].width] : null, last: bs[2] ? [bs[2].left - b.left, bs[2].top - b.top] : null };
      })(),
      hitUp: document.getElementById("navUp").classList.contains("is-visible") ? hit(document.getElementById("navUp")) : null,
      hitDown: document.getElementById("navDown").classList.contains("is-visible") ? hit(document.getElementById("navDown")) : null,
      overflowX: document.documentElement.scrollWidth > innerWidth };
  });
  return { pix, rail };
}

function paperRailProblems(r) {
  const p = [];
  if (r.pix.inDiff !== 0) p.push(`palace shows through the paper (max diff ${r.pix.inDiff})`);
  if (r.pix.outDiff > 1) p.push(`texture/paper escapes the opening (diff ${r.pix.outDiff})`);
  if (r.pix.lumRange > 14) p.push(`texture too strong (luminance range ${r.pix.lumRange.toFixed(1)})`);
  const q = r.rail;
  const u = q.utilities;
  if (!(q.sameAxis && q.upAbove && q.rightSide && q.inside && q.minSize >= 44 && !q.overflowX)) p.push(`rail ${JSON.stringify(q)}`);
  if (!(u.count === 3 && u.row && u.upperRight && u.inside && u.min >= 44)) p.push(`utilities ${JSON.stringify(u)}`);
  if (q.hitUp === false || q.hitDown === false) p.push("visible control not clickable");
  return p;
}

async function wordingLayerChecks(page, label) {
  const layer = await page.evaluate(() => {
    const el = document.getElementById("stopContent");
    return el && { hidden: el.hidden, inert: el.inert, text: el.textContent, children: el.childElementCount, display: getComputedStyle(el).display };
  });
  check(
    `${label}: reserved wording layer exists, empty, hidden and inert`,
    !!layer && layer.hidden && layer.inert && layer.text.trim() === "" && layer.children === 0 && layer.display === "none",
    JSON.stringify(layer)
  );
  const catalogue = JSON.parse(fs.readFileSync(path.join(DIR, "wording", "catalogue.json"), "utf8"));
  const texts = Object.values(catalogue.approvedCollections).flatMap((c) => c.items.map((x) => x.text)).filter(Boolean);
  // Layer 4 (placement checkpoint) shows wording only inside #wordingLayer.
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    const wl = clone.querySelector("#wordingLayer");
    if (wl) wl.remove();
    return clone.outerHTML;
  });
  const shown = texts.filter((t) => html.includes(t));
  check(`${label}: catalogue wording appears only inside the Layer 4 wording layer (${texts.length} items checked)`, shown.length === 0, JSON.stringify(shown.slice(0, 3)));
  const focusEscapes = await page.evaluate(() => {
    const el = document.getElementById("stopContent");
    return [...document.querySelectorAll("*")].filter((n) => el.contains(n) && n.tabIndex >= 0).length;
  });
  check(`${label}: wording layer exposes no focus targets`, focusEscapes === 0);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();

  try {
    // ---------------- Desktop: full forward + reverse journey ----------------
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript(installOverlaySampler);
    await page.goto(BASE_URL, { waitUntil: "load" });

    const getFrame = () =>
      page.evaluate(() =>
        window.__frameLog.length ? window.__frameLog[window.__frameLog.length - 1][0] : null
      );

    let maxCacheMB = 0;
    let maxCachedFrames = 0;
    const sampleCache = async () => {
      const stats = await page.evaluate(() => window.__cacheStats());
      maxCacheMB = Math.max(maxCacheMB, stats.estimatedMB);
      maxCachedFrames = Math.max(maxCachedFrames, stats.cachedFrames);
      return stats;
    };

    // At rest on a stop: correct surface fully in, the other fully out,
    // and the visible controls still receive pointer hits.
    const restChecks = async (frame, label) => {
      const o = await waitSurface(page, frame);
      if (frame === 300) {
        check(`${label}: frame 300 rests on full-box finale light, not the framed panel`, o.surface === "finale" && o.finaleOpacity >= 0.995 && o.panelOpacity <= 0.005, JSON.stringify(o));
      } else {
        check(`${label}: framed panel fully visible at rest on ${frame}`, o.surface === "panel" && o.panelOpacity >= 0.995 && o.finaleOpacity <= 0.005, JSON.stringify(o));
      }
      const stopIndex = String(CHAPTERS.indexOf(frame));
      const shown = o.ornamentStates.filter((s) => s[2] > 0.01);
      const want = frame === 300 ? [] : o.ornamentStates.filter((s) => s[0] === stopIndex);
      check(
        frame === 300 ? `${label}: no ornaments at frame 300` : `${label}: only the stop-${frame} ornament pair is shown, fully in place`,
        frame === 300
          ? shown.length === 0 && o.ornaments === "none"
          : o.ornaments === stopIndex && shown.length === 2 && want.every((s) => s[2] >= 0.995 && Math.abs(translateXOf(s[3])) < 0.5),
        JSON.stringify(o.ornamentStates.map((s) => [s[0], s[1], +s[2].toFixed(3), s[3]]))
      );
      if (frame !== 300 && !label.startsWith("reverse")) {
        const pl = await ornamentPlacementProblems(page, stopIndex);
        check(`${label}: approved ornament placement at ${frame} (visible art from ~57-60% to bottom, outer corners, own side, control on top)`, pl.problems.length === 0,
          pl.problems.join("; ") || ["left", "right"].map((sd) => `${sd} x ${pl.art[sd].l.toFixed(1)}-${pl.art[sd].r.toFixed(1)}% top ${pl.art[sd].t.toFixed(1)}%`).join(" | "));
      }
      const l4 = await page.evaluate((idx) => {
        const st = window.IvoryLayer4.state();
        const motions = [...document.querySelectorAll(`.wording-stop[data-stop="${idx}"] .wording-motion`)].map((m) => getComputedStyle(m).transform);
        return { st, motions };
      }, Number(stopIndex));
      const expectedZones = L4.zones.filter((z) => z.stop === frame && z.kind !== "slot").length;
      check(
        `${label}: Layer 4 shows only the stop-${frame} wording (${expectedZones} zones), fully in and at rest`,
        l4.st.active === Number(stopIndex) && l4.st.groups.every((g, k) => (k === Number(stopIndex) ? g[0] === "in" && g[1] >= 0.995 : g[0] === "hidden" && g[1] === 0)) &&
          l4.motions.length === expectedZones && l4.motions.every((t) => t === "none" || Math.abs(translateXOf(t)) < 0.5 && Math.abs(parseFloat((/matrix\(([^)]+)\)/.exec(t) || [0, "0,0,0,0,0,0"])[1].split(",")[5])) < 0.5),
        JSON.stringify(l4.st) + " " + JSON.stringify(l4.motions)
      );
      if (frame === 160 || frame === 240) {
        const g = await page.evaluate((idx) => {
          const z = document.querySelector(`.wording-stop[data-stop="${idx}"] .sacred-opening`).parentElement, zr = z.getBoundingClientRect();
          const img = z.querySelector(".sacred-opening__ganesha"), ir = img.getBoundingClientRect(), mr = z.querySelector(".sacred-opening__mantra").getBoundingClientRect();
          const sc = Math.min(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
          return { decoded: img.complete && img.naturalWidth > 0, centreDev: Math.abs(ir.left + ir.width / 2 - (zr.left + zr.width / 2)), above: ir.bottom <= mr.top + 0.5,
            inside: ir.top >= zr.top - 0.5 && mr.bottom <= zr.bottom + 0.5, ratio: Math.abs((img.naturalWidth * sc) / (img.naturalHeight * sc) - img.naturalWidth / img.naturalHeight) < 0.01,
            maxH: ir.height <= zr.height * 0.52 + 0.5, opacity: parseFloat(getComputedStyle(img.parentElement).opacity) };
        }, Number(stopIndex));
        check(`${label}: Ganesha centred above the mantra inside the sacred opening at ${frame}, ratio kept, ≤52% of the zone`,
          g.decoded && g.centreDev < 0.5 && g.above && g.inside && g.ratio && g.maxH && g.opacity >= 0.995, JSON.stringify(g));
      }
      const up = frame !== 80, down = frame !== 300;
      check(`${label}: navigation controls remain interactive above the surface at ${frame}`, (!up || (await navHit(page, "navUp"))) && (!down || (await navHit(page, "navDown"))));
    };

    // Opening
    let landed = await waitSettle(page, getFrame, CHAPTERS[0], 6000);
    let log = await page.evaluate(() => window.__frameLog);
    let a = analyzeFrameLog(log);
    check("opening lands on frame 80", landed && a.frames[a.frames.length - 1] === 80);
    check("opening has zero skipped frames", a.skips.length === 0, JSON.stringify(a.skips));
    check("opening never exceeds ~30fps", a.minGap >= 30, `minGap=${a.minGap.toFixed(2)}ms`);
    await sampleCache();
    await restChecks(80, "opening");

    // Forward through every chapter
    const forwardTrigger = ["click", "keyboard", "wheel"];
    for (let i = 1; i < CHAPTERS.length; i++) {
      await page.evaluate(() => {
        window.__frameLog = [];
      });
      const trigger = forwardTrigger[(i - 1) % forwardTrigger.length];
      if (trigger === "click") await page.click("#navDown");
      else if (trigger === "keyboard") await page.keyboard.press("ArrowDown");
      else {
        await page.mouse.move(720, 450);
        await page.mouse.wheel(0, 100);
      }
      landed = await waitSettle(page, getFrame, CHAPTERS[i], 9000);
      log = await page.evaluate(() => window.__frameLog);
      a = analyzeFrameLog(log);
      check(
        `chapter ${CHAPTERS[i - 1]}->${CHAPTERS[i]} lands exactly (via ${trigger})`,
        landed && a.frames[a.frames.length - 1] === CHAPTERS[i]
      );
      check(`chapter ${CHAPTERS[i - 1]}->${CHAPTERS[i]} has zero skips`, a.skips.length === 0);
      check(
        `chapter ${CHAPTERS[i - 1]}->${CHAPTERS[i]} never exceeds ~30fps`,
        a.minGap >= 30,
        `minGap=${a.minGap.toFixed(2)}ms`
      );
      journeyPaceCheck(`chapter ${CHAPTERS[i - 1]}->${CHAPTERS[i]}`, log);
      await sampleCache();
      await restChecks(CHAPTERS[i], `forward ${CHAPTERS[i]}`);
    }

    const finaleNav = await page.evaluate(() => { const u = document.getElementById("navUp"), d = document.getElementById("navDown"); return { upEnabled: !u.disabled && u.classList.contains("is-visible"), downShownDisabled: d.disabled && d.classList.contains("is-visible") }; });
    check("at Finale: Previous enabled; Next visible, subdued and disabled", finaleNav.upEnabled && finaleNav.downShownDisabled, JSON.stringify(finaleNav));

    // Reverse back to Welcome
    for (let i = CHAPTERS.length - 1; i > 0; i--) {
      await page.evaluate(() => {
        window.__frameLog = [];
      });
      await page.keyboard.press("ArrowUp");
      landed = await waitSettle(page, getFrame, CHAPTERS[i - 1], 9000);
      log = await page.evaluate(() => window.__frameLog);
      a = analyzeFrameLog(log);
      check(
        `reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]} lands exactly`,
        landed && a.frames[a.frames.length - 1] === CHAPTERS[i - 1]
      );
      check(`reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]} has zero skips`, a.skips.length === 0);
      check(`reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]} never exceeds ~30fps`, a.minGap >= 30, `minGap=${a.minGap.toFixed(2)}ms`);
      journeyPaceCheck(`reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]}`, log);
      await sampleCache();
      await restChecks(CHAPTERS[i - 1], `reverse ${CHAPTERS[i - 1]}`);
    }

    const welcomeNav = await page.evaluate(() => { const u = document.getElementById("navUp"), d = document.getElementById("navDown"); return { upShownDisabled: u.disabled && u.classList.contains("is-visible"), downEnabled: !d.disabled && d.classList.contains("is-visible") }; });
    check("at Welcome: Previous visible and disabled; Next enabled", welcomeNav.upShownDisabled && welcomeNav.downEnabled, JSON.stringify(welcomeNav));
    check("decoded-frame cache stays under the 150MB budget", maxCacheMB <= MEMORY_BUDGET_MB, `peak=${maxCacheMB.toFixed(1)}MB`);
    check("decoded-frame cache never exceeds its 36-frame cap", maxCachedFrames <= MAX_CACHED_FRAMES, `peak=${maxCachedFrames} frames`);
    const source = fs.readFileSync(path.join(DIR, "script.js"), "utf8");
    check(
      "cache constants and stop frames unchanged in script.js",
      /MAX_CACHED_FRAMES = 36;/.test(source) && /WINDOW_AHEAD_MOVING = 20;/.test(source) && /WINDOW_BEHIND_MOVING = 10;/.test(source) &&
        /WINDOW_RADIUS_IDLE = 16;/.test(source) && /frame: 80,[^}]*Welcome[\s\S]*frame: 160,[\s\S]*frame: 240,[\s\S]*frame: 300,/.test(source)
    );

    let samples = await page.evaluate(() => window.__overlaySamples);
    const timing = analyzePanelTiming(samples);
    check(
      `panel fade-in takes ~1.4s at every stop (${timing.enters.length} entrances)`,
      timing.enters.length >= 6 && timing.enters.every((t) => t >= 1250 && t <= 1700),
      timing.enters.map((t) => t.toFixed(0) + "ms").join(", ")
    );
    check(
      `frames move only after the ~1s fade-out completes (${timing.exits.length} departures)`,
      timing.exits.length >= 5 && timing.exits.every((t) => t >= 1000 && t <= 1300),
      timing.exits.map((t) => t.toFixed(0) + "ms").join(", ")
    );
    const l4seq = analyzeLayer4Sequence(samples);
    check(`Layer 4 enters only after Layers 2-3 settle (${l4seq.arrivals} arrivals)`, l4seq.arrivals >= 7 && l4seq.earlyStarts.length === 0, JSON.stringify(l4seq.earlyStarts));
    check("Layer 4 clears before Layer 3 / the finale light start to exit", l4seq.lateExits.length === 0, JSON.stringify(l4seq.lateExits));
    check("Layer 4 never shows another stop's wording", l4seq.wrongStop === 0, `wrongStop=${l4seq.wrongStop}`);
    const dsym = symbolProblems(await measureSymbols(page));
    check("desktop: symbols placed (Ganesha/mantra, knot between names, enclosures)", dsym.length === 0, dsym.join("; "));
    const l4geo = await layer4Geometry(page);
    const l4problems = layer4GeometryProblems(l4geo);
    check(`desktop: all ${L4.zones.length} Layer 4 zones centred at 50% with the specified top/width/height; slots empty`, l4problems.length === 0, l4problems.join("; "));
    const l4layers = await page.evaluate(() => {
      const z = (el) => Number(getComputedStyle(el).zIndex);
      return { wording: z(document.getElementById("wordingLayer")), stopLayer: z(document.getElementById("stopPanel")), finale: z(document.getElementById("finaleLight")), nav: z(document.getElementById("navDown").closest(".invite-controls")), pointer: getComputedStyle(document.getElementById("wordingLayer")).pointerEvents };
    });
    check("Layer 4 above Layer 3 (and the finale light), below the controls; never intercepts input", l4layers.wording > l4layers.stopLayer && l4layers.wording > l4layers.finale && l4layers.nav > l4layers.wording && l4layers.pointer === "none", JSON.stringify(l4layers));
    const seq = analyzeOrnamentSequence(samples);
    check(
      `ornaments enter only after the panel has settled (${seq.arrivals.length} arrivals)`,
      seq.arrivals.length >= 6 && seq.arrivals.every((a) => a.panelSettledBeforeOrnaments),
      JSON.stringify(seq.arrivals.map((a) => a.stop))
    );
    check(
      `ornament entrance takes ~1.2–1.4s to come fully to rest (${seq.arrivals.length} arrivals)`,
      seq.arrivals.every((a) => a.enterMs !== null && a.enterMs >= 1100 && a.enterMs <= 1500),
      seq.arrivals.map((a) => a.enterMs && a.enterMs.toFixed(0) + "ms").join(", ")
    );
    check(
      `ornaments clear (~0.9s) before the panel starts its exit (${seq.departures.length} departures)`,
      seq.departures.length >= 5 && seq.departures.every((d) => d.ornamentsClearedBeforePanel && d.exitMs >= 750 && d.exitMs <= 1050),
      seq.departures.map((d) => `exit ${d.exitMs.toFixed(0)}ms, panel +${d.panelStartsAfterMs.toFixed(0)}ms`).join("; ")
    );
    check(
      "background moves only after both layers have cleared (~0.9s + ~1.0s)",
      seq.departures.every((d) => d.framesMoveAfterMs >= 1900 && d.framesMoveAfterMs <= 2400),
      seq.departures.map((d) => d.framesMoveAfterMs.toFixed(0) + "ms").join(", ")
    );
    check("ornaments never mix stops and slide the right way (left from/to the left, right from/to the right)", seq.mixed === 0 && seq.wrongDirection === 0, `mixed=${seq.mixed} wrongDirection=${seq.wrongDirection}`);
    const cssTiming = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [cs.getPropertyValue("--panel-enter-ms").trim(), cs.getPropertyValue("--panel-exit-ms").trim(), cs.getPropertyValue("--ease-settle").trim(), cs.getPropertyValue("--ease-dissolve").trim().replace(/\s*\/\*.*$/, "")];
    });
    check("panel timings are 1400ms ease-out in / 1000ms ease-in out", cssTiming[0] === "1400ms" && cssTiming[1] === "1000ms", JSON.stringify(cssTiming));
    let ov = analyzeOverlaySamples(samples, 0.2);
    check(`no stop surface visible during frame travel (${ov.travelSamples} travel samples)`, ov.travelSamples > 200 && ov.travelLeaks === 0, `leaks=${ov.travelLeaks}`);
    check("surface opacity never jumps between animation frames", ov.ok, `worst=${ov.worstJump.toFixed(3)}`);
    await wordingLayerChecks(page, "desktop");
    const art = await page.evaluate(() => {
      const img = document.getElementById("stopFrameArt");
      return { src: img.currentSrc, natural: img.naturalWidth + "x" + img.naturalHeight };
    });
    check("page loads the approved arch frame asset", /\/assets\/ivory-palace-arch-frame\.png$/.test(art.src) && art.natural === "941x1672", JSON.stringify(art));

    // ---- Rapid repeated input: at rest, mid-entrance, mid-exit and mid-travel ----
    await page.evaluate(() => { window.__frameLog = []; window.__overlaySamples = []; });
    await page.evaluate(() => {
      for (let k = 0; k < 4; k++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      document.getElementById("navDown").click();
      document.getElementById("navDown").click();
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => { // mid-exit: all ignored
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });
    let o = await waitSurface(page, 160);
    log = await page.evaluate(() => window.__frameLog);
    let maxFrame = Math.max(...log.map((x) => x[0]));
    check("burst of 7 inputs at 80 advances exactly one chapter to 160", o.frame === 160 && o.chapterIndex === 1 && maxFrame === 160 && o.surface === "panel", `max=${maxFrame} ${JSON.stringify(o)}`);

    // Input during the fade-in is ignored: the entrance completes, uninterrupted.
    await page.keyboard.press("ArrowDown");
    const midStart = Date.now();
    let midOpacity = null;
    while (Date.now() - midStart < 9000) {
      const s = await overlay(page);
      if (s.chapterIndex === 2 && s.surface === "panel" && s.panelOpacity > 0.05 && s.panelOpacity < 0.9) { midOpacity = s.panelOpacity; break; }
      await page.waitForTimeout(10);
    }
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => document.getElementById("navUp").click());
    const midNav = await page.evaluate(() => [document.getElementById("navUp").classList.contains("is-visible"), document.getElementById("navDown").classList.contains("is-visible")]);
    o = await waitSurface(page, 240);
    log = await page.evaluate(() => window.__frameLog);
    check(
      "input during the panel fade-in is ignored; the entrance completes at 240",
      midOpacity !== null && !midNav[0] && !midNav[1] && o.frame === 240 && o.chapterIndex === 2 && o.surface === "panel" && o.panelOpacity >= 0.995 && log[log.length - 1][0] === 240,
      `caught at opacity=${midOpacity} navVisible=${midNav} ${JSON.stringify(o)}`
    );
    // After the fade-in settles input works again (240 -> 160), and input
    // while that stop's ornaments are still gliding in is ignored.
    await page.keyboard.press("ArrowUp");
    const ornStart = Date.now();
    let ornCaught = null;
    while (Date.now() - ornStart < 12000) {
      const s = await overlay(page);
      if (s.frame === 160 && s.ornaments === "1") {
        const op = Math.max(...s.ornamentStates.filter((x) => x[0] === "1").map((x) => x[2]));
        if (op > 0.05 && op < 0.9) { ornCaught = op; break; }
      }
      await page.waitForTimeout(10);
    }
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => window.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, cancelable: true })));
    o = await waitSurface(page, 160);
    log = await page.evaluate(() => window.__frameLog);
    check(
      "input works after settling (240 -> 160); input while the ornaments glide in is ignored",
      ornCaught !== null && o.frame === 160 && o.chapterIndex === 1 && o.ornaments === "1" && log[log.length - 1][0] === 160,
      `caught at ornament opacity=${ornCaught} ${JSON.stringify({ frame: o.frame, ornaments: o.ornaments })}`
    );

    // Mid-travel spam toward the finale, then straight back.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(2600); // past the 900ms + 1000ms exits: frames are moving
    for (let k = 0; k < 6; k++) await page.keyboard.press(k % 2 ? "ArrowUp" : "ArrowDown");
    o = await waitSurface(page, 240);
    check("keys pressed mid-travel are ignored; lands on 240 with panel", o.frame === 240 && o.surface === "panel" && o.panelOpacity >= 0.995, JSON.stringify(o));
    await page.evaluate(() => document.getElementById("navDown").click());
    o = await waitSurface(page, 300);
    check("finale reached after rapid-input sequence", o.surface === "finale" && o.finaleOpacity >= 0.995 && o.panelOpacity <= 0.005, JSON.stringify(o));
    const finale = await measureFinale(page);
    check("frame 300 is a complete full-box warm-white field (no palace perimeter)", finale.min >= 225 && finale.warm >= 3, JSON.stringify(finale));
    await page.evaluate(() => document.getElementById("navUp").click());
    await page.evaluate(() => document.getElementById("navUp").click());
    o = await waitSurface(page, 240);
    check("backward from 300 dissolves the light and returns to 240 panel", o.frame === 240 && o.surface === "panel" && o.panelOpacity >= 0.995 && o.finaleOpacity <= 0.005, JSON.stringify(o));
    samples = await page.evaluate(() => window.__overlaySamples);
    ov = analyzeOverlaySamples(samples, 0.2);
    check("rapid-input run: no surface during travel, no opacity jumps", ov.travelLeaks === 0 && ov.ok, `leaks=${ov.travelLeaks} worst=${ov.worstJump.toFixed(3)}`);
    const panelM = await measurePanel(page);
    check(
      "framed panel: artwork ratio kept, 90% of limiting side, 85% ivory fill inside the frame only",
      panelOk(panelM),
      describePanel(panelM)
    );
    check("no page errors on desktop", pageErrors.length === 0, JSON.stringify(pageErrors));

    await ctx.close();

    // ---------------- Flicker check: CDP screencast during one transition ----------------
    const fctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const fpage = await fctx.newPage();
    await fpage.goto(BASE_URL, { waitUntil: "load" });
    await waitSurface(fpage, 80); // opening completes and the panel settles

    const cdp = await fctx.newCDPSession(fpage);
    const shots = [];
    cdp.on("Page.screencastFrame", async (evt) => {
      shots.push(evt.data);
      // A frame can arrive after stopScreencast/context-close races the
      // event loop; the ack is best-effort and failing it is harmless.
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: evt.sessionId });
      } catch {
        /* session already torn down — nothing to ack */
      }
    });
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 300, maxHeight: 534 });
    await fpage.click("#navDown");
    await fpage.waitForTimeout(6200); // ornament exit (900ms) + panel exit (1000ms) + 80-frame travel
    await cdp.send("Page.stopScreencast");
    await fpage.waitForTimeout(150); // let any in-flight screencastFrame settle before closing

    const brightness = shots.map((b64) => pngAvgBrightness(Buffer.from(b64, "base64")));
    const blanks = brightness.filter((v) => v < 5).length;
    check(
      `zero blank/flash frames across ${shots.length} composited frames during a transition`,
      shots.length > 20 && blanks === 0,
      `blanks=${blanks}`
    );
    await fctx.close();

    // ---------------- Mobile: touch swipe forward + reverse ----------------
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mpage = await mctx.newPage();
    const mErrors = [];
    mpage.on("pageerror", (e) => mErrors.push(e.message));
    await mpage.addInitScript(installOverlaySampler);
    await mpage.goto(BASE_URL, { waitUntil: "load" });
    const mGetFrame = () =>
      mpage.evaluate(() =>
        window.__frameLog.length ? window.__frameLog[window.__frameLog.length - 1][0] : null
      );
    const swipe = (fromY, toY) =>
      mpage.evaluate(
        ({ fromY, toY }) => {
          const el = document.querySelector(".stage");
          function fire(type, y) {
            const t = new Touch({ identifier: Date.now() % 100000, target: el, clientX: 195, clientY: y });
            el.dispatchEvent(
              new TouchEvent(type, {
                touches: type === "touchend" ? [] : [t],
                changedTouches: [t],
                bubbles: true,
                cancelable: true
              })
            );
          }
          fire("touchstart", fromY);
          fire("touchmove", (fromY + toY) / 2);
          fire("touchend", toY);
        },
        { fromY, toY }
      );

    landed = await waitSettle(mpage, mGetFrame, 80, 9000);
    check("mobile: opening lands on 80", landed);
    await waitSurface(mpage, 80);
    await swipe(300, 520);
    landed = await waitSettle(mpage, mGetFrame, 160, 9000);
    check("mobile: downward swipe advances to 160", landed);
    await waitSurface(mpage, 160);
    await swipe(520, 300);
    landed = await waitSettle(mpage, mGetFrame, 80, 9000);
    check("mobile: upward swipe returns to 80", landed);
    let mo = await waitSurface(mpage, 80);
    check("mobile: panel returns at 80 after the swipe round trip", mo.surface === "panel" && mo.panelOpacity >= 0.995, JSON.stringify(mo));
    const mOv = analyzeOverlaySamples(await mpage.evaluate(() => window.__overlaySamples), 0.2);
    check("mobile: no surface visible during swipe travel", mOv.travelLeaks === 0 && mOv.travelSamples > 50, `leaks=${mOv.travelLeaks}`);
    check("no page errors on mobile", mErrors.length === 0, JSON.stringify(mErrors));

    await mctx.close();

    // ---------------- Responsive: panel geometry across viewport classes ----------------
    const viewports = [
      ["narrow mobile portrait", 320, 568, true],
      ["small mobile portrait", 360, 640, true],
      ["standard mobile portrait", 390, 844, true],
      ["tall mobile portrait", 360, 800, true],
      ["tall large mobile portrait", 412, 915, true],
      ["large mobile portrait", 430, 932, true],
      ["tablet portrait", 768, 1024, true],
      ["desktop portrait preview", 900, 1400, false],
      ["desktop portrait 1080p", 1080, 1920, false],
      ["desktop landscape", 1440, 900, false]
    ];
    for (const [name, width, height, touch] of viewports) {
      const vctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 700 });
      const vpage = await vctx.newPage();
      const vErrors = [];
      vpage.on("pageerror", (e) => vErrors.push(e.message));
      await vpage.goto(BASE_URL, { waitUntil: "load" });
      const vo = await waitSurface(vpage, 80);
      const layout = await vpage.evaluate(() => {
        const box = document.getElementById("frameBox").getBoundingClientRect();
        const panel = document.getElementById("stopPanel").getBoundingClientRect();
        const de = document.documentElement;
        return {
          overflowX: de.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
          overflowY: de.scrollHeight > window.innerHeight,
          boxW: box.width, boxH: box.height, vw: window.innerWidth, vh: window.innerHeight,
          panelInside: panel.left >= box.left - 0.5 && panel.right <= box.right + 0.5 && panel.top >= box.top - 0.5 && panel.bottom <= box.bottom + 0.5,
          boxInside: box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5
        };
      });
      const hit = await navHit(vpage, "navDown");
      if (SHOTS_DIR) await vpage.screenshot({ path: path.join(SHOTS_DIR, `panel-${width}x${height}.png`) });
      const vgeo = await layer4Geometry(vpage);
      const vl4 = layer4GeometryProblems(vgeo);
      check(`${name} ${width}x${height}: Layer 4 zones centred, on spec and inside the invitation`, vl4.length === 0, vl4.join("; "));
      const pr = await paperAndRail(vpage);
      const prp = paperRailProblems(pr);
      check(`${name} ${width}x${height}: opaque clipped paper; utilities upper right in a row; nav rail stacked middle right; all >=44px, clickable`, prp.length === 0, prp.join("; "));
      console.log(`[INFO] ${name} ${width}x${height}: utilities first@(${pr.rail.utilities.first.map((v) => v.toFixed(0)).join(",")}) last@(${pr.rail.utilities.last.map((v) => v.toFixed(0)).join(",")}); rail up@(${pr.rail.up.map((v) => v.toFixed(0)).join(",")}) down@(${pr.rail.down.map((v) => v.toFixed(0)).join(",")}); paper lum ${pr.pix.lumMin.toFixed(1)}+${pr.pix.lumRange.toFixed(1)}; see-through diff ${pr.pix.inDiff}`);
      const fit = await vpage.evaluate(() => {
        const lines = (id) => { const t = document.getElementById(id).querySelector(".wording-line").firstChild, r = document.createRange(); r.selectNodeContents(t); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
        const over = (id) => { const z = document.getElementById(id), m = z.querySelector(".wording-motion"); return m.scrollHeight - z.getBoundingClientRect().height; };
        return { noteLines: lines("haldi-closing-note"), noteOver: over("haldi-closing-note"), invOver: over("wedding-invitation") };
      });
      check(`${name} ${width}x${height}: Haldi closing note <= 2 lines and fits; wedding invitation fits`, fit.noteLines <= 2 && fit.noteOver <= 1 && fit.invOver <= 1, JSON.stringify(fit));
      const vs = await measureSymbols(vpage);
      const vsp = symbolProblems(vs);
      check(`${name} ${width}x${height}: Ganesha above the mantra, knot between the names, enclosures centred and equal`, vsp.length === 0, vsp.join("; "));
      console.log(`[INFO] ${name} ${width}x${height}: Ganesha ${vs.sacred.map((x) => x.ganesha).join(" / ")}; knot ${vs.knot.size} (gap ${vs.knot.gapAbove.toFixed(1)}px above, ${vs.knot.gapBelow.toFixed(1)}px below); enclosures box ${vs.enc[0].box}, art ${vs.enc[0].art} upper / ${vs.enc[1].art} lower`);
      const vOverflow = layer4Overflow(vgeo);
      console.log(`[INFO] ${name} ${width}x${height}: provisional text exceeding its zone: ${vOverflow.length ? vOverflow.join(", ") : "none"}`);
      const vpl = await ornamentPlacementProblems(vpage, "0");
      check(
        `${name} ${width}x${height}: approved ornament placement (visible art from ~57-60% to bottom, outer corners, own side, control on top, no overflow)`,
        vpl.problems.length === 0,
        vpl.problems.join("; ") || ["left", "right"].map((sd) => `${sd} x ${vpl.art[sd].l.toFixed(1)}-${vpl.art[sd].r.toFixed(1)}% top ${vpl.art[sd].t.toFixed(1)}%`).join(" | ")
      );
      const m = await measurePanel(vpage);
      check(
        `${name} ${width}x${height}: framed panel fits 90%x90%, ratio kept, contained, no overflow, controls usable`,
        vo.surface === "panel" && vo.panelOpacity >= 0.995 && !layout.overflowX && !layout.overflowY && layout.panelInside && layout.boxInside && hit &&
          panelOk(m) && vErrors.length === 0,
        describePanel(m) + `; ${((m.w / layout.vw) * 100).toFixed(1)}vw x ${((m.h / layout.vh) * 100).toFixed(1)}vh` +
          `; overflow=${layout.overflowX || layout.overflowY} contained=${layout.panelInside && layout.boxInside} navHit=${hit} errors=${vErrors.length}`
      );
      await vctx.close();
    }

    // ---------------- Layer 4 review outlines: development-only ----------------
    const outlineOf = (pg) => pg.evaluate(() => [...document.querySelectorAll(".wording-zone")].map((z) => { const r = z.getBoundingClientRect(); return [z.id, getComputedStyle(z).outlineStyle, Math.round(r.width * 100), Math.round(r.height * 100)]; }));
    const octx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const opage = await octx.newPage();
    await opage.goto(BASE_URL, { waitUntil: "load" });
    const plain = await outlineOf(opage);
    await opage.goto(BASE_URL + "?review=wording", { waitUntil: "load" });
    const review = await outlineOf(opage);
    check(
      "Layer 4 review outlines only with ?review=wording, without changing zone dimensions",
      plain.every((z) => z[1] === "none") && review.every((z) => z[1] === "solid") && plain.every((z, k) => z[2] === review[k][2] && z[3] === review[k][3]),
      `plain=${[...new Set(plain.map((z) => z[1]))]} review=${[...new Set(review.map((z) => z[1]))]}`
    );
    await octx.close();

    // ---------------- Reduced motion: same states, short crossfades ----------------
    const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const rpage = await rctx.newPage();
    const rErrors = [];
    rpage.on("pageerror", (e) => rErrors.push(e.message));
    await rpage.addInitScript(installOverlaySampler);
    await rpage.goto(BASE_URL, { waitUntil: "load" });
    let ro = await waitSurface(rpage, 80);
    const rTiming = await rpage.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { enter: parseFloat(cs.getPropertyValue("--panel-enter-ms")), exit: parseFloat(cs.getPropertyValue("--panel-exit-ms")), finale: parseFloat(cs.getPropertyValue("--finale-enter-ms")) };
    });
    check("reduced motion: framed panel still shown at 80", ro.surface === "panel" && ro.panelOpacity >= 0.995, JSON.stringify(ro));
    check("reduced motion: crossfades shortened to <=300ms", rTiming.enter <= 300 && rTiming.exit <= 300 && rTiming.finale <= 300, JSON.stringify(rTiming));
    for (const f of [160, 240, 300]) {
      await rpage.keyboard.press("ArrowDown");
      ro = await waitSurface(rpage, f);
    }
    check("reduced motion: finale full light still reached at 300", ro.surface === "finale" && ro.finaleOpacity >= 0.995, JSON.stringify(ro));
    await rpage.keyboard.press("ArrowUp");
    ro = await waitSurface(rpage, 240);
    check("reduced motion: back from 300 restores the panel at 240", ro.surface === "panel" && ro.panelOpacity >= 0.995 && ro.finaleOpacity <= 0.005, JSON.stringify(ro));
    const rL4 = await rpage.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const m = [...document.querySelectorAll('.wording-stop[data-state="in"] .wording-motion')];
      return { stagger: cs.getPropertyValue("--wd-stagger-ms").trim(), exitStagger: cs.getPropertyValue("--wd-exit-stagger-ms").trim(), shift: cs.getPropertyValue("--wd-shift").trim(), rise: cs.getPropertyValue("--wd-rise").trim(),
        delays: [...new Set(m.map((x) => getComputedStyle(x).transitionDelay))], transforms: [...new Set(m.map((x) => getComputedStyle(x).transform))], count: m.length };
    });
    check("reduced motion: Layer 4 has no translation or stagger, opacity only", rL4.count > 0 && rL4.stagger === "0ms" && rL4.exitStagger === "0ms" && rL4.shift === "0px" && rL4.rise === "0px" && rL4.delays.every((d) => /^0s(, 0s)*$/.test(d)) && rL4.transforms.join() === "none", JSON.stringify(rL4));
    const rSamples = await rpage.evaluate(() => window.__overlaySamples);
    const rSeq = analyzeOrnamentSequence(rSamples);
    const rMaxTx = Math.max(0, ...rSamples.flatMap((x) => (x[8] || []).map((d) => Math.abs(d[2]))));
    check(
      "reduced motion: ornaments crossfade in place after the panel, and clear before it",
      rSeq.arrivals.length >= 4 && rSeq.arrivals.every((x) => x.panelSettledBeforeOrnaments) && rSeq.departures.every((d) => d.ornamentsClearedBeforePanel) && rMaxTx < 1 && rSeq.mixed === 0,
      `arrivals=${rSeq.arrivals.length} maxSlide=${rMaxTx.toFixed(2)}px`
    );
    const rOv = analyzeOverlaySamples(rSamples, 1);
    check("reduced motion: no surface visible during travel", rOv.travelLeaks === 0, `leaks=${rOv.travelLeaks}`);
    check("no page errors in reduced motion", rErrors.length === 0, JSON.stringify(rErrors));
    await rctx.close();
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
