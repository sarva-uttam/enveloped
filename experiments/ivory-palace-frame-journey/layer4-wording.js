/*
 * Layer 4 wording placement controller (placement checkpoint, not
 * Owner-approved). Builds one semantic group per stop from
 * window.IVORY_LAYER4_CONTENT and exposes window.IvoryLayer4 for the
 * journey state machine in script.js:
 *
 *   enter(stopIndex, done)  after Layers 2-3 have settled: fade/slide the
 *                           stop's zones in, in reading order; calls done
 *                           once every zone is at rest.
 *   exit(done)              wording leaves first, in reverse reading order;
 *                           calls done once it is fully cleared.
 *
 * Zones are centred with left: 50% + translateX(-50%) on the zone itself;
 * motion is carried by an inner .wording-motion wrapper so the centring
 * transform is never overwritten. Timings come from CSS custom properties
 * (styles.css) and completion uses timers, never animation events, so
 * content can never be stranded hidden. Review outlines are dev-only:
 * add ?review=wording to the URL.
 */
(function () {
  "use strict";

  var data = window.IVORY_LAYER4_CONTENT;
  var frameBox = document.getElementById("frameBox");
  if (!data || !frameBox) return;

  var STOP_FRAMES = [80, 160, 240, 300];
  var FINALE_INDEX = 3;
  var HEADING_ROLES = { "couple-heading": 1, "ceremony-title": 1 };

  // Decorative/associated image: never intercepts input or selection.
  function makeImage(image, className) {
    var img = document.createElement("img");
    img.className = className;
    img.src = image.src;
    img.width = image.width;
    img.height = image.height;
    img.alt = image.alt;
    img.decoding = "async";
    img.draggable = false;
    if (!image.alt) img.setAttribute("aria-hidden", "true");
    return img;
  }

  function cssMs(name) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v) ? 0 : v;
  }

  // ---- Build the layer ----
  var layer = document.createElement("div");
  layer.className = "wording-layer";
  layer.id = "wordingLayer";
  frameBox.insertBefore(layer, document.getElementById("loader"));

  var components = []; // live components (event strips): ticking only while shown

  var groups = STOP_FRAMES.map(function (frame, index) {
    var group = document.createElement("section");
    group.className = "wording-stop";
    group.setAttribute("data-stop", String(index));
    group.setAttribute("data-frame", String(frame));
    group.setAttribute("data-state", "hidden");
    group.setAttribute("aria-hidden", "true");
    var subgroups = {};
    data.zones
      .filter(function (z) { return z.stop === frame; })
      .forEach(function (z) {
        var isText = z.kind === "text";
        var zone = document.createElement(!isText || z.symbol ? "div" : HEADING_ROLES[z.role] ? "h2" : "p");
        zone.className = "wording-zone" + (isText ? " " + z.id : "") + (z.kind === "symbol" ? " wording-symbol-zone" : "") + (z.kind === "ornament" ? " closing-enclosure" : "") + (z.kind === "component" ? " " + z.id : "");
        zone.id = z.id;
        zone.setAttribute("data-role", z.role);
        zone.setAttribute("data-kind", z.kind);
        if (z.kind === "symbol") {
          zone.style.setProperty("--center-y", z.centerY + "%");
        } else {
          zone.style.setProperty("--top", z.top + "%");
          zone.style.setProperty("--w", z.widthCss || z.width + "%");
          if (z.height !== null) zone.style.setProperty("--h", z.height + "%");
        }
        zone.style.setProperty("--review", z.reviewColor);
        if (z.kind === "slot") {
          zone.setAttribute("aria-hidden", "true");
        } else if (z.kind === "component") {
          var host = document.createElement("div");
          host.className = "wording-motion";
          host.setAttribute("data-enter", z.enter);
          host.style.setProperty("--i", String(z.enterOrder - 1));
          host.style.setProperty("--j", String(z.exitOrder - 1));
          var cfg = window.ENVELOPED_INVITATION_CONFIG;
          if (z.component === "event-strips" && window.EnvelopedControls && cfg) {
            cfg.events.forEach(function (ev) {
              var strip = window.EnvelopedControls.EventCountdownStrip(ev, function () { return frameBox; });
              host.appendChild(strip.element);
              components.push({ stop: frame, api: strip });
            });
          }
          zone.appendChild(host);
        } else if (z.kind === "symbol" || z.kind === "ornament") {
          if (!z.image.alt) zone.setAttribute("aria-hidden", "true");
          var wrap = document.createElement("div");
          wrap.className = "wording-motion" + (z.kind === "ornament" ? " is-slow" : "");
          wrap.setAttribute("data-enter", z.enter);
          wrap.style.setProperty("--i", String(z.enterOrder - 1));
          wrap.style.setProperty("--j", String(z.exitOrder - 1));
          wrap.appendChild(makeImage(z.image, z.kind === "symbol" ? "wedding-nuptial-knot" : "closing-enclosure__art"));
          zone.appendChild(wrap);
        } else {
          // Sacred opening: symbol and mantra move as one semantic unit.
          var motion = document.createElement(z.symbol ? "div" : "span");
          motion.className = "wording-motion" + (z.name ? " is-name" : "") + (z.slow ? " is-slow" : "") + (z.symbol ? " sacred-opening" : "");
          motion.setAttribute("data-enter", z.enter);
          motion.style.setProperty("--i", String(z.enterOrder - 1));
          motion.style.setProperty("--j", String(z.exitOrder - 1));
          var lineHost = motion;
          if (z.symbol) {
            motion.appendChild(makeImage(z.symbol, "sacred-opening__ganesha"));
            lineHost = document.createElement("div");
            lineHost.className = "sacred-opening__mantra";
            motion.appendChild(lineHost);
          }
          z.lines.forEach(function (line) {
            var span = document.createElement("span");
            span.className = "wording-line";
            span.textContent = line.text;
            if (line.lang) span.setAttribute("lang", line.lang);
            lineHost.appendChild(span);
          });
          zone.appendChild(motion);
        }
        // Zones that belong together (bride name, knot, groom name) share a
        // semantic wrapper; the wrapper spans the invitation box, so every
        // zone keeps its approved invitation-relative coordinates.
        if (z.group) {
          if (!subgroups[z.group]) {
            subgroups[z.group] = document.createElement("div");
            subgroups[z.group].className = "wording-subgroup " + z.group;
            group.appendChild(subgroups[z.group]);
          }
          subgroups[z.group].appendChild(zone);
        } else {
          group.appendChild(zone);
        }
      });
    layer.appendChild(group);
    return group;
  });

  if (/[?&]review=wording\b/.test(location.search)) frameBox.classList.add("wording-review");

  // ---- Timing (from CSS custom properties) ----
  function textZones(group) {
    return Array.prototype.slice.call(group.querySelectorAll(".wording-motion"));
  }
  function enterTotal(group) {
    var stagger = cssMs("--wd-stagger-ms");
    return textZones(group).reduce(function (max, m) {
      var dur = m.classList.contains("is-slow") ? cssMs("--wd-slow-enter-ms")
        : m.classList.contains("is-name") ? cssMs("--wd-name-enter-ms") : cssMs("--wd-enter-ms");
      return Math.max(max, parseFloat(m.style.getPropertyValue("--i")) * stagger + dur);
    }, 0) + 40; // +40ms: every zone has fully come to rest before input unlocks
  }
  function exitTotal(group) {
    var n = textZones(group).length;
    // +40ms so the timer never fires before the last CSS fade has finished.
    return n ? (n - 1) * cssMs("--wd-exit-stagger-ms") + cssMs("--wd-exit-ms") + 40 : 0;
  }

  var active = -1;
  var token = 0;

  function enter(index, done) {
    var group = groups[index];
    var t = ++token;
    if (!group) {
      done();
      return;
    }
    // At the finale, Layer 2's equivalent is the full-box light: wait for it.
    var wait = index === FINALE_INDEX ? cssMs("--finale-enter-ms") : 0;
    // Symbols and ornaments are decoded, and the webfonts loaded, before the
    // group appears: no pop-in and no reflow mid-entrance.
    var imgs = Array.prototype.slice.call(group.querySelectorAll("img"));
    var ready = Promise.all(imgs.map(function (im) {
      return im.decode ? im.decode().catch(function () {}) : Promise.resolve();
    }).concat(document.fonts && document.fonts.ready ? [document.fonts.ready.catch(function () {})] : []));
    setTimeout(function () {
      ready.then(start);
    }, wait);
    function start() {
      if (t !== token) return;
      active = index;
      group.setAttribute("data-state", "ready");
      group.setAttribute("aria-hidden", "false");
      group.getBoundingClientRect(); // commit the start state before transitioning
      group.setAttribute("data-state", "in");
      components.forEach(function (c) { if (c.stop === STOP_FRAMES[index]) c.api.start(); });
      setTimeout(function () {
        if (t === token) done();
      }, enterTotal(group));
    }
  }

  function exit(done) {
    var t = ++token;
    var group = groups[active];
    if (!group) {
      done();
      return;
    }
    group.setAttribute("data-state", "out");
    if (window.EnvelopedControls) window.EnvelopedControls.closeMenus();
    components.forEach(function (c) { c.api.stop(); });
    setTimeout(function () {
      group.setAttribute("data-state", "hidden");
      group.setAttribute("aria-hidden", "true");
      active = -1;
      if (t === token) done();
    }, exitTotal(group));
  }

  window.IvoryLayer4 = {
    enter: enter,
    exit: exit,
    components: function () {
      return components.map(function (c) { return { stop: c.stop, event: c.api.element.getAttribute("data-event"), state: c.api.element.getAttribute("data-state"), ticking: c.api.isTicking() }; });
    },
    isShowing: function () {
      return active !== -1;
    },
    // Read-only introspection for testing/debugging; no functional effect.
    state: function () {
      return {
        active: active,
        groups: groups.map(function (g) {
          var max = 0;
          if (g.getAttribute("data-state") === "hidden") return [g.getAttribute("data-state"), 0];
          textZones(g).forEach(function (m) {
            max = Math.max(max, parseFloat(getComputedStyle(m).opacity));
          });
          return [g.getAttribute("data-state"), max];
        })
      };
    }
  };
})();
