/*
 * Enveloped invitation event core — pure, reusable logic (no DOM).
 * Used by EventCountdownStrip, LocationAction and CalendarAction, and by
 * the Node tests. Works as a browser global (window.EnvelopedEvents) and
 * as a CommonJS module.
 *
 * InvitationEvent (configuration):
 *   { id, title, startsAt, endsAt?, timeZone, venueName?, venueAddress?,
 *     description?, mapsUrl?, calendar?: { googleUrl?, icsUrl? } }
 * startsAt / endsAt: an absolute ISO timestamp with offset ("…+04:00" or
 * "…Z"), or a wall-clock local time ("2026-08-22T18:30") interpreted in
 * the event's IANA timeZone (e.g. "Indian/Mauritius"). Nothing is ever
 * invented: missing values stay missing.
 */
(function (root) {
  "use strict";

  var DEFAULT_TIME_ZONE = "Indian/Mauritius";
  var MAP_HOSTS = ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl", "maps.apple.com", "www.openstreetmap.org", "openstreetmap.org", "bing.com", "www.bing.com"];

  // Offset (ms) of timeZone from UTC at the given UTC instant.
  function zoneOffsetMs(utcMs, timeZone) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(new Date(utcMs));
    var v = {};
    parts.forEach(function (p) { v[p.type] = p.value; });
    var asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }

  // Absolute epoch ms for a configured time, or null when missing/invalid.
  function toInstant(value, timeZone) {
    if (!value || typeof value !== "string") return null;
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(value)) {
      var abs = Date.parse(value);
      return isNaN(abs) ? null : abs;
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!m) return null;
    var tz = timeZone || DEFAULT_TIME_ZONE;
    try {
      var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      // Two passes settle the offset across DST boundaries.
      var guess = wall - zoneOffsetMs(wall, tz);
      return wall - zoneOffsetMs(guess, tz);
    } catch {
      return null;
    }
  }

  // Countdown from absolute instants: never negative, never stored locally.
  function countdown(targetMs, nowMs) {
    if (targetMs === null || targetMs === undefined || isNaN(targetMs)) return { state: "unavailable" };
    var left = targetMs - nowMs;
    if (left <= 0) return { state: "completed", days: 0, hours: 0, minutes: 0, seconds: 0 };
    var s = Math.floor(left / 1000);
    return { state: "running", days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function formatCountdown(c, compact) {
    if (c.state !== "running") return "";
    var sep = compact ? ":" : " : ";
    return pad(c.days) + "D" + sep + pad(c.hours) + "H" + sep + pad(c.minutes) + "M" + sep + pad(c.seconds) + "S";
  }

  // Human description of the start, in the event's own time zone.
  function describeStart(event) {
    var at = toInstant(event.startsAt, event.timeZone);
    if (at === null) return event.title + ": date to be announced.";
    var tz = event.timeZone || DEFAULT_TIME_ZONE;
    var text = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(at));
    return event.title + " begins " + text + " (" + tz.replace(/_/g, " ") + " time).";
  }

  function safeHttpsUrl(url, hosts) {
    if (!url || typeof url !== "string") return null;
    try {
      var u = new URL(url);
      if (u.protocol !== "https:") return null;
      if (hosts && hosts.indexOf(u.hostname) === -1) return null;
      return u.href;
    } catch {
      return null;
    }
  }

  function verifiedMapsUrl(event) {
    return safeHttpsUrl(event && event.mapsUrl, MAP_HOSTS);
  }

  function utcStamp(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function location(event) {
    return [event.venueName, event.venueAddress].filter(Boolean).join(", ");
  }

  // Google Calendar template link, or null when the start is missing.
  function googleCalendarUrl(event) {
    if (event.calendar && safeHttpsUrl(event.calendar.googleUrl)) return safeHttpsUrl(event.calendar.googleUrl);
    var start = toInstant(event.startsAt, event.timeZone);
    if (start === null) return null;
    var end = toInstant(event.endsAt, event.timeZone);
    var p = new URLSearchParams();
    p.set("action", "TEMPLATE");
    p.set("text", event.title);
    p.set("dates", utcStamp(start) + "/" + utcStamp(end !== null ? end : start));
    p.set("ctz", event.timeZone || DEFAULT_TIME_ZONE);
    if (location(event)) p.set("location", location(event));
    if (event.description) p.set("details", event.description);
    return "https://calendar.google.com/calendar/render?" + p.toString();
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  // RFC 5545 line folding at 75 octets.
  var encoder = new TextEncoder();
  function fold(line) {
    var out = "", bytes = 0;
    for (var ch of line) {
      var b = encoder.encode(ch).length;
      if (bytes + b > 75) { out += "\r\n "; bytes = 1; }
      out += ch;
      bytes += b;
    }
    return out;
  }

  // RFC 5545 calendar text, or null when the start is missing. Times are
  // written in UTC, so the event lands at the right instant everywhere.
  function buildIcs(event, nowMs) {
    var start = toInstant(event.startsAt, event.timeZone);
    if (start === null) return null;
    var end = toInstant(event.endsAt, event.timeZone);
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Enveloped//Invitation//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + icsEscape(event.id) + "-" + utcStamp(start) + "@enveloped.invitation",
      "DTSTAMP:" + utcStamp(nowMs === undefined ? Date.now() : nowMs),
      "DTSTART:" + utcStamp(start)
    ];
    if (end !== null) lines.push("DTEND:" + utcStamp(end));
    lines.push("SUMMARY:" + icsEscape(event.title));
    if (location(event)) lines.push("LOCATION:" + icsEscape(location(event)));
    if (event.description) lines.push("DESCRIPTION:" + icsEscape(event.description));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  var api = {
    DEFAULT_TIME_ZONE: DEFAULT_TIME_ZONE, MAP_HOSTS: MAP_HOSTS, toInstant: toInstant, countdown: countdown, formatCountdown: formatCountdown,
    describeStart: describeStart, safeHttpsUrl: safeHttpsUrl, verifiedMapsUrl: verifiedMapsUrl, googleCalendarUrl: googleCalendarUrl, buildIcs: buildIcs
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EnvelopedEvents = api;
})(typeof window !== "undefined" ? window : this);
