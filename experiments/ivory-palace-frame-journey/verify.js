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
 *   - stop surfaces (METHOD §11): the misted paper layer is never visible
 *     during frame travel, rests fully visible at 80/160/240, frame 300
 *     rests on full-box warm light instead, leaving a stop clears the
 *     right surface, rapid input cannot strand or double a transition,
 *     opacity never jumps, the mist's measured footprint is ~90% × ~90%
 *     with no hard edge, layouts hold across six viewport classes,
 *     reduced motion keeps every state, and the reserved wording layer
 *     is empty, hidden and inert
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
      window.__overlaySamples.push([o.frame, o.surface, o.mistOpacity, o.finaleOpacity, performance.now()]);
    }
    requestAnimationFrame(sample);
  })();
}

const overlay = (page) => page.evaluate(() => window.__overlayState());

// Waits until the page is at rest on `chapter` with its surface fully in.
async function waitSurface(page, frame, timeoutMs = 9000) {
  const want = frame === 300 ? "finale" : "mist";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const o = await overlay(page);
    const opacity = want === "finale" ? o.finaleOpacity : o.mistOpacity;
    if (o.frame === frame && !o.isAnimating && o.surface === want && opacity >= 0.999) return o;
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

// Measures the mist layer alone over the flat, dark frame-box background
// (canvas, veil and controls hidden for the capture, then restored), so
// its opacity at each pixel is (L - bg) / (L_centre - bg).
async function measureMist(page) {
  await page.evaluate(() => {
    for (const sel of ["#frameCanvas", ".stop-veil", ".nav-btn"])
      document.querySelectorAll(sel).forEach((el) => (el.style.visibility = "hidden"));
  });
  await page.waitForTimeout(120);
  const png = await page.locator("#frameBox").screenshot();
  await page.evaluate(() => {
    for (const sel of ["#frameCanvas", ".stop-veil", ".nav-btn"])
      document.querySelectorAll(sel).forEach((el) => (el.style.visibility = ""));
  });
  return analyzePng(
    page,
    png,
    `
    const bg = lum(0, 0) < 60 ? Math.min(lum(0, 0), lum(w - 1, h - 1)) : 20.8;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    let centre = 0, n = 0;
    for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) { centre += lum(x, y); n++; }
    centre /= n;
    const a = (x, y) => (lum(x, y) - bg) / (centre - bg);
    const span = (len, at) => {
      let lo = -1, hi = -1;
      for (let i = 0; i < len; i++) if (at(i) >= 0.5) { lo = i; break; }
      for (let i = len - 1; i >= 0; i--) if (at(i) >= 0.5) { hi = i; break; }
      return lo < 0 ? 0 : (hi - lo + 1) / len;
    };
    const widths = [0.3, 0.5, 0.7].map((f) => span(w, (x) => a(x, Math.floor(h * f))));
    const heights = [0.3, 0.5, 0.7].map((f) => span(h, (y) => a(Math.floor(w * f), y)));
    let edgeMax = 0;
    for (let x = 0; x < w; x++) edgeMax = Math.max(edgeMax, a(x, 0), a(x, h - 1));
    for (let y = 0; y < h; y++) edgeMax = Math.max(edgeMax, a(0, y), a(w - 1, y));
    let coreMin = 1;
    for (let y = Math.floor(h * 0.2); y < h * 0.8; y += 4)
      for (let x = Math.floor(w * 0.22); x < w * 0.78; x += 4) coreMin = Math.min(coreMin, a(x, y));
    const [r, g, b] = rgb(cx, cy);
    const mean = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
    return { w, h, width: mean(widths), height: mean(heights), edgeMax, coreMin,
      centreAlpha: (centre - bg) / (246 - bg), warm: r - b };
  `
  );
}

async function measureFinale(page) {
  await page.evaluate(() => document.querySelectorAll(".nav-btn").forEach((el) => (el.style.visibility = "hidden")));
  await page.waitForTimeout(120);
  const png = await page.locator("#frameBox").screenshot();
  await page.evaluate(() => document.querySelectorAll(".nav-btn").forEach((el) => (el.style.visibility = "")));
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
    const [frame, surface, mist, finale] = samples[i];
    if (frame > 1 && !stops.has(frame)) {
      travelSamples++;
      if (surface !== "none" || mist > 0.02 || finale > 0.02) travelLeaks++;
    }
    if (i > 0) {
      worstJump = Math.max(worstJump, Math.abs(mist - samples[i - 1][2]), Math.abs(finale - samples[i - 1][3]));
    }
  }
  return { travelLeaks, travelSamples, worstJump, ok: worstJump <= maxJump };
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
  const html = await page.evaluate(() => document.documentElement.outerHTML + "\n" + document.body.innerText);
  const shown = texts.filter((t) => html.includes(t));
  check(`${label}: no approved catalogue wording appears in the page (${texts.length} items checked)`, shown.length === 0, JSON.stringify(shown.slice(0, 3)));
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
        check(`${label}: frame 300 rests on full-box finale light, not the bounded mist`, o.surface === "finale" && o.finaleOpacity >= 0.995 && o.mistOpacity <= 0.005, JSON.stringify(o));
      } else {
        check(`${label}: mist fully visible at rest on ${frame}`, o.surface === "mist" && o.mistOpacity >= 0.995 && o.finaleOpacity <= 0.005, JSON.stringify(o));
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
      landed = await waitSettle(page, getFrame, CHAPTERS[i], 6000);
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
      await sampleCache();
      await restChecks(CHAPTERS[i], `forward ${CHAPTERS[i]}`);
    }

    const downHiddenAtFinale = await page.evaluate(
      () => !document.getElementById("navDown").classList.contains("is-visible")
    );
    check("down arrow hidden at Finale (no further chapter)", downHiddenAtFinale);

    // Reverse back to Welcome
    for (let i = CHAPTERS.length - 1; i > 0; i--) {
      await page.evaluate(() => {
        window.__frameLog = [];
      });
      await page.keyboard.press("ArrowUp");
      landed = await waitSettle(page, getFrame, CHAPTERS[i - 1], 6000);
      log = await page.evaluate(() => window.__frameLog);
      a = analyzeFrameLog(log);
      check(
        `reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]} lands exactly`,
        landed && a.frames[a.frames.length - 1] === CHAPTERS[i - 1]
      );
      check(`reverse ${CHAPTERS[i]}->${CHAPTERS[i - 1]} has zero skips`, a.skips.length === 0);
      await sampleCache();
      await restChecks(CHAPTERS[i - 1], `reverse ${CHAPTERS[i - 1]}`);
    }

    const upHiddenAtWelcome = await page.evaluate(
      () => !document.getElementById("navUp").classList.contains("is-visible")
    );
    check("up arrow hidden at Welcome (no earlier chapter)", upHiddenAtWelcome);
    check("decoded-frame cache stays under the 150MB budget", maxCacheMB <= MEMORY_BUDGET_MB, `peak=${maxCacheMB.toFixed(1)}MB`);
    check("decoded-frame cache never exceeds its 36-frame cap", maxCachedFrames <= MAX_CACHED_FRAMES, `peak=${maxCachedFrames} frames`);
    const source = fs.readFileSync(path.join(DIR, "script.js"), "utf8");
    check(
      "cache constants and stop frames unchanged in script.js",
      /MAX_CACHED_FRAMES = 36;/.test(source) && /WINDOW_AHEAD_MOVING = 20;/.test(source) && /WINDOW_BEHIND_MOVING = 10;/.test(source) &&
        /WINDOW_RADIUS_IDLE = 16;/.test(source) && /frame: 80,[^}]*Welcome[\s\S]*frame: 160,[\s\S]*frame: 240,[\s\S]*frame: 300,/.test(source)
    );

    let samples = await page.evaluate(() => window.__overlaySamples);
    let ov = analyzeOverlaySamples(samples, 0.2);
    check(`no stop surface visible during frame travel (${ov.travelSamples} travel samples)`, ov.travelSamples > 200 && ov.travelLeaks === 0, `leaks=${ov.travelLeaks}`);
    check("surface opacity never jumps between animation frames", ov.ok, `worst=${ov.worstJump.toFixed(3)}`);
    await wordingLayerChecks(page, "desktop");

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
    check("burst of 7 inputs at 80 advances exactly one chapter to 160", o.frame === 160 && o.chapterIndex === 1 && maxFrame === 160 && o.surface === "mist", `max=${maxFrame} ${JSON.stringify(o)}`);

    // Mid-entrance reversal: navigate away while the mist is still fading in.
    await page.keyboard.press("ArrowDown");
    const midStart = Date.now();
    while (Date.now() - midStart < 9000) {
      const s = await overlay(page);
      if (s.chapterIndex === 2 && s.surface === "mist" && s.mistOpacity > 0.05 && s.mistOpacity < 0.9) break;
      await page.waitForTimeout(10);
    }
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    o = await waitSurface(page, 160);
    check("leaving mid-entrance reverses cleanly back to 160 with one mist", o.frame === 160 && o.chapterIndex === 1 && o.surface === "mist" && o.mistOpacity >= 0.995 && o.finaleOpacity <= 0.005, JSON.stringify(o));

    // Mid-travel spam toward the finale, then straight back.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(900);
    for (let k = 0; k < 6; k++) await page.keyboard.press(k % 2 ? "ArrowUp" : "ArrowDown");
    o = await waitSurface(page, 240);
    check("keys pressed mid-travel are ignored; lands on 240 with mist", o.frame === 240 && o.surface === "mist" && o.mistOpacity >= 0.995, JSON.stringify(o));
    await page.evaluate(() => document.getElementById("navDown").click());
    o = await waitSurface(page, 300);
    check("finale reached after rapid-input sequence", o.surface === "finale" && o.finaleOpacity >= 0.995 && o.mistOpacity <= 0.005, JSON.stringify(o));
    const finale = await measureFinale(page);
    check("frame 300 is a complete full-box warm-white field (no palace perimeter)", finale.min >= 225 && finale.warm >= 3, JSON.stringify(finale));
    await page.evaluate(() => document.getElementById("navUp").click());
    await page.evaluate(() => document.getElementById("navUp").click());
    o = await waitSurface(page, 240);
    check("backward from 300 dissolves the light and returns to 240 mist", o.frame === 240 && o.surface === "mist" && o.mistOpacity >= 0.995 && o.finaleOpacity <= 0.005, JSON.stringify(o));
    samples = await page.evaluate(() => window.__overlaySamples);
    ov = analyzeOverlaySamples(samples, 0.2);
    check("rapid-input run: no surface during travel, no opacity jumps", ov.travelLeaks === 0 && ov.ok, `leaks=${ov.travelLeaks} worst=${ov.worstJump.toFixed(3)}`);
    const mist = await measureMist(page);
    check(
      "mist footprint ~90% x ~90%, soft to zero at every edge, solid warm centre",
      mist.width >= 0.84 && mist.width <= 0.95 && mist.height >= 0.84 && mist.height <= 0.95 && mist.edgeMax < 0.12 && mist.coreMin >= 0.9 && mist.warm >= 3,
      `width=${(mist.width * 100).toFixed(1)}% height=${(mist.height * 100).toFixed(1)}% edgeMax=${mist.edgeMax.toFixed(3)} coreMin=${mist.coreMin.toFixed(3)} centreAlpha=${mist.centreAlpha.toFixed(3)}`
    );
    check("no page errors on desktop", pageErrors.length === 0, JSON.stringify(pageErrors));

    await ctx.close();

    // ---------------- Flicker check: CDP screencast during one transition ----------------
    const fctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const fpage = await fctx.newPage();
    await fpage.goto(BASE_URL, { waitUntil: "load" });
    await fpage.waitForTimeout(4200); // opening completes

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
    await fpage.waitForTimeout(4400); // mist exit (~450ms) + 80-frame travel
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

    landed = await waitSettle(mpage, mGetFrame, 80, 6000);
    check("mobile: opening lands on 80", landed);
    await swipe(300, 520);
    landed = await waitSettle(mpage, mGetFrame, 160, 6000);
    check("mobile: downward swipe advances to 160", landed);
    await swipe(520, 300);
    landed = await waitSettle(mpage, mGetFrame, 80, 6000);
    check("mobile: upward swipe returns to 80", landed);
    let mo = await waitSurface(mpage, 80);
    check("mobile: mist returns at 80 after the swipe round trip", mo.surface === "mist" && mo.mistOpacity >= 0.995, JSON.stringify(mo));
    const mOv = analyzeOverlaySamples(await mpage.evaluate(() => window.__overlaySamples), 0.2);
    check("mobile: no surface visible during swipe travel", mOv.travelLeaks === 0 && mOv.travelSamples > 50, `leaks=${mOv.travelLeaks}`);
    check("no page errors on mobile", mErrors.length === 0, JSON.stringify(mErrors));

    await mctx.close();

    // ---------------- Responsive: mist geometry across viewport classes ----------------
    const viewports = [
      ["narrow mobile portrait", 320, 568, true],
      ["standard mobile portrait", 390, 844, true],
      ["tall mobile portrait", 360, 800, true],
      ["tall large mobile portrait", 412, 915, true],
      ["tablet portrait", 768, 1024, true],
      ["desktop portrait preview", 900, 1400, false],
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
        const mist = document.getElementById("stopMist").getBoundingClientRect();
        const de = document.documentElement;
        return {
          overflowX: de.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
          overflowY: de.scrollHeight > window.innerHeight,
          boxW: box.width, boxH: box.height, vw: window.innerWidth, vh: window.innerHeight,
          mistInside: mist.left >= box.left - 0.5 && mist.right <= box.right + 0.5 && mist.top >= box.top - 0.5 && mist.bottom <= box.bottom + 0.5,
          boxInside: box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5
        };
      });
      const hit = await navHit(vpage, "navDown");
      if (SHOTS_DIR) await vpage.screenshot({ path: path.join(SHOTS_DIR, `mist-${width}x${height}.png`) });
      const m = await measureMist(vpage);
      const mistPxW = m.width * layout.boxW, mistPxH = m.height * layout.boxH;
      check(
        `${name} ${width}x${height}: mist ~90%x90% of invitation, contained, no overflow, controls usable`,
        vo.surface === "mist" && vo.mistOpacity >= 0.995 && !layout.overflowX && !layout.overflowY && layout.mistInside && layout.boxInside && hit &&
          m.width >= 0.84 && m.width <= 0.95 && m.height >= 0.84 && m.height <= 0.95 && m.edgeMax < 0.12 && m.coreMin >= 0.9 && vErrors.length === 0,
        `mist ${mistPxW.toFixed(0)}x${mistPxH.toFixed(0)}px = ${(m.width * 100).toFixed(1)}% x ${(m.height * 100).toFixed(1)}% of ${layout.boxW.toFixed(0)}x${layout.boxH.toFixed(0)} box; ` +
          `${((mistPxW / layout.vw) * 100).toFixed(1)}vw x ${((mistPxH / layout.vh) * 100).toFixed(1)}vh; edgeMax=${m.edgeMax.toFixed(3)} coreMin=${m.coreMin.toFixed(3)}` +
          `; opacity=${vo.mistOpacity} overflow=${layout.overflowX || layout.overflowY} contained=${layout.mistInside && layout.boxInside} navHit=${hit} errors=${vErrors.length}`
      );
      await vctx.close();
    }

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
      return { enter: parseFloat(cs.getPropertyValue("--mist-enter-ms")), exit: parseFloat(cs.getPropertyValue("--mist-exit-ms")), finale: parseFloat(cs.getPropertyValue("--finale-enter-ms")) };
    });
    check("reduced motion: mist still shown at 80 with no scale motion", ro.surface === "mist" && ro.mistOpacity >= 0.995 && ro.mistTransform === "none", JSON.stringify(ro));
    check("reduced motion: crossfades shortened to <=300ms", rTiming.enter <= 300 && rTiming.exit <= 300 && rTiming.finale <= 300, JSON.stringify(rTiming));
    for (const f of [160, 240, 300]) {
      await rpage.keyboard.press("ArrowDown");
      ro = await waitSurface(rpage, f);
    }
    check("reduced motion: finale full light still reached at 300", ro.surface === "finale" && ro.finaleOpacity >= 0.995, JSON.stringify(ro));
    await rpage.keyboard.press("ArrowUp");
    ro = await waitSurface(rpage, 240);
    check("reduced motion: back from 300 restores mist at 240", ro.surface === "mist" && ro.mistOpacity >= 0.995 && ro.finaleOpacity <= 0.005, JSON.stringify(ro));
    const rOv = analyzeOverlaySamples(await rpage.evaluate(() => window.__overlaySamples), 1);
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
