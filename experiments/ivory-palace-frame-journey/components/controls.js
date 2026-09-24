/*
 * Enveloped invitation interface components (reusable; plain JS, no
 * framework). Appearance comes from theme tokens (styles.css, class
 * .theme-ivory-palace); behaviour lives here.
 *
 *   InvitationUtilityControls  Music / Gallery / Share (upper right)
 *   JourneyNavigationControls  Previous / Next rail (middle right)
 *   EventCountdownStrip        per-event name + live countdown + actions
 *   LocationAction             per-event "open in Maps"
 *   CalendarAction             per-event Google Calendar / .ics menu
 *
 * Depends on window.EnvelopedIcons and window.EnvelopedEvents.
 */
(function () {
  "use strict";

  var Icons = window.EnvelopedIcons;
  var Events = window.EnvelopedEvents;

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
      if (k === "className") node.className = attrs[k];
      else node.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    if (html) node.innerHTML = html;
    return node;
  }

  // Reusable icon button: accessible name, tooltip, 44px minimum target.
  function iconButton(opts) {
    var b = el("button", { type: "button", className: "invite-control " + (opts.className || ""), "aria-label": opts.label, "data-tooltip": opts.tooltip || opts.label });
    b.innerHTML = '<span class="invite-control__icon">' + Icons.svg(opts.icon, opts.size || 20) + "</span>";
    if (opts.disabled) b.disabled = true;
    return b;
  }
  function setIcon(button, name, size) {
    button.querySelector(".invite-control__icon").innerHTML = Icons.svg(name, size || 20);
  }
  function setLabel(button, label) {
    button.setAttribute("aria-label", label);
    button.setAttribute("data-tooltip", label);
  }

  function openExternal(url) {
    var w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) w.opener = null;
    return w;
  }

  // Discreet status feedback (no browser alerts).
  function createFeedback(host) {
    var node = el("div", { className: "invite-feedback", role: "status", "aria-live": "polite" });
    host.appendChild(node);
    var timer = null;
    return function (message, kind) {
      clearTimeout(timer);
      node.textContent = message;
      node.setAttribute("data-kind", kind || "info");
      node.classList.add("is-shown");
      timer = setTimeout(function () {
        node.classList.remove("is-shown");
      }, 2600);
    };
  }

  // ---------------- InvitationUtilityControls ----------------

  function galleryDestination(g) {
    if (!g || !g.url || typeof g.url !== "string") return null;
    if (/^\/(?!\/)/.test(g.url)) return { url: g.url, external: false };
    var safe = Events.safeHttpsUrl(g.url, g.allowedHosts || null);
    return safe ? { url: safe, external: true } : null;
  }

  function shareUrl(cfg) {
    if (cfg.url) return Events.safeHttpsUrl(cfg.url) || location.origin + location.pathname;
    var u = new URL(location.href);
    ["review", "demo"].forEach(function (k) { u.searchParams.delete(k); });
    if (!cfg.preservePersonalizedUrl) return u.origin + u.pathname;
    return u.href;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = el("textarea", { readonly: true, "aria-hidden": "true", className: "invite-offscreen" });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function InvitationUtilityControls(host, config) {
    var feedback = createFeedback(host.closest(".invite-controls") || host);
    var storageKey = "enveloped:" + config.invitationId + ":music";

    // Music: starts muted; plays only after a deliberate user gesture.
    var music = iconButton({ className: "invite-control--music", icon: "music", label: "Play music", tooltip: "Play music" });
    music.setAttribute("aria-pressed", "false");
    var audio = null, playing = false;
    var src = config.music && config.music.src;
    if (!src) {
      music.disabled = true;
      setLabel(music, "Music unavailable");
      music.removeAttribute("aria-pressed");
    }
    function readPref() { try { return sessionStorage.getItem(storageKey); } catch { return null; } }
    function writePref(v) { try { sessionStorage.setItem(storageKey, v); } catch { /* storage blocked: session memory only */ } }
    function render() {
      music.setAttribute("aria-pressed", playing ? "true" : "false");
      music.classList.toggle("is-active", playing);
      setIcon(music, playing ? "volume-2" : "music");
      setLabel(music, playing ? "Pause music" : "Play music");
    }
    function play() {
      if (!audio) {
        audio = new Audio(src);
        audio.loop = true;
        audio.preload = "none";
      }
      return audio.play().then(function () {
        playing = true;
        render();
      }, function () {
        playing = false;
        render();
        feedback("Tap the music button to play", "info");
      });
    }
    function pause() {
      if (audio) audio.pause();
      playing = false;
      render();
    }
    if (src) {
      music.addEventListener("click", function () {
        if (playing) { pause(); writePref("off"); }
        else { writePref("on"); play(); }
      });
      // Remembered "on" for this session: resume only on the next user
      // gesture (never autoplay).
      if (readPref() === "on") {
        var resume = function (e) {
          window.removeEventListener("pointerdown", resume, true);
          window.removeEventListener("keydown", resume, true);
          if (!music.contains(e.target) && readPref() === "on" && !playing) play();
        };
        window.addEventListener("pointerdown", resume, true);
        window.addEventListener("keydown", resume, true);
      }
    }

    // Gallery: configurable destination; disabled when none is verified.
    var dest = galleryDestination(config.gallery);
    var gallery = iconButton({ className: "invite-control--gallery", icon: "image", label: dest ? "Open photo gallery" : "Gallery unavailable" });
    if (!dest) gallery.disabled = true;
    else gallery.addEventListener("click", function () {
      if (dest.external) openExternal(dest.url);
      else location.assign(dest.url);
    });

    // Share: Web Share API, else copy the link.
    var shareCfg = config.share || {};
    var share = iconButton({ className: "invite-control--share", icon: "share-2", label: "Share invitation" });
    if (shareCfg.enabled === false) { share.disabled = true; setLabel(share, "Sharing unavailable"); }
    share.addEventListener("click", function () {
      var url = shareUrl(shareCfg);
      var data = { title: shareCfg.title, text: shareCfg.text, url: url };
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        navigator.share(data).then(function () {
          feedback("Invitation shared", "success");
        }, function (err) {
          if (err && err.name === "AbortError") return; // user cancelled: stay quiet
          copyText(url).then(function () { feedback("Link copied", "success"); }, function () { feedback("Couldn't share the link", "error"); });
        });
        return;
      }
      copyText(url).then(function () { feedback("Link copied", "success"); }, function () { feedback("Couldn't copy the link", "error"); });
    });

    host.appendChild(music);
    host.appendChild(gallery);
    host.appendChild(share);
    return {
      music: music, gallery: gallery, share: share,
      state: function () { return { playing: playing, musicEnabled: !music.disabled, galleryEnabled: !gallery.disabled, galleryUrl: dest && dest.url, shareUrl: shareUrl(shareCfg) }; }
    };
  }

  // ---------------- JourneyNavigationControls ----------------

  function JourneyNavigationControls(prev, next) {
    prev.innerHTML = '<span class="invite-control__icon">' + Icons.svg("chevron-up", 22) + "</span>";
    next.innerHTML = '<span class="invite-control__icon">' + Icons.svg("chevron-down", 22) + "</span>";
    prev.setAttribute("data-tooltip", "Previous chapter");
    next.setAttribute("data-tooltip", "Next chapter");
    return {
      // interactive: at rest on a stop. Endpoints stay visible but disabled.
      update: function (interactive, index, count) {
        [prev, next].forEach(function (b) { b.classList.toggle("is-visible", interactive); });
        prev.disabled = !interactive || index <= 0;
        next.disabled = !interactive || index >= count - 1;
      },
      hide: function () {
        [prev, next].forEach(function (b) { b.classList.remove("is-visible"); b.disabled = true; });
      }
    };
  }

  // ---------------- LocationAction ----------------

  function LocationAction(event) {
    var url = Events.verifiedMapsUrl(event);
    var b = iconButton({ className: "event-action event-action--location", icon: "map-pin", size: 18,
      label: url ? "Open " + event.title + " location in Maps" : event.title + " location not yet available" });
    if (!url) b.disabled = true;
    else b.addEventListener("click", function () { openExternal(url); });
    return b;
  }

  // ---------------- CalendarAction ----------------

  var openMenu = null;
  function closeMenu(returnFocus) {
    if (!openMenu) return;
    var m = openMenu;
    openMenu = null;
    m.menu.hidden = true;
    m.button.setAttribute("aria-expanded", "false");
    if (returnFocus) m.button.focus();
  }
  document.addEventListener("pointerdown", function (e) {
    if (openMenu && !openMenu.wrap.contains(e.target)) closeMenu(false);
  }, true);

  function CalendarAction(event, boundary) {
    var google = Events.googleCalendarUrl(event);
    var icsUrl = event.calendar && Events.safeHttpsUrl(event.calendar.icsUrl);
    var hasIcs = !!(icsUrl || Events.toInstant(event.startsAt, event.timeZone) !== null);
    var available = !!(google || hasIcs);
    var wrap = el("div", { className: "event-calendar" });
    var menuId = "calendar-menu-" + event.id;
    var b = iconButton({ className: "event-action event-action--calendar", icon: "calendar-days", size: 18,
      label: available ? "Add " + event.title + " to calendar" : event.title + " date not yet available" });
    wrap.appendChild(b);
    if (!available) {
      b.disabled = true;
      return wrap;
    }
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", menuId);
    var menu = el("div", { className: "event-calendar__menu", role: "menu", id: menuId, "aria-label": event.title + " calendar options", hidden: true });
    var items = [];
    if (google) {
      var g = el("a", { role: "menuitem", className: "event-calendar__item", href: google, target: "_blank", rel: "noopener noreferrer", tabindex: "-1" },
        Icons.svg("calendar-plus", 16) + "<span>Google Calendar</span>");
      g.addEventListener("click", function () { closeMenu(false); });
      items.push(g);
    }
    if (hasIcs) {
      var i = el("button", { type: "button", role: "menuitem", className: "event-calendar__item", tabindex: "-1" },
        Icons.svg("download", 16) + "<span>Apple / Outlook (.ics)</span>");
      i.addEventListener("click", function () {
        var href = icsUrl, revoke = null;
        if (!href) {
          var blob = new Blob([Events.buildIcs(event)], { type: "text/calendar;charset=utf-8" });
          href = URL.createObjectURL(blob);
          revoke = href;
        }
        var a = el("a", { href: href, download: event.id + ".ics", className: "invite-offscreen" });
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (revoke) setTimeout(function () { URL.revokeObjectURL(revoke); }, 1000);
        closeMenu(true);
      });
      items.push(i);
    }
    items.forEach(function (it) { menu.appendChild(it); });
    wrap.appendChild(menu);

    function position() {
      // Open above the strip, right-aligned; keep inside the invitation.
      menu.style.left = "";
      menu.style.right = "0px";
      menu.classList.remove("opens-down");
      var box = boundary().getBoundingClientRect();
      var r = menu.getBoundingClientRect();
      if (r.top < box.top + 4) menu.classList.add("opens-down");
      r = menu.getBoundingClientRect();
      if (r.left < box.left + 4) { menu.style.right = "auto"; menu.style.left = "0px"; }
    }
    function open() {
      closeMenu(false);
      menu.hidden = false;
      b.setAttribute("aria-expanded", "true");
      openMenu = { wrap: wrap, menu: menu, button: b };
      position();
      items[0].focus();
    }
    b.addEventListener("click", function () {
      if (openMenu && openMenu.menu === menu) closeMenu(true);
      else open();
    });
    b.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); open(); }
    });
    menu.addEventListener("keydown", function (e) {
      var idx = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); items[(idx + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); items[(idx - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === "Tab") { closeMenu(false); }
    });
    return wrap;
  }

  // ---------------- EventCountdownStrip ----------------

  var CAP = '<svg class="event-strip__cap-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 2.5l3.2 5.3L21.5 12l-6.3 4.2L12 21.5l-3.2-5.3L2.5 12l6.3-4.2z" fill="var(--strip-paper)" stroke="currentColor" stroke-width="1.1"/>' +
    '<circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';

  function EventCountdownStrip(event, boundary) {
    var target = Events.toInstant(event.startsAt, event.timeZone);
    var strip = el("div", { className: "event-strip", role: "group", "aria-label": event.title, "data-event": event.id });
    strip.innerHTML =
      '<span class="event-strip__cap event-strip__cap--start">' + CAP + "</span>" +
      '<span class="event-strip__name"></span><span class="event-strip__rule" aria-hidden="true"></span>' +
      '<span class="event-strip__time"><span class="event-strip__count" aria-hidden="true"><span class="count-full"></span><span class="count-compact"></span></span>' +
      '<span class="invite-offscreen event-strip__desc"></span></span>' +
      '<span class="event-strip__rule" aria-hidden="true"></span><span class="event-strip__actions"></span>' +
      '<span class="event-strip__cap event-strip__cap--end">' + CAP + "</span>";
    strip.querySelector(".event-strip__name").textContent = event.title;
    strip.querySelector(".event-strip__desc").textContent = Events.describeStart(event);
    var actions = strip.querySelector(".event-strip__actions");
    actions.appendChild(LocationAction(event));
    actions.appendChild(el("span", { className: "event-strip__rule", "aria-hidden": "true" }));
    actions.appendChild(CalendarAction(event, boundary));
    var full = strip.querySelector(".count-full"), compact = strip.querySelector(".count-compact");
    var timer = null;

    function tick() {
      var c = Events.countdown(target, Date.now());
      strip.setAttribute("data-state", c.state);
      if (c.state === "running") {
        full.textContent = Events.formatCountdown(c, false);
        compact.textContent = Events.formatCountdown(c, true);
      } else {
        var t = c.state === "completed" ? "Celebrating now" : "Date to be announced";
        full.textContent = t;
        compact.textContent = t;
        if (c.state !== "running") stop();
      }
      return c;
    }
    function start() {
      stop();
      var c = tick();
      if (c.state !== "running") return;
      // Align to the next whole second, then tick every second. Each tick
      // recomputes from the absolute target, so tab suspension cannot drift.
      timer = setTimeout(function loop() {
        tick();
        if (strip.getAttribute("data-state") === "running") timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
      }, 1000 - (Date.now() % 1000) + 5);
    }
    function stop() {
      clearTimeout(timer);
      timer = null;
    }
    function onVisibility() { if (!document.hidden && timer !== null) start(); }
    document.addEventListener("visibilitychange", onVisibility);
    tick();
    return {
      element: strip, start: start, stop: stop, tick: tick,
      isTicking: function () { return timer !== null; },
      destroy: function () { stop(); document.removeEventListener("visibilitychange", onVisibility); strip.remove(); }
    };
  }

  window.EnvelopedControls = {
    InvitationUtilityControls: InvitationUtilityControls,
    JourneyNavigationControls: JourneyNavigationControls,
    EventCountdownStrip: EventCountdownStrip,
    LocationAction: LocationAction,
    CalendarAction: CalendarAction,
    closeMenus: function () { closeMenu(false); }
  };
})();
