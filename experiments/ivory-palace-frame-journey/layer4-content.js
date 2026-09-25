/*
 * Layer 4 wording placement — centralized content and layout data.
 *
 * Placement checkpoint (NOT Owner-approved): coordinates, reading order
 * and motion are under review; typography, fonts and colours are not
 * decided. All geometry is % of the portrait invitation box (the frame
 * box), never of the ivory panel.
 *
 * Every zone is independently configurable:
 *   id, stop (frame), role, top/width/height (%), enter ("up" | "left" |
 *   "right"), enterOrder, exitOrder, lines[] (text + optional lang),
 *   source (where the wording comes from), status, reviewColor.
 * kind: "text" (a wording container), "symbol" (an associated symbol
 * placed between wording, e.g. the nuptial knot; positioned by centerY),
 * "ornament" (an image-only zone, e.g. the stop-300 enclosures) or
 * "slot" (an empty future decorative-asset slot: no content, no motion).
 * Symbols and ornaments are Owner-approved transparent PNGs used as is.
 *
 * status values:
 *   "catalogue-approved"     exact Owner-approved catalogue wording
 *   "catalogue-provisional"  approved catalogue alternative; the choice of
 *                            this particular alternative is provisional
 *   "sample-data"            fictional repository sample identity/event data
 *   "placeholder"            temporary review text, not approved wording
 *   "pending-review"         wording still under Owner/cultural review
 *   "owner-approved-asset"   an Owner-approved symbol or ornament image
 *   "component"              an interactive component zone (event strips)
 *   "slot"                   intentionally empty
 */
