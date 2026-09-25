/**
 * Invitation interface controls — unit tests for the pure event core and
 * the configuration defaults (no browser). Browser behaviour (Music,
 * Gallery, Share, navigation, strips, calendar menu, responsive) is in
 * controls.verify.js.
 *
 * Usage (from the repo root):
 *   node --test experiments/ivory-palace-frame-journey/controls.test.cjs
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node test, not app code */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DIR = __dirname;
const E = require("./components/event-core.js");

function loadConfig(search, override) {
  const win = { location: { search: search || "" } };
  if (override) win.__INVITATION_CONFIG_OVERRIDE = override;
  new Function("window", "location", fs.readFileSync(path.join(DIR, "invitation-config.js"), "utf8"))(win, win.location);
  return win.ENVELOPED_INVITATION_CONFIG;
}

const HALDI = { id: "haldi", title: "Haldi", startsAt: "2026-08-22T18:30", endsAt: "2026-08-22T21:30", timeZone: "Indian/Mauritius", venueName: "Magnolia Hall", venueAddress: "Greenview Gardens, Vacoas", description: "Haldi ceremony" };

test("Mauritius wall-clock times convert to the correct absolute instant", () => {
  assert.equal(new Date(E.toInstant("2026-08-22T18:30", "Indian/Mauritius")).toISOString(), "2026-08-22T14:30:00.000Z");
  assert.equal(E.DEFAULT_TIME_ZONE, "Indian/Mauritius");
  assert.equal(E.toInstant("2026-08-22T18:30:00+04:00"), Date.parse("2026-08-22T14:30:00Z"), "explicit offsets respected");
  assert.equal(E.toInstant("2026-08-22T14:30:00Z", "Asia/Tokyo"), Date.parse("2026-08-22T14:30:00Z"), "absolute ISO ignores the zone");
  assert.equal(new Date(E.toInstant("2026-07-01T12:00", "Europe/London")).toISOString(), "2026-07-01T11:00:00.000Z", "DST-aware zones");
  assert.equal(E.toInstant(null), null);
  assert.equal(E.toInstant("next Saturday"), null);
});

