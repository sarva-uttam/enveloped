#!/usr/bin/env node
/**
 * Invitation interface controls — browser verification (Playwright).
 * Covers Music, Gallery, Share, navigation endpoints and keyboard, the
 * stop-300 event strips (countdown lifecycle, completed / missing states,
 * Location, Calendar menu + .ics), accessibility names, focus visibility,
 * touch targets and stop-300-only visibility. Journey/Layer checks stay in
 * verify.js; pure logic is in controls.test.cjs.
 *
 * Test-only fixtures: configuration overrides (window.__INVITATION_CONFIG_OVERRIDE)
 * and an in-memory silent WAV for the Music on/off states. Nothing here is
 * shipped as invitation content.
 *
 * Usage (from the repo root): node experiments/ivory-palace-frame-journey/controls.verify.js
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node script, not app code */

const { spawn } = require("child_process");
const { chromium } = require("playwright");

const DIR = __dirname;
const PORT = 4532;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
let failures = 0;
function check(label, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

// 0.1 s of silence, 8 kHz mono PCM: a test fixture, not an invitation asset.
function silentWavDataUri() {
  const n = 800, buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(8000, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write("data", 36); buf.writeUInt32LE(n, 40);
  buf.fill(128, 44);
  return "data:audio/wav;base64," + buf.toString("base64");
}

function iso(msFromNow) { return new Date(Date.now() + msFromNow).toISOString().replace(/\.\d{3}Z$/, "Z"); }

async function openPage(browser, { override, query = "", viewport = { width: 390, height: 844 }, init } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${PORT}` });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(({ override }) => {
    if (override) window.__INVITATION_CONFIG_OVERRIDE = override;
    window.__opened = [];
    window.open = (url, target, features) => { window.__opened.push([url, target, features]); return null; };
    window.__alerts = 0;
    window.alert = () => { window.__alerts++; };
  }, { override });
  if (init) await page.addInitScript(init);
  await page.goto(BASE + query, { waitUntil: "load" });
  return { ctx, page, errors };
}

async function settleAt(page, frame, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const o = await page.evaluate(() => window.__overlayState && window.__overlayState());
    if (o && o.frame === frame && !o.isAnimating && o.surface !== "none") return true;
    await page.waitForTimeout(80);
  }
  return false;
}

async function goToFinale(page) {
  await settleAt(page, 80);
  for (const f of [160, 240, 300]) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(200); await settleAt(page, f); }
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: DIR, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    // ---------------- Defaults: nothing configured ----------------
    let { ctx, page, errors } = await openPage(browser);
    await settleAt(page, 80);
    const d = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      return { music: [q(".invite-control--music").disabled, q(".invite-control--music").getAttribute("aria-label")], gallery: [q(".invite-control--gallery").disabled, q(".invite-control--gallery").getAttribute("aria-label")],
        share: [q(".invite-control--share").disabled, q(".invite-control--share").getAttribute("aria-label")], types: [...document.querySelectorAll(".invite-control")].every((b) => b.type === "button"),
        tooltips: [...document.querySelectorAll(".invite-controls .invite-control")].every((b) => b.getAttribute("data-tooltip")), strips: window.IvoryLayer4.components() };
    });
    check("Music disabled without an audio asset", d.music[0] && d.music[1] === "Music unavailable", JSON.stringify(d.music));
    check("Gallery disabled without a configured destination", d.gallery[0] && d.gallery[1] === "Gallery unavailable", JSON.stringify(d.gallery));
    check("Share enabled by default; every control is type=button with a tooltip", !d.share[0] && d.types && d.tooltips);
    check("strips exist for Haldi and Wedding, not ticking away from stop 300", d.strips.length === 2 && d.strips.every((s) => s.stop === 300 && !s.ticking), JSON.stringify(d.strips));
    // Keyboard focus visibility on a utility control.
    await page.keyboard.press("Tab");
    let focus = await page.evaluate(() => { const a = document.activeElement; return { cls: a.className, outline: getComputedStyle(a).outlineStyle, width: getComputedStyle(a).outlineWidth, name: a.getAttribute("aria-label") }; });
    for (let k = 0; k < 6 && !/invite-control/.test(focus.cls); k++) { await page.keyboard.press("Tab"); focus = await page.evaluate(() => { const a = document.activeElement; return { cls: a.className, outline: getComputedStyle(a).outlineStyle, width: getComputedStyle(a).outlineWidth, name: a.getAttribute("aria-label") }; }); }
    check("keyboard focus reaches the controls with a visible 2px focus ring", /invite-control/.test(focus.cls) && focus.outline === "solid" && focus.width === "2px" && !!focus.name, JSON.stringify(focus));
    // Navigation endpoints and direction.
    const nav80 = await page.evaluate(() => [document.getElementById("navUp").disabled, document.getElementById("navDown").disabled]);
    check("at stop 80: Previous disabled, Next enabled", nav80[0] === true && nav80[1] === false, JSON.stringify(nav80));
    await page.click("#navDown");
    await settleAt(page, 160);
    let o = await page.evaluate(() => window.__overlayState());
    check("Next button travels forward (80 -> 160)", o.frame === 160, `frame=${o.frame}`);
    await page.click("#navUp");
    await settleAt(page, 80);
    o = await page.evaluate(() => window.__overlayState());
    check("Previous button travels backward (160 -> 80)", o.frame === 80, `frame=${o.frame}`);
    await goToFinale(page);
    const fin = await page.evaluate(() => ({ up: document.getElementById("navUp").disabled, down: document.getElementById("navDown").disabled, downVisible: document.getElementById("navDown").classList.contains("is-visible"),
      strips: [...document.querySelectorAll(".event-strip")].map((s) => [s.dataset.event, s.getAttribute("data-state"), s.querySelector(".event-strip__count").textContent.trim(), s.querySelector(".event-strip__desc").textContent]),
      loc: [...document.querySelectorAll(".event-action--location")].map((b) => [b.disabled, b.getAttribute("aria-label")]), cal: [...document.querySelectorAll(".event-action--calendar")].map((b) => [b.disabled, b.getAttribute("aria-label")]) }));
    check("at stop 300: Previous enabled; Next visible, subdued, disabled", !fin.up && fin.down && fin.downVisible, JSON.stringify(fin));
    check("missing dates show 'Date to be announced' with a static description (no invented numbers)", fin.strips.every((s) => s[1] === "unavailable" && /Date to be announced/.test(s[2]) && /date to be announced\./.test(s[3])), JSON.stringify(fin.strips));
    check("Location and Calendar disabled without valid data, with per-event names", fin.loc.every((l) => l[0]) && fin.cal.every((c) => c[0]) && fin.loc[0][1] === "Haldi location not yet available" && fin.cal[1][1] === "Wedding date not yet available", JSON.stringify([fin.loc, fin.cal]));
    check("no page errors or alerts (defaults)", errors.length === 0 && (await page.evaluate(() => window.__alerts)) === 0, JSON.stringify(errors));
    await ctx.close();

    // ---------------- Configured: live strips, location, calendar ----------------
    const events = [
      { id: "haldi", title: "Haldi", startsAt: iso(3 * 86400e3 + 5e3), endsAt: iso(3 * 86400e3 + 3 * 3600e3), timeZone: "Indian/Mauritius", venueName: "Test Hall", venueAddress: "Test Road", description: "Haldi test", mapsUrl: "https://maps.app.goo.gl/haldiTest", calendar: {} },
      { id: "wedding", title: "Wedding", startsAt: iso(4 * 86400e3), endsAt: null, timeZone: "Indian/Mauritius", venueName: "Other Hall", venueAddress: null, description: null, mapsUrl: "https://www.google.com/maps/search/?api=1&query=Other", calendar: {} }
    ];
    ({ ctx, page, errors } = await openPage(browser, { override: { events }, viewport: { width: 900, height: 1400 } }));
    await goToFinale(page);
    const readHaldi = () => page.evaluate(() => ({ text: document.querySelector('.event-strip[data-event="haldi"] .count-full').textContent, left: Math.floor((window.EnvelopedEvents.toInstant(window.ENVELOPED_INVITATION_CONFIG.events[0].startsAt) - Date.now()) / 1000), comps: window.IvoryLayer4.components() }));
    const secs = (t) => { const m = /^(\d+)D : (\d+)H : (\d+)M : (\d+)S$/.exec(t); return m ? ((+m[1] * 24 + +m[2]) * 60 + +m[3]) * 60 + +m[4] : NaN; };
    let s = await readHaldi();
    await page.waitForTimeout(1150);
    const s2 = await readHaldi();
    check("countdown ticks once per second, D : H : M : S, matching the absolute target", s.comps.every((c) => c.ticking && c.state === "running") && [1, 2].includes(secs(s.text) - secs(s2.text)) && Math.abs(secs(s2.text) - s2.left) <= 1, `${s.text} -> ${s2.text} (target says ${s2.left}s)`);
    const aria = await page.evaluate(() => { const c = document.querySelector(".event-strip__count"); return { hidden: c.getAttribute("aria-hidden"), live: !!document.querySelector(".event-strip [aria-live]") }; });
    check("countdown digits hidden from screen readers; no per-second live region", aria.hidden === "true" && !aria.live, JSON.stringify(aria));
    // Suspension: jump the clock forward and fire visibilitychange.
    await page.evaluate(() => { const real = Date.now; const skew = 3600e3; Date.now = () => real() + skew; document.dispatchEvent(new Event("visibilitychange")); });
    const s3 = await readHaldi();
    check("after a (simulated) one-hour suspension the countdown re-syncs to the absolute time", Math.abs(secs(s3.text) - s3.left) <= 1 && secs(s2.text) - secs(s3.text) >= 3599, `${s2.text} -> ${s3.text} (target says ${s3.left}s)`);
    // Location: separate destinations, safe external open.
    await page.click('.event-strip[data-event="haldi"] .event-action--location');
    await page.click('.event-strip[data-event="wedding"] .event-action--location');
    const opened = await page.evaluate(() => window.__opened);
    check("Location opens each event's own verified map URL with noopener", opened.length === 2 && opened[0][0] === "https://maps.app.goo.gl/haldiTest" && /query=Other/.test(opened[1][0]) && opened.every((o) => o[1] === "_blank" && o[2] === "noopener,noreferrer"), JSON.stringify(opened));
    const locNames = await page.evaluate(() => [...document.querySelectorAll(".event-action--location")].map((b) => b.getAttribute("aria-label")));
    check("Location accessible names are per event", locNames[0] === "Open Haldi location in Maps" && locNames[1] === "Open Wedding location in Maps", JSON.stringify(locNames));
    // Calendar menu: open, focus, keyboard, Escape, outside click.
    const calBtn = '.event-strip[data-event="haldi"] .event-action--calendar';
    await page.click(calBtn);
    let menu = await page.evaluate(() => {
      const m = document.getElementById("calendar-menu-haldi"), b = document.querySelector('.event-strip[data-event="haldi"] .event-action--calendar'), box = document.getElementById("frameBox").getBoundingClientRect(), r = m.getBoundingClientRect();
      const g = m.querySelector("a");
      return { open: !m.hidden, expanded: b.getAttribute("aria-expanded"), role: m.getAttribute("role"), label: m.getAttribute("aria-label"), focusFirst: document.activeElement === m.firstElementChild,
        inside: r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom, google: g && g.href, rel: g && g.rel, target: g && g.target, items: [...m.children].map((c) => c.textContent.trim()) };
    });
    const gUrl = menu.google ? new URL(menu.google) : null;
    check("Calendar opens a labelled menu inside the invitation, focus on the first item", menu.open && menu.expanded === "true" && menu.role === "menu" && menu.label === "Haldi calendar options" && menu.focusFirst && menu.inside, JSON.stringify(menu));
    check("Google Calendar item: event-specific title, UTC times, Mauritius zone, venue, safe link", gUrl && gUrl.searchParams.get("text") === "Haldi" && gUrl.searchParams.get("ctz") === "Indian/Mauritius" && gUrl.searchParams.get("location") === "Test Hall, Test Road" && gUrl.searchParams.get("details") === "Haldi test" && /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/.test(gUrl.searchParams.get("dates")) && menu.rel === "noopener noreferrer" && menu.target === "_blank", menu.google);
    await page.keyboard.press("ArrowDown");
    const second = await page.evaluate(() => document.activeElement.textContent.trim());
    const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    const icsPath = await dl.path();
    const ics = require("fs").readFileSync(icsPath, "utf8");
    check("arrow keys move within the menu; Enter downloads an event-specific .ics", /\.ics/.test(second) && dl.suggestedFilename() === "haldi.ics" && /SUMMARY:Haldi/.test(ics) && /LOCATION:Test Hall\\, Test Road/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) && /DTEND:/.test(ics), `${second} ${dl.suggestedFilename()}`);
    menu = await page.evaluate(() => ({ open: !document.getElementById("calendar-menu-haldi").hidden, focusBack: document.activeElement.classList.contains("event-action--calendar") }));
    check(".ics action closes the menu and returns focus to Calendar", !menu.open && menu.focusBack, JSON.stringify(menu));
    await page.click(calBtn);
    await page.keyboard.press("Escape");
    menu = await page.evaluate(() => ({ open: !document.getElementById("calendar-menu-haldi").hidden, focusBack: document.activeElement.classList.contains("event-action--calendar"), frame: window.__overlayState().frame }));
    check("Escape dismisses the menu, returns focus, and does not navigate", !menu.open && menu.focusBack && menu.frame === 300, JSON.stringify(menu));
    await page.click(calBtn);
    await page.mouse.click(40, 300);
    menu = await page.evaluate(() => !document.getElementById("calendar-menu-haldi").hidden);
    check("clicking outside dismisses the menu", menu === false);
    const wIcs = await page.evaluate(() => window.EnvelopedEvents.buildIcs(window.ENVELOPED_INVITATION_CONFIG.events[1]));
    check("Wedding .ics uses its own data and omits the unconfigured end time", /SUMMARY:Wedding/.test(wIcs) && /LOCATION:Other Hall\r\n/.test(wIcs) && !/DTEND/.test(wIcs));
    // Touch targets and names on every interactive control.
    const targets = await page.evaluate(() => [...document.querySelectorAll(".invite-control, .event-action")].filter((b) => b.offsetParent !== null || b.closest(".wording-stop[data-state='in']"))
      .map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute("aria-label"), Math.round(r.width), Math.round(r.height)]; }));
    check("every control has an accessible name and a >= 44x44 target", targets.length >= 9 && targets.every((t) => t[0] && t[1] >= 44 && t[2] >= 44), JSON.stringify(targets));
    // Leaving stop 300 stops the timers (cleanup).
    await page.keyboard.press("ArrowUp");
    await settleAt(page, 240);
    s = await page.evaluate(() => ({ comps: window.IvoryLayer4.components(), group: document.querySelector('.wording-stop[data-stop="3"]').getAttribute("data-state") }));
    check("leaving stop 300 stops every countdown timer and hides the strips", s.comps.every((c) => !c.ticking) && s.group === "hidden", JSON.stringify(s));
    check("no page errors or alerts (configured)", errors.length === 0 && (await page.evaluate(() => window.__alerts)) === 0, JSON.stringify(errors));
    await ctx.close();

    // ---------------- Completed state ----------------
    ({ ctx, page, errors } = await openPage(browser, { override: { events: [{ ...events[0], startsAt: iso(-3600e3) }, events[1]] } }));
    await goToFinale(page);
    const done = await page.evaluate(() => ({ state: document.querySelector('.event-strip[data-event="haldi"]').getAttribute("data-state"), text: document.querySelector('.event-strip[data-event="haldi"] .event-strip__count').textContent.trim(), ticking: window.IvoryLayer4.components()[0].ticking }));
    check("an event that has begun shows a deliberate completed state and stops ticking", done.state === "completed" && /Celebrating now/.test(done.text) && !done.ticking, JSON.stringify(done));
    await ctx.close();

    // ---------------- Music on/off (test fixture audio) ----------------
    ({ ctx, page, errors } = await openPage(browser, { override: { music: { src: silentWavDataUri() } } }));
    await settleAt(page, 80);
    let m = await page.evaluate(() => { const b = document.querySelector(".invite-control--music"); return [b.disabled, b.getAttribute("aria-pressed"), b.getAttribute("aria-label"), !!b.querySelector(".env-icon--music")]; });
    check("Music starts muted (Off) until the user activates it", !m[0] && m[1] === "false" && m[2] === "Play music" && m[3], JSON.stringify(m));
    await page.click(".invite-control--music");
    await page.waitForTimeout(300);
    m = await page.evaluate(() => { const b = document.querySelector(".invite-control--music"); return [b.getAttribute("aria-pressed"), b.getAttribute("aria-label"), !!b.querySelector(".env-icon--volume-2"), sessionStorage.getItem("enveloped:ivory-palace-sample:music"), window.__utilityControls.state().playing]; });
    check("Music On: icon, label, pressed state and session preference update", m[0] === "true" && m[1] === "Pause music" && m[2] && m[3] === "on" && m[4] === true, JSON.stringify(m));
    await page.click(".invite-control--music");
    m = await page.evaluate(() => { const b = document.querySelector(".invite-control--music"); return [b.getAttribute("aria-pressed"), b.getAttribute("aria-label"), sessionStorage.getItem("enveloped:ivory-palace-sample:music")]; });
    check("Music Off again", m[0] === "false" && m[1] === "Play music" && m[2] === "off", JSON.stringify(m));
    await page.click(".invite-control--music");
    await page.reload({ waitUntil: "load" });
    m = await page.evaluate(() => [document.querySelector(".invite-control--music").getAttribute("aria-pressed"), window.__utilityControls.state().playing]);
    check("after reload the remembered 'on' does not autoplay (waits for a gesture)", m[0] === "false" && m[1] === false, JSON.stringify(m));
    await page.mouse.click(60, 400);
    await page.waitForTimeout(300);
    m = await page.evaluate(() => window.__utilityControls.state().playing);
    check("…and resumes on the next user gesture", m === true);
    await ctx.close();

    // ---------------- Gallery ----------------
    ({ ctx, page } = await openPage(browser, { override: { gallery: { url: "https://photos.app.goo.gl/testAlbum", allowedHosts: ["photos.app.goo.gl"] } } }));
    await page.click(".invite-control--gallery");
    let g = await page.evaluate(() => [document.querySelector(".invite-control--gallery").getAttribute("aria-label"), window.__opened]);
    check("Gallery opens a configured https destination in a new tab with noopener", g[0] === "Open photo gallery" && g[1].length === 1 && g[1][0][0] === "https://photos.app.goo.gl/testAlbum" && g[1][0][2] === "noopener,noreferrer", JSON.stringify(g));
    await ctx.close();
    for (const bad of ["http://photos.example/x", "javascript:alert(1)", "https://drive.google.com/x", "//evil.example/x"]) {
      ({ ctx, page } = await openPage(browser, { override: { gallery: { url: bad, allowedHosts: ["photos.app.goo.gl"] } } }));
      g = await page.evaluate(() => document.querySelector(".invite-control--gallery").disabled);
      check(`Gallery stays disabled for an unverified destination (${bad})`, g === true);
      await ctx.close();
    }
    ({ ctx, page } = await openPage(browser, { override: { gallery: { url: "/gallery/ivory-palace" } } }));
    g = await page.evaluate(() => [document.querySelector(".invite-control--gallery").disabled, window.__utilityControls.state().galleryUrl]);
    check("Gallery accepts a same-origin application route", g[0] === false && g[1] === "/gallery/ivory-palace", JSON.stringify(g));
    await ctx.close();

    // ---------------- Share ----------------
    ({ ctx, page } = await openPage(browser, {
      query: "?guest=abc123&review=wording",
      init: () => { window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); }; navigator.canShare = () => true; }
    }));
    await page.click(".invite-control--share");
    await page.waitForTimeout(200);
    let sh = await page.evaluate(() => ({ shared: window.__shared, fb: document.querySelector(".invite-feedback").textContent, alerts: window.__alerts }));
    check("Share uses the Web Share API with the configured title/message and a token-free URL", sh.shared.length === 1 && sh.shared[0].title === "Ivory Palace — Wedding Invitation" && /warmly invited/.test(sh.shared[0].text) && /\/index\.html$/.test(sh.shared[0].url) && !/guest|review/.test(sh.shared[0].url) && sh.fb === "Invitation shared" && sh.alerts === 0, JSON.stringify(sh));
    await ctx.close();
    ({ ctx, page } = await openPage(browser, { query: "?guest=abc123&demo=controls", override: { share: { preservePersonalizedUrl: true } }, init: () => { delete Navigator.prototype.share; } }));
    await page.click(".invite-control--share");
    await page.waitForTimeout(300);
    sh = await page.evaluate(async () => ({ clip: await navigator.clipboard.readText(), fb: document.querySelector(".invite-feedback").textContent, role: document.querySelector(".invite-feedback").getAttribute("role"), alerts: window.__alerts }));
    check("without Web Share: copies the URL, keeps the personal token only when configured, drops review/demo flags", /\?guest=abc123$/.test(sh.clip) && !/demo/.test(sh.clip) && sh.fb === "Link copied" && sh.role === "status" && sh.alerts === 0, JSON.stringify(sh));
    await ctx.close();
    ({ ctx, page } = await openPage(browser, { init: () => { delete Navigator.prototype.share; Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); document.execCommand = () => false; } }));
    await page.click(".invite-control--share");
    await page.waitForTimeout(300);
    sh = await page.evaluate(() => [document.querySelector(".invite-feedback").textContent, document.querySelector(".invite-feedback").getAttribute("data-kind"), window.__alerts]);
    check("copy failure shows discreet error feedback, no alert", sh[0] === "Couldn't copy the link" && sh[1] === "error" && sh[2] === 0, JSON.stringify(sh));
    await ctx.close();

    // ---------------- Strips only at stop 300 ----------------
    ({ ctx, page } = await openPage(browser, { override: { events } }));
    await settleAt(page, 80);
    const hiddenAt80 = await page.evaluate(() => [...document.querySelectorAll(".event-strip")].every((s) => getComputedStyle(s).visibility === "hidden") && window.IvoryLayer4.components().every((c) => !c.ticking));
    check("event strips are invisible and idle away from stop 300", hiddenAt80);
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
