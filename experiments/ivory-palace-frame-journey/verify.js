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
 *
 * Requires the `playwright` package (a devDependency of the parent
 * repo) and Python 3 (`python3 -m http.server`) to be on PATH.
 *
 * Usage (from the repo root):
 *   node experiments/ivory-palace-frame-journey/verify.js
 */
"use strict";

const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const DIR = __dirname;
const PORT = 4531;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;

const CHAPTERS = [80, 160, 240, 300];
const MEMORY_BUDGET_MB = 150;

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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();

  try {
    // ---------------- Desktop: full forward + reverse journey ----------------
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript(() => {
      window.__frameLog = [];
    });
    await page.goto(BASE_URL, { waitUntil: "load" });

    const getFrame = () =>
      page.evaluate(() =>
        window.__frameLog.length ? window.__frameLog[window.__frameLog.length - 1][0] : null
      );

    let maxCacheMB = 0;
    const sampleCache = async () => {
      const stats = await page.evaluate(() => window.__cacheStats());
      maxCacheMB = Math.max(maxCacheMB, stats.estimatedMB);
      return stats;
    };

    // Opening
    let landed = await waitSettle(page, getFrame, CHAPTERS[0], 6000);
    let log = await page.evaluate(() => window.__frameLog);
    let a = analyzeFrameLog(log);
    check("opening lands on frame 80", landed && a.frames[a.frames.length - 1] === 80);
    check("opening has zero skipped frames", a.skips.length === 0, JSON.stringify(a.skips));
    check("opening never exceeds ~30fps", a.minGap >= 30, `minGap=${a.minGap.toFixed(2)}ms`);
    await sampleCache();

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
    }

    const upHiddenAtWelcome = await page.evaluate(
      () => !document.getElementById("navUp").classList.contains("is-visible")
    );
    check("up arrow hidden at Welcome (no earlier chapter)", upHiddenAtWelcome);
    check("decoded-frame cache stays under the 150MB budget", maxCacheMB <= MEMORY_BUDGET_MB, `peak=${maxCacheMB.toFixed(1)}MB`);
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
      } catch (_) {
        /* session already torn down — nothing to ack */
      }
    });
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 300, maxHeight: 534 });
    await fpage.click("#navDown");
    await fpage.waitForTimeout(3700);
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
    await mpage.addInitScript(() => {
      window.__frameLog = [];
    });
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
    check("no page errors on mobile", mErrors.length === 0, JSON.stringify(mErrors));

    await mctx.close();
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