test("countdown is computed from absolute timestamps, never negative", () => {
  const t = Date.parse("2026-08-22T14:30:00Z");
  const left = (12 * 86400 + 8 * 3600 + 24 * 60 + 16) * 1000;
  assert.deepEqual(E.countdown(t, t - left), { state: "running", days: 12, hours: 8, minutes: 24, seconds: 16 });
  assert.equal(E.formatCountdown(E.countdown(t, t - left), false), "12D : 08H : 24M : 16S");
  assert.equal(E.formatCountdown(E.countdown(t, t - left), true), "12D:08H:24M:16S");
  assert.deepEqual(E.countdown(t, t - 999), { state: "running", days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(E.countdown(t, t), { state: "completed", days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(E.countdown(t, t + 5e9), { state: "completed", days: 0, hours: 0, minutes: 0, seconds: 0 }, "no negative values");
  assert.deepEqual(E.countdown(null, Date.now()), { state: "unavailable" });
  // Same instant regardless of when it is asked (no locally stored decrement).
  assert.deepEqual(E.countdown(t, t - left + 3600e3), { state: "running", days: 12, hours: 7, minutes: 24, seconds: 16 });
});

test("static accessible description in the event's own time zone", () => {
  assert.equal(E.describeStart(HALDI), "Haldi begins Saturday, 22 August 2026 at 6:30 pm (Indian/Mauritius time).");
  assert.equal(E.describeStart({ id: "x", title: "Wedding", startsAt: null, timeZone: "Indian/Mauritius" }), "Wedding: date to be announced.");
});

test("Google Calendar link uses the event's own details and never invents values", () => {
  const u = new URL(E.googleCalendarUrl(HALDI));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "Haldi");
  assert.equal(u.searchParams.get("dates"), "20260822T143000Z/20260822T173000Z");
  assert.equal(u.searchParams.get("ctz"), "Indian/Mauritius");
  assert.equal(u.searchParams.get("location"), "Magnolia Hall, Greenview Gardens, Vacoas");
  assert.equal(u.searchParams.get("details"), "Haldi ceremony");
  assert.equal(E.googleCalendarUrl({ ...HALDI, startsAt: null }), null, "no start, no link");
  const bare = new URL(E.googleCalendarUrl({ id: "w", title: "Wedding", startsAt: "2026-08-23T13:15", timeZone: "Indian/Mauritius" }));
  assert.equal(bare.searchParams.get("location"), null, "missing venue stays missing");
  assert.equal(E.googleCalendarUrl({ ...HALDI, calendar: { googleUrl: "https://calendar.google.com/calendar/event?eid=abc" } }), "https://calendar.google.com/calendar/event?eid=abc", "configured link wins");
});

test(".ics file: RFC 5545 structure, UTC times, escaping, folding", () => {
  const ics = E.buildIcs({ ...HALDI, description: "Line one; with, commas\nand a very long second line that has to be folded because it runs past seventy-five octets" }, Date.parse("2026-01-01T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:-\/\/Enveloped\/\/Invitation\/\/EN\r\n/);
  assert.match(ics, /\r\nDTSTART:20260822T143000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260822T173000Z\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20260101T000000Z\r\n/);
  assert.match(ics, /\r\nSUMMARY:Haldi\r\n/);
  assert.match(ics, /\r\nLOCATION:Magnolia Hall\\, Greenview Gardens\\, Vacoas\r\n/);
  assert.match(ics, /DESCRIPTION:Line one\\; with\\, commas\\nand/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `folded: ${line}`);
  assert.match(ics, /\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n$/);
  assert.doesNotMatch(E.buildIcs({ ...HALDI, endsAt: null }), /DTEND/, "no invented end time");
  assert.equal(E.buildIcs({ ...HALDI, startsAt: null }), null);
});

test("Location only for verified https map URLs", () => {
  assert.equal(E.verifiedMapsUrl({ mapsUrl: "https://maps.app.goo.gl/abc" }), "https://maps.app.goo.gl/abc");
  assert.equal(E.verifiedMapsUrl({ mapsUrl: "https://www.google.com/maps/search/?api=1&query=x" }), "https://www.google.com/maps/search/?api=1&query=x");
  for (const bad of ["http://maps.google.com/x", "javascript:alert(1)", "https://evil.example/maps", "//maps.google.com", "", null]) {
    assert.equal(E.verifiedMapsUrl({ mapsUrl: bad }), null, String(bad));
  }
  assert.equal(E.safeHttpsUrl("https://photos.app.goo.gl/x", ["photos.app.goo.gl"]), "https://photos.app.goo.gl/x");
  assert.equal(E.safeHttpsUrl("https://drive.google.com/x", ["photos.app.goo.gl"]), null, "host allowlist");
});

test("production configuration invents nothing; demo only on request", () => {
  const cfg = loadConfig("");
  assert.equal(cfg.music.src, null, "no audio asset");
  assert.equal(cfg.gallery.url, null, "no gallery destination");
  assert.equal(cfg.share.preservePersonalizedUrl, false);
  assert.deepEqual(cfg.events.map((e) => [e.id, e.title, e.timeZone]), [["haldi", "Haldi", "Indian/Mauritius"], ["wedding", "Wedding", "Indian/Mauritius"]]);
  for (const e of cfg.events) for (const k of ["startsAt", "endsAt", "venueName", "venueAddress", "mapsUrl", "description"]) assert.equal(e[k], null, `${e.id}.${k}`);
  assert.equal(cfg.demo, undefined);
  const demo = loadConfig("?demo=controls");
  assert.equal(demo.demo, true);
  assert.ok(demo.events.every((e) => E.toInstant(e.startsAt, e.timeZone) > Date.now()), "demo events in the future");
  assert.ok(demo.events.every((e) => /Demo event \(fictional sample data\)/.test(e.description)));
  assert.equal(demo.music.src, null, "demo never fabricates audio");
  assert.equal(demo.gallery.url, null, "demo never fabricates a gallery");
  const over = loadConfig("", { gallery: { url: "https://photos.app.goo.gl/x" } });
  assert.equal(over.gallery.url, "https://photos.app.goo.gl/x");
});

test("icons come from the project's existing icon system (lucide) as inline SVG", () => {
  const src = fs.readFileSync(path.join(DIR, "components/icons.js"), "utf8");
  assert.match(src, /GENERATED by tools\/build-icons\.mjs/);
  assert.match(src, /lucide-react v\d+\.\d+\.\d+ \(ISC licence/);
  const win = {};
  new Function("window", src)(win);
  for (const n of ["music", "volume-2", "image", "share-2", "chevron-up", "chevron-down", "map-pin", "calendar-days"]) {
    assert.match(win.EnvelopedIcons.svg(n), /^<svg [^>]*aria-hidden="true" focusable="false">/, n);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "../../package.json"), "utf8"));
  assert.ok(pkg.dependencies["lucide-react"], "no new icon dependency");
});
