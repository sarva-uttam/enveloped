(() => {
  "use strict";

  var TOTAL_FRAMES = 300;
  // Source clip is ~10.0s / 300 frames ≈ 30fps. The opening (frames 1-80)
  // plays at this real, constant rate rather than an eased ramp, so it
  // reads as normal video playback instead of "speeding up".
  var SOURCE_FPS = 30;

  var prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Chapter stops. Index 0 ("Welcome") is reached by the automatic
  // opening playback; there is no earlier stop to return to from it.
  var CHAPTERS = [
    { frame: 80, label: "Welcome" },
    { frame: 160, label: "Haldi" },
    { frame: 240, label: "Wedding" },
    { frame: 300, label: "Finale" }
  ];

  function pad3(n) {
    return String(n).padStart(3, "0");
  }
  function frameSrc(i) {
    return "frames/ezgif-frame-" + pad3(i) + ".jpg";
  }

  // ---------- DOM refs ----------
  var app = document.getElementById("app");
  var canvas = document.getElementById("frameCanvas");
  var ctx = canvas.getContext("2d");
  var loader = document.getElementById("loader");
  var navUp = document.getElementById("navUp");
  var navDown = document.getElementById("navDown");
  var stageEl = document.querySelector(".stage");
  var frameBox = document.getElementById("frameBox");

  app.hidden = false;

  // ---------- Sliding decoded-frame cache ----------
  //
  // ROOT CAUSE OF THE FLICKER (diagnosed via CDP screencast + frame
  // brightness analysis, in an earlier pass): swapping <img>.src on
  // every frame is not an atomic paint — the fix was to paint via
  // ctx.drawImage() from an already-decoded, retained HTMLImageElement,
  // confirmed ready via .decode() rather than the `load` event. That
  // part is unchanged here.
  //
  // What changed: the previous version retained *every* decoded frame
  // forever (up to ~1GB of raw bitmap data for all 300 frames). This
  // instead keeps a small sliding window of decoded frames centered on
  // the current position — pre-decoding ahead of travel before it's
  // needed, and releasing frames once they fall well behind — so the
  // same zero-flicker guarantee holds with a small, bounded memory
  // footprint. Timing, easing, stop frames and controls are untouched;
  // only *which frames stay decoded in memory* changed.
  var FRAME_BYTES_ESTIMATE = 720 * 1280 * 4; // ~3.52MB/frame, worst-case RGBA
  var MAX_CACHED_FRAMES = 36; // ~127MB decoded — under the 150MB target
  var WINDOW_AHEAD_MOVING = 20; // ~660ms of lead time at 30fps
  var WINDOW_BEHIND_MOVING = 10;
  var WINDOW_RADIUS_IDLE = 16; // symmetric: either direction could come next

  var imageCache = new Map(); // frameIndex -> decoded HTMLImageElement
  var requested = new Set(); // frames with a decode currently in flight
  var windowLo = 1;
  var windowHi = 1;

  // Read-only introspection for testing/debugging; no functional effect.
  window.__cacheStats = function () {
    return {
      cachedFrames: imageCache.size,
      windowLo: windowLo,
      windowHi: windowHi,
      estimatedMB: (imageCache.size * FRAME_BYTES_ESTIMATE) / (1024 * 1024)
    };
  };

  function preload(i) {
    if (i < 1 || i > TOTAL_FRAMES) return;
    if (requested.has(i) || imageCache.has(i)) return;
    requested.add(i);
    var im = new Image();
    im.src = frameSrc(i);
    var markReady = function () {
      requested.delete(i);
      // Only cache it if it's still inside the window we actually want.
      // A decode that resolves after the window has already slid past
      // this frame (e.g. a fast reversal) gets discarded here instead
      // of quietly re-inflating memory we just freed.
      if (i >= windowLo && i <= windowHi) {
        imageCache.set(i, im);
      }
    };
    if (im.decode) {
      im.decode().then(markReady).catch(function () {
        // Some browsers reject decode() for edge cases; fall back to
        // the load event so the frame still ends up cached correctly.
        if (im.complete) markReady();
      });
    } else {
      im.onload = markReady;
    }
  }

  // Keeps exactly [lo, hi] decoded and evicts everything outside it.
  // Called before a transition starts (pre-decode ahead of movement)
  // and continuously as currentFrame advances (slides with playback).
  function maintainWindow(lo, hi) {
    lo = Math.max(1, lo);
    hi = Math.min(TOTAL_FRAMES, hi);
    windowLo = lo;
    windowHi = hi;
    for (var i = lo; i <= hi; i++) preload(i);
    imageCache.forEach(function (_img, key) {
      if (key < lo || key > hi) imageCache.delete(key);
    });
  }

  // direction: +1 moving forward, -1 moving backward, 0 idle (unknown
  // next direction, so keep a symmetric buffer covering either).
  function slideWindowFor(center, direction) {
    var lo, hi;
    if (direction > 0) {
      lo = center - WINDOW_BEHIND_MOVING;
      hi = center + WINDOW_AHEAD_MOVING;
    } else if (direction < 0) {
      lo = center - WINDOW_AHEAD_MOVING;
      hi = center + WINDOW_BEHIND_MOVING;
    } else {
      lo = center - WINDOW_RADIUS_IDLE;
      hi = center + WINDOW_RADIUS_IDLE;
    }
    maintainWindow(lo, hi);
  }

  // ---------- Canvas sizing ----------
  // The canvas backing store is sized to the frame-box's actual device
  // pixels (CSS size × devicePixelRatio) so painting stays crisp; CSS
  // stretches nothing since the backing resolution already matches.
  function resizeCanvas() {
    var rect = frameBox.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    var img = imageCache.get(currentFrame);
    if (img) drawFrame(img); // repaint immediately; never leave it blank
  }
  window.addEventListener("resize", resizeCanvas, { passive: true });
  resizeCanvas();

  // Single atomic paint. No clearRect: every source frame is an opaque,
  // full-bleed JPEG that overwrites all canvas pixels on its own, so a
  // separate clear step would only add a second (unnecessary) canvas
  // operation with no benefit — and one more place a gap could sneak in.
  function drawFrame(img) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // ---------- Frame rendering ----------
  var currentFrame = 1;
  var firstPaintDone = false;

  // Returns true if it actually painted. If the target frame isn't
  // decoded yet (should be rare — the sliding window pre-decodes ~20
  // frames ahead of travel before a frame is ever needed), it kicks off
  // decoding and leaves the current frame on screen rather than showing
  // anything blank; the caller (animateFrameStepped) simply retries
  // next tick. `direction` (+1/-1/0) slides the decode window to stay
  // ahead of wherever playback is actually heading.
  function renderFrame(index, direction) {
    index = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(index)));
    if (index === currentFrame && firstPaintDone) return true;
    var img = imageCache.get(index);
    if (!img) {
      preload(index);
      return false;
    }
    currentFrame = index;
    drawFrame(img);
    firstPaintDone = true;
    if (!canvas.classList.contains("is-ready")) {
      canvas.classList.add("is-ready");
      loader.setAttribute("data-hidden", "true");
    }
    slideWindowFor(index, direction || 0);
    if (window.__frameLog) window.__frameLog.push([index, performance.now()]);
    return true;
  }

  // ---------- Frame-stepping animation ----------
  //
  // Every transition plays for its exact real-time duration at the
  // source's rate (frames / 30fps): 80 frames = 2666.7ms, 60 frames =
  // 2000ms. At that duration, 30fps is already the *average* rate needed
  // to show every frame once — there is no time budget left over for a
  // true ease curve to run faster through the middle without exceeding
  // 30fps. So instead of interpolating-and-rounding a continuous eased
  // position (which is what caused skipped frames before, since a fast
  // mid-curve position can jump several integer frames between two
  // screen refreshes), this steps through every integer frame exactly
  // once, one at a time, and only ever advances once BOTH:
  //   (a) at least FLOOR_GAP_MS has passed since the last frame (this is
  //       the hard 30fps ceiling — never violated, by construction), and
  //   (b) the eased curve's ideal position has reached that next frame
  //       (this holds the first/last few frames very slightly longer
  //       than the floor, which is what reads as ease-in/ease-out).
  // The result: zero skipped frames, never faster than 30fps, and a
  // genuine (if necessarily gentle) ease at the edges. Because the ease
  // needs time the flat 30fps schedule doesn't have, total duration ends
  // up a little longer than the bare frames/30fps figure — never
  // shorter, and never runs at more than 30fps to compensate.
  var FLOOR_GAP_MS = 1000 / 30;

  function linear(t) {
    return t;
  }
  // Gentle ease: a blend of linear and cubic ease-in-out (30% ease
  // weight). A full cubic ease-in-out has a peak speed 3x the average,
  // which would demand far more "extra" time at the edges than a fixed
  // real-time budget has room for. This blend keeps a clearly perceptible
  // slow-in/slow-out without ballooning the total duration.
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function gentleEase(t) {
    var w = 0.3;
    return (1 - w) * t + w * easeInOutCubic(t);
  }

  var isAnimating = false;
  var lockUntil = 0;

  function animateFrameStepped(targetFrame, duration, easingFn, onDone) {
    var startFrame = currentFrame;
    var delta = targetFrame - startFrame;
    if (delta === 0) {
      renderFrame(targetFrame, 0);
      if (onDone) onDone();
      return;
    }
    var direction = delta > 0 ? 1 : -1;

    // Pre-decode ahead of movement, before the first tick — the window
    // is already sliding in the right direction the instant travel
    // starts, not just once the first frame happens to render.
    slideWindowFor(currentFrame, direction);

    isAnimating = true;
    var animStart = null;
    var lastCommitElapsed = 0;

    function idealPosition(elapsed) {
      var t = Math.min(1, elapsed / duration);
      return startFrame + easingFn(t) * delta;
    }

    function step(ts) {
      if (animStart === null) {
        animStart = ts;
        lastCommitElapsed = 0;
      }
      var elapsed = ts - animStart;

      if (currentFrame === targetFrame) {
        isAnimating = false;
        lockUntil = Date.now() + 350; // absorb wheel/touch momentum tail
        if (onDone) onDone();
        return;
      }

      var floorOk = elapsed - lastCommitElapsed >= FLOOR_GAP_MS;
      var nextInt = currentFrame + direction;
      var pos = idealPosition(elapsed);
      var easeWantsAdvance = direction > 0 ? pos >= nextInt : pos <= nextInt;
      // Safety catch-up: never stall short of the target — once we're
      // past the nominal duration, advance at the floor rate (still
      // never faster than 30fps) until every remaining frame is shown.
      var overtime = elapsed > duration;

      if (floorOk && (easeWantsAdvance || overtime)) {
        var painted = renderFrame(nextInt, direction); // always exactly one frame, never skips
        // Only reset the floor timer on an actual paint — if the target
        // frame wasn't decoded yet, renderFrame() left the current
        // frame on screen and we retry next tick rather than losing an
        // extra floor-interval waiting on a frame that never painted.
        if (painted) lastCommitElapsed = elapsed;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Real-time duration at the source rate: frames / 30fps. Identical
  // formula for the opening and every chapter transition — this IS the
  // source video's own pace, not an arbitrary UI timing.
  function realTimeDuration(fromFrame, toFrame) {
    if (prefersReducedMotion) return 1;
    var frames = Math.abs(toFrame - fromFrame);
    return (frames / SOURCE_FPS) * 1000;
  }

  // ---------- Stop surfaces ----------
  //
  // Presentation-only layers above the canvas (see METHOD §11). At the
  // Welcome, Haldi and Wedding stops a mist-edged ivory paper layer fades
  // in once the target frame has landed; the Finale instead dissolves the
  // whole invitation into warm light. The visual state is one attribute,
  // frameBox[data-surface] = "none" | "mist" | "finale"; CSS owns every
  // fade. Leaving a stop clears the surface first and only then starts
  // frame travel, so no surface is ever visible while the palace moves.
  var FINALE_INDEX = CHAPTERS.length - 1;

  function cssMs(name) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v) ? 0 : v;
  }

  function enterSurface(index) {
    frameBox.setAttribute("data-surface", index === FINALE_INDEX ? "finale" : "mist");
  }

  function leaveSurface(onCleared) {
    var current = frameBox.getAttribute("data-surface");
    frameBox.setAttribute("data-surface", "none");
    if (current !== "mist" && current !== "finale") {
      onCleared();
      return;
    }
    // CSS transitions reverse from the current opacity, so leaving
    // mid-entrance never jumps; waiting the full exit time guarantees
    // the surface has cleared before the first frame moves.
    setTimeout(onCleared, cssMs(current === "finale" ? "--finale-exit-ms" : "--mist-exit-ms"));
  }

  // Read-only introspection for testing/debugging; no functional effect.
  window.__overlayState = function () {
    var mist = document.getElementById("stopMist");
    var light = document.getElementById("finaleLight");
    return {
      surface: frameBox.getAttribute("data-surface"),
      mistOpacity: parseFloat(getComputedStyle(mist).opacity),
      finaleOpacity: parseFloat(getComputedStyle(light).opacity),
      mistTransform: getComputedStyle(mist).transform,
      frame: currentFrame,
      chapterIndex: chapterIndex,
      isAnimating: isAnimating
    };
  };

  // ---------- Chapter state machine ----------
  // -1 = not yet arrived at "Welcome" (opening autoplay in progress).
  var chapterIndex = -1;

  function updateNavVisibility() {
    var interactive = chapterIndex >= 0 && !isAnimating;
    navUp.classList.toggle("is-visible", interactive && chapterIndex > 0);
    navDown.classList.toggle(
      "is-visible",
      interactive && chapterIndex < CHAPTERS.length - 1
    );
  }

  function goToChapter(index) {
    if (index < 0 || index >= CHAPTERS.length) return;
    if (index === chapterIndex) return;
    // isAnimating guards every input source against overlapping
    // transitions. lockUntil is checked by the wheel/touch handlers
    // themselves (below) to absorb momentum tails; deliberate clicks
    // and key presses aren't gated by it.
    if (isAnimating) return;

    // Hide arrows immediately while animating (isAnimating flips true
    // inside animateFrameTo, so don't rely on updateNavVisibility here).
    navUp.classList.remove("is-visible");
    navDown.classList.remove("is-visible");
    // Lock every input source from this moment, not only once frames
    // start moving: the stop surface dissolves first.
    isAnimating = true;
    leaveSurface(function () {
      var target = CHAPTERS[index].frame;
      var duration = realTimeDuration(currentFrame, target);
      animateFrameStepped(target, duration, gentleEase, function () {
        chapterIndex = index;
        // At rest: symmetric window, since we don't yet know whether the
        // next move will be forward or backward.
        slideWindowFor(target, 0);
        updateNavVisibility();
        enterSurface(index);
      });
    });
  }

  function advance() {
    if (chapterIndex < 0) return; // still in opening autoplay
    goToChapter(chapterIndex + 1);
  }
  function retreat() {
    if (chapterIndex < 0) return;
    goToChapter(chapterIndex - 1);
  }

  // ---------- Input: buttons ----------
  navDown.addEventListener("click", advance);
  navUp.addEventListener("click", retreat);

  // ---------- Input: keyboard ----------
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      advance();
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      retreat();
    }
  });

  // ---------- Input: wheel (desktop trackpad/mouse) ----------
  var WHEEL_THRESHOLD = 4;
  window.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      if (isAnimating || Date.now() < lockUntil) return;
      if (e.deltaY > WHEEL_THRESHOLD) advance();
      else if (e.deltaY < -WHEEL_THRESHOLD) retreat();
    },
    { passive: false }
  );

  // ---------- Input: touch swipe ----------
  // Explicit spec: a downward swipe (finger moves down) advances;
  // an upward swipe (finger moves up) returns.
  var touchStartY = null;
  var SWIPE_THRESHOLD = 40;

  stageEl.addEventListener(
    "touchstart",
    function (e) {
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  stageEl.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault(); // no native scroll/bounce
    },
    { passive: false }
  );

  stageEl.addEventListener(
    "touchend",
    function (e) {
      if (touchStartY === null) return;
      if (isAnimating || Date.now() < lockUntil) {
        touchStartY = null;
        return;
      }
      var endY = e.changedTouches[0].clientY;
      var deltaY = endY - touchStartY;
      touchStartY = null;
      if (deltaY > SWIPE_THRESHOLD) advance(); // downward swipe
      else if (deltaY < -SWIPE_THRESHOLD) retreat(); // upward swipe
    },
    { passive: true }
  );

  // ---------- Boot: preload + opening autoplay (frames 1 -> 80) ----------
  // Pre-decode ahead of the opening before it starts moving.
  slideWindowFor(1, 1);

  function beginOpening() {
    // Normal-speed playback, not an eased ramp: this is the "video",
    // frames 1-80, at the source clip's real ~30fps pace.
    var duration = realTimeDuration(1, CHAPTERS[0].frame);
    animateFrameStepped(CHAPTERS[0].frame, duration, linear, function () {
      chapterIndex = 0;
      slideWindowFor(CHAPTERS[0].frame, 0);
      updateNavVisibility();
      enterSurface(0);
    });
  }

  // Wait until frame 1 is actually decoded (not just requested) before
  // painting it and starting the opening — same "never paint until
  // ready" guarantee as every other frame.
  function waitForFirstFrame() {
    if (renderFrame(1, 1)) {
      setTimeout(beginOpening, 250);
    } else {
      requestAnimationFrame(waitForFirstFrame);
    }
  }
  waitForFirstFrame();
})();