(function () {
  "use strict";

  // Reading order is the listed order of the animated zones (text, symbol,
  // ornament); exitOrder is its reverse. Slots have no order.
  function stop(frame, zones) {
    var n = zones.filter(function (z) { return z.kind !== "slot"; }).length;
    var k = 0;
    return zones.map(function (z) {
      z.stop = frame;
      z.kind = z.kind || "text";
      if (z.kind !== "slot") {
        k += 1;
        z.enterOrder = k;
        z.exitOrder = n - k + 1;
      } else {
        z.enterOrder = null;
        z.exitOrder = null;
      }
      return z;
    });
  }

  var SANSKRIT = [{ text: "ॐ श्री गणेशाय नमः", lang: "sa" }];
  // Owner-approved crimson Ganesha symbol: always paired with the mantra,
  // centred above it inside the sacred-opening zone (stops 160 and 240).
  var GANESHA = { src: "assets/symbols/symbol-ganesha-crimson.png", width: 1151, height: 1128, alt: "Ganesha" };
  var KNOT = { src: "assets/symbols/symbol-nuptial-knot-charcoal.png", width: 1715, height: 852, alt: "" };
  var ENCLOSURE_UPPER = { src: "assets/symbols/enclosure-e2-upper.png", width: 2027, height: 498, alt: "" };
  var ENCLOSURE_LOWER = { src: "assets/symbols/enclosure-e2-lower.png", width: 1974, height: 500, alt: "" };

  window.IVORY_LAYER4_CONTENT = {
    version: 1,
    status: "placement-checkpoint-pending-owner-review",
    zones: [].concat(
      stop(80, [
        { id: "intro-heading", role: "couple-heading", top: 20.5, width: 30, height: 8.5, enter: "up",
          lines: [{ text: "Mihika & Tanish" }], source: "sample identity (catalogue.sample: Mihika Rajan, Tanish Narayan)", status: "sample-data", reviewColor: "#d0021b" },
        { id: "intro-message", role: "romantic-opening", top: 35.5, width: 60, height: 17.5, enter: "up",
          lines: [{ text: "Life brought them together; love gave them a reason to stay." }],
          source: "wording/welcome/romantic-openings ivory.welcome.romantic.009 (replaces the superseded 'Destiny brought them together…')", status: "catalogue-provisional", reviewColor: "#1f5fd6" }
      ]),
      stop(160, [
        { id: "haldi-sacred-opening", role: "sacred-invocation", top: 15.7, width: 36, height: 9.5, enter: "up",
          lines: SANSKRIT, symbol: GANESHA, source: "catalogue invocation ganesha-salutation", status: "pending-review", reviewColor: "red" },
        { id: "haldi-title", role: "ceremony-title", top: 25.2, width: 49, height: 6.5, enter: "up",
          lines: [{ text: "Rang De Haldi" }], source: "wording/haldi/titles HT-06", status: "catalogue-approved", reviewColor: "blue" },
        { id: "haldi-introduction", role: "introduction", top: 32.1, width: 63, height: 5, enter: "left",
          lines: [{ text: "A celebration painted in love, laughter and Haldi" }], source: "Owner brief (no exact catalogue match; 100 approved HI alternatives exist)", status: "placeholder", reviewColor: "yellow" },
        { id: "haldi-hosts", role: "hosts", top: 37.4, width: 48, height: 4.3, enter: "right",
          lines: [{ text: "Arvind and Meera Rajan" }], source: "sample identity (HOSTS.md: no prejoined Mr/Mrs ampersand token)", status: "sample-data", reviewColor: "green" },
        { id: "haldi-invitation", role: "invitation-lead", top: 41.7, width: 62, height: 5, enter: "left",
          lines: [{ text: "warmly invite you to the Haldi ceremony of their daughter" }], source: "wording/haldi/host-structures HS-01", status: "catalogue-approved", reviewColor: "yellow" },
        { id: "haldi-bride-name", role: "honouree-name", top: 46.9, width: 30, height: 7.7, enter: "up", name: true,
          lines: [{ text: "Mihika" }], source: "sample identity", status: "sample-data", reviewColor: "darkgreen" },
        { id: "haldi-date-time", role: "date-time", top: 55, width: 70, height: 10, enter: "right",
          lines: [{ text: "Saturday · 22 August 2026 · 6:30 PM" }], source: "sample event (catalogue.sample.events.haldi)", status: "sample-data", reviewColor: "black" },
        { id: "haldi-venue", role: "venue", top: 65.6, width: 33, height: 8.8, enter: "left",
          lines: [{ text: "Magnolia Hall, Greenview Gardens, Vacoas" }], source: "sample event (repository sample also includes Harmony Road)", status: "sample-data", reviewColor: "purple" },
        // Fit correction (Owner-authorised): width clamp(144px, 46%, 280px) in CSS, height 4.5%.
        { id: "haldi-closing-note", role: "welcome-line", top: 75.3, width: 46, widthCss: "clamp(144px, 46%, 280px)", height: 4.5, enter: "up",
          lines: [{ text: "Bring your smile and a touch of yellow." }], source: "wording/haldi/welcome-lines HW-031 (closest approved match to the brief)", status: "catalogue-provisional", reviewColor: "orange" }
      ]),
      stop(240, [
        { id: "wedding-sacred-opening", role: "sacred-invocation", top: 15, width: 36, height: 10, enter: "up",
          lines: SANSKRIT, symbol: GANESHA, source: "catalogue invocation ganesha-salutation", status: "pending-review", reviewColor: "red" },
        { id: "wedding-title", role: "ceremony-title", top: 25.3, width: 40, height: 6.2, enter: "up",
          lines: [{ text: "Vivah Vidhi" }], source: "wording/wedding/titles WT-11 (approved spelling; brief had 'Vivaha Vidhi')", status: "catalogue-approved", reviewColor: "blue" },
        { id: "wedding-grandparents", role: "elder-blessing", top: 31.6, width: 64, height: 7, enter: "left",
          lines: [{ text: "With the blessings of our grandparents" }, { text: "Mahendra and Kamini Rajan" }],
          source: "wording/wedding/elders WE-01 + sample names; 'Late Mr Harish & Mrs Shanta Devi' withheld (ELDERS.md: relationship and living status unconfirmed)", status: "pending-review", reviewColor: "yellow" },
        { id: "wedding-hosts", role: "hosts", top: 38.6, width: 65, height: 4.4, enter: "right",
          lines: [{ text: "Arvind and Meera Rajan" }], source: "sample identity", status: "sample-data", reviewColor: "green" },
        { id: "wedding-invitation", role: "invitation-lead", top: 43, width: 65, height: 6, enter: "left",
          lines: [{ text: "request the pleasure of your company at the wedding of their daughter" }], source: "wording/wedding/invitations WI-02", status: "catalogue-approved", reviewColor: "purple" },
        { id: "wedding-bride-name", role: "bride-name", top: 49, width: 30, height: 5.8, enter: "up", name: true, group: "wedding-couple-names",
          lines: [{ text: "Mihika" }], source: "sample identity", status: "sample-data", reviewColor: "black" },
        // Relationship symbol between the names: centred on the 50% axis, at
        // the midpoint between the bride zone's bottom (54.8%) and the groom
        // zone's top (55.8%). Not inside either name box.
        { id: "wedding-nuptial-knot", kind: "symbol", role: "nuptial-knot", centerY: 55.3, enter: "fade-up", group: "wedding-couple-names",
          lines: [], image: KNOT, source: "Owner-approved warm-charcoal nuptial-knot symbol", status: "owner-approved-asset", reviewColor: "#8b5a2b" },
        { id: "wedding-groom-name", role: "groom-name", top: 55.8, width: 30, height: 5.8, enter: "up", name: true, group: "wedding-couple-names",
          lines: [{ text: "Tanish" }], source: "sample identity", status: "sample-data", reviewColor: "black" },
        { id: "wedding-groom-lineage", role: "parentage", top: 61.6, width: 64, height: 3.2, enter: "right",
          lines: [{ text: "Son of Rajesh and Kavita Narayan" }], source: "wedding/REVIEW-NOTES.md sample line", status: "sample-data", reviewColor: "#f4c2d7" },
        { id: "wedding-date-time", role: "date-time", top: 65, width: 65, height: 7.5, enter: "left",
          lines: [{ text: "Sunday · 23 August 2026 · 1:15 PM" }], source: "sample event (catalogue.sample.events.wedding)", status: "sample-data", reviewColor: "orange" },
        { id: "wedding-venue", role: "venue", top: 72.6, width: 40, height: 7.8, enter: "right",
          lines: [{ text: "Magnolia Hall, Greenview Gardens, Vacoas" }], source: "sample event", status: "sample-data", reviewColor: "#ff4fa3" },
        { id: "wedding-guest-note", role: "gift-preference", top: 80.8, width: 38, height: 3.3, enter: "up",
          lines: [{ text: "No gift boxes please" }], source: "wedding/REVIEW-NOTES.md exact approved gift sentence (brief had 'No boxed gifts, please')", status: "catalogue-approved", reviewColor: "cyan" }
      ]),
      stop(300, [
        { id: "closing-enclosure-top", kind: "ornament", role: "enclosure-upper", top: 34, width: 60, height: 4, enter: "fade",
          lines: [], image: ENCLOSURE_UPPER, source: "Owner-approved E2 upright upper enclosure", status: "owner-approved-asset", reviewColor: "black" },
        { id: "closing-appreciation", role: "presence-line", top: 38.7, width: 60, height: 9.2, enter: "up", slow: true,
          lines: [{ text: "Your presence will be highly appreciated." }], source: "wording/finale FP-01", status: "catalogue-approved", reviewColor: "red" },
        { id: "closing-family", role: "compliments", top: 49.4, width: 60, height: 9.8, enter: "up", slow: true,
          lines: [{ text: "Best Compliments From:" }, { text: "Rajan & Narayan Family" }], source: "wording/finale fixed label + familyDisplayTemplate (sample surnames)", status: "catalogue-approved", reviewColor: "blue" },
        { id: "closing-enclosure-bottom", kind: "ornament", role: "enclosure-lower", top: 60.3, width: 60, height: 4, enter: "fade",
          lines: [], image: ENCLOSURE_LOWER, source: "Owner-approved E2 vertically inverted lower enclosure (dedicated PNG; no CSS flip)", status: "owner-approved-asset", reviewColor: "black" },
        // Event strips (Haldi, Wedding): EventCountdownStrip components built
        // from invitation-config.js events. Below the lower enclosure; width
        // 76% (min 272px on narrow phones), height from the strips themselves.
        { id: "closing-events", kind: "component", component: "event-strips", role: "event-strips", top: 71.9, width: 76, height: null, enter: "up",
          lines: [], source: "approved final-frame interface mockup; data from invitation-config.js events", status: "component", reviewColor: "#b8860b" }
      ])
    )
  };
})();
