/*
 * Invitation interface configuration (reusable across Enveloped HTML
 * invitations; values here are Ivory Palace's). Components read only this
 * object, so destinations, audio and events can be replaced later without
 * editing any visual component.
 *
 * PRODUCTION DEFAULTS ARE DELIBERATELY EMPTY. No audio asset, gallery
 * destination, event date, venue or map URL has been supplied, so the
 * matching controls render in their disabled / "to be announced" states.
 * Nothing here is invented.
 *
 * Review-only demo (never production): add ?demo=controls to the URL to
 * fill the events with relative future times and the repository's
 * fictional sample venue, so the countdown, Location and Calendar actions
 * can be exercised. Tests may set window.__INVITATION_CONFIG_OVERRIDE
 * before this file runs.
 */
(function () {
  "use strict";

  var config = {
    invitationId: "ivory-palace-sample",
    theme: "ivory-palace",
    music: {
      src: null // verified audio URL; null = Music control disabled
    },
    gallery: {
      url: null, // https URL of a view-only album, or a same-origin route ("/gallery/…")
      allowedHosts: null // optional host allowlist for external galleries
    },
    share: {
      enabled: true,
      title: "Ivory Palace — Wedding Invitation",
      text: "You are warmly invited. Please view the invitation.",
      url: null, // explicit canonical share URL; null = the current page
      preservePersonalizedUrl: false // true keeps guest query/hash tokens in the shared link
    },
    events: [
      { id: "haldi", title: "Haldi", startsAt: null, endsAt: null, timeZone: "Indian/Mauritius", venueName: null, venueAddress: null, description: null, mapsUrl: null, calendar: {} },
      { id: "wedding", title: "Wedding", startsAt: null, endsAt: null, timeZone: "Indian/Mauritius", venueName: null, venueAddress: null, description: null, mapsUrl: null, calendar: {} }
    ]
  };

  function merge(target, source) {
    Object.keys(source || {}).forEach(function (k) {
      var v = source[k];
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") merge(target[k], v);
      else target[k] = v;
    });
    return target;
  }

  if (/[?&]demo=controls\b/.test(location.search)) {
    // REVIEW DEMO ONLY: relative times (the repository's fictional sample
    // dates, 22/23 August 2026, are already in the past) and the fictional
    // sample venue from wording/catalogue.json.
    var local = function (msFromNow) {
      var d = new Date(Date.now() + msFromNow);
      return d.toISOString().replace(/\.\d{3}Z$/, "Z");
    };
    var day = 86400000, hour = 3600000, minute = 60000;
    var venue = "Magnolia Hall", address = "Greenview Gardens, Harmony Road, Vacoas";
    var maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(venue + ", " + address + ", Mauritius");
    config.demo = true;
    config.events[0] = merge(config.events[0], { startsAt: local(12 * day + 8 * hour + 24 * minute + 16000), endsAt: local(12 * day + 11 * hour), venueName: venue, venueAddress: address, mapsUrl: maps, description: "Demo event (fictional sample data)." });
    config.events[1] = merge(config.events[1], { startsAt: local(13 * day + 11 * hour + 39 * minute + 42000), endsAt: local(13 * day + 16 * hour), venueName: venue, venueAddress: address, mapsUrl: maps, description: "Demo event (fictional sample data)." });
  }

  if (window.__INVITATION_CONFIG_OVERRIDE) merge(config, window.__INVITATION_CONFIG_OVERRIDE);

  window.ENVELOPED_INVITATION_CONFIG = config;
})();
