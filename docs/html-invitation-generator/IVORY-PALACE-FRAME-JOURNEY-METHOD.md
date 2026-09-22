# Ivory Palace — Frame Journey: Method

**Status: experimental prototype. Not wired into production.** Lives at
`experiments/ivory-palace-frame-journey/` on branch
`experiment/ivory-palace-frame-journey`, isolated from
`src/` and every Next.js route. This document records exactly how it
works and how it was verified, so the method can be reused or
re-derived without re-discovering the same failure modes.

## What this is

A 300-frame, chapter-stop scroll/swipe-free "video" experience: a
single AI-generated ~10-second cinematic clip, split into 300 JPEG
frames, played back in a mobile-first 9:16 canvas with four fixed
narrative stops (Welcome / Haldi / Wedding / Finale) that the viewer
steps between with a button, keyboard, wheel, or swipe — never free
scrubbing.

## 1. Source generation

The source video was generated with Google Gemini using the following
prompt, verbatim:

```
Create a 10-second, 30 FPS, vertical 9:16 cinematic animation in a luxurious painterly 3D Indian wedding world.

Use one continuous, physically forward-moving camera shot:

- 0–2 seconds: closed ornate ivory palace doors open symmetrically INWARD, away from the camera.
- 2–5 seconds: the camera moves slowly through a richly decorated Haldi ceremony area.
- 5–8 seconds: the camera approaches and passes beneath an elaborate Hindu wedding mandap.
- 8–10 seconds: the camera enters a calm ivory terrace that gradually becomes softly luminous and heavenly white, then stops.

The Haldi area must be clearly visible and unmistakable: abundant marigold garlands, mango leaves, yellow and saffron fabric, turmeric bowls, brass vessels, flower-filled brass urlis, ceremonial trays, traditional low seating, yellow cushions and marigold petals. Keep it luxurious and organized.

The wedding mandap must be separate and visually distinct, with carved ivory pillars, burgundy-and-ivory drapery, roses, jasmine, antique-gold ornaments, brass lamps, ceremonial vessels and a small, stable sacred fire.

Maintain one continuous palace environment. Every object must already exist naturally in the scene before the camera reaches it. Nothing may suddenly appear, disappear, teleport, transform or change position.

Use genuine forward camera travel with correct parallax—not lens zooming. Keep the camera centred, level and at human eye height. Slow down while passing the Haldi area and again while approaching the mandap.

Style: premium painterly 3D diorama, warm ivory architecture, matte antique gold, deep burgundy, restrained botanical green and soft golden light. Romantic and regal, not photorealistic or childish.

No people, text, letters, logos, watermark or interface elements. No cuts, crossfades, glitches, morphing, melting, flickering, duplicated objects, warped pillars, changing architecture, unstable fire, camera shake, sideways movement, blank frames or abrupt lighting changes. Keep every frame sharp and consistent. Do not add blur.

End on a stable, symmetrical, softly glowing white-and-ivory composition with subtle palace architecture and generous empty space—not a blank white screen.

Export exactly 10 seconds, 30 FPS, vertical 1080 × 1920 minimum, MP4 H.264, highest available quality.
```

The resulting MP4 (`Create_a_second_FPS_ve (2).mp4`) measures, per its
own `moov`/`mvhd` header, `timescale=1000`, `duration=10006` →
**10.006s**. At 300 extracted frames that's **≈29.98fps** — effectively
30fps, matching the prompt's export spec.

## 2. Frame extraction

The MP4 was split into individual JPEG frames using
[ezgif.com](https://ezgif.com)'s video-to-frames tool (one frame per
source frame, no downsampling). Output:

- 300 files, named `ezgif-frame-001.jpg` … `ezgif-frame-300.jpg`
  (zero-padded to 3 digits)
- 720×1280 px each (exact 9:16), baseline JPEG
- ~9.5MB total, ~32KB average per frame

Frames live unaltered at `experiments/ivory-palace-frame-journey/frames/`.
**They were never resized, recompressed, or edited** — every fix in
this document is purely playback-engine work.

To regenerate from a new source clip: export at 30fps (or whatever the
`SOURCE_FPS` constant in `script.js` is updated to match), split to
individual frames with the same 3-digit zero-padded naming, and drop
them into `frames/` in place of the existing set.

## 3. Chapter stop frames

Four stops were chosen by visually inspecting the extracted sequence
(sampling every ~20 frames, then narrowing on the transition
boundaries) and matching them to the four narrative beats the prompt
asked for:

| Chapter | Frame | What's on screen |
|---|---|---|
| Welcome | **80** | Doors fully open, revealing the Haldi space beyond |
| Haldi | **160** | Deep inside the marigold-and-saffron pavilion, ceremonial fire visible |
| Wedding | **240** | Inside the rose-and-burgundy mandap, beside the sacred fire |
| Finale | **300** | The final frame — soft, luminous ivory terrace |

These are hardcoded in `script.js` as `CHAPTERS`:

```js
var CHAPTERS = [
  { frame: 80,  label: "Welcome" },
  { frame: 160, label: "Haldi" },
  { frame: 240, label: "Wedding" },
  { frame: 300, label: "Finale" }
];
```

## 4. Canvas rendering (and why it isn't an `<img>`)

The visible frame is drawn to a `<canvas id="frameCanvas">` inside a
`.frame-box` sized to an exact `aspect-ratio: 9/16` box (`height:100%`
on wide/desktop screens pillarboxes without stretching; `max-width:100%`
on narrow/tall mobile screens lets height shrink to fit — same 9:16
artwork, never cropped or distorted either way).

- **Sizing**: the canvas backing store (`canvas.width`/`canvas.height`)
  is set to `frame-box`'s CSS size × `devicePixelRatio`, recomputed on
  resize, so painting stays crisp regardless of screen density.
- **Painting**: one call, `ctx.drawImage(img, 0, 0, canvas.width, canvas.height)`,
  from an already-decoded `HTMLImageElement`. **No `clearRect`** — every
  source frame is an opaque, full-bleed JPEG that overwrites every
  canvas pixel on its own, so a separate clear step adds a second
  operation with zero benefit (and one more place a timing gap could
  sneak in).
- **Decode confirmation**: frames are only considered "ready" once
  `HTMLImageElement.decode()` resolves — not the `load` event, which
  only means bytes finished downloading, not that pixels are decoded
  and paint-ready.

This replaced an earlier version that swapped `<img src=>` directly.
See §6 for why that had to change.

## 5. Easing and timing

Two motion modes, both driven by the same `animateFrameStepped()`
engine, differing only in the easing function passed in:

- **Opening (frames 1→80)**: `linear` easing — constant real-time
  speed, matching the source clip's own pace. Reads as normal video
  playback, not an animated ramp.
- **Every chapter transition** (80→160, 160→240, 240→300, and the
  same in reverse): `gentleEase`, a 30%-weighted blend of linear and
  cubic ease-in-out (`(1-0.3)*t + 0.3*easeInOutCubic(t)`). Accelerates
  away from a stop, decelerates into the next.

**Duration**: `realTimeDuration()` computes `(frameCount / 30) * 1000`
— the exact real-time playback duration at the source's own frame
rate. 80-frame transitions ≈ 2666.7ms nominal, 60-frame ≈ 2000ms
nominal. Measured actual durations run a little longer (~3.5s / ~2.7s)
because genuine easing needs slack time a flat 30fps schedule doesn't
have — see the derivation in §7's "speed" sub-thread below.

**Why frame-stepping, not interpolate-and-round**: `animateFrameStepped()`
walks through every integer frame exactly once, advancing only when
*both* (a) at least `1000/30`ms (`FLOOR_GAP_MS`) has passed since the
last paint — a hard, structural 30fps ceiling — and (b) the eased
curve's ideal position has reached that next integer frame. This
guarantees zero skipped frames by construction: the loop can only ever
move the display forward (or back) by exactly one frame per commit,
never round a fast mid-curve position past several integers at once.

At exactly `frames/30fps` duration, 30fps is already the *average*
rate needed to show every frame once — there's no slack for the middle
of an ease curve to run faster than the edges without breaking the
30fps ceiling. `gentleEase`'s 30% weight (rather than a full cubic,
whose peak speed is 3× the average) was chosen specifically to keep
the "extra" time this demands modest — a clearly perceptible ease
without ballooning total duration.

A "safety catch-up" (`overtime` flag) forces advancement at the floor
rate once elapsed time passes the nominal duration, so a transition
can never stall short of its target frame.

## 6. Flicker diagnosis and fix

**Symptom**: frames visibly flashed to black during chapter
transitions.

**Diagnosis method**: rather than guess, this was diagnosed empirically
using Chrome DevTools Protocol screencast (`Page.startScreencast`) to
capture every actually-*composited* frame during a transition — not
periodic `page.screenshot()` polling, which can miss a single-frame
flash entirely. Each captured PNG's average pixel brightness was
computed; a real flash collapses toward the dark `.frame-box`
background color (near-zero), while normal content sits ~90-100 in the
same sampling.

**Result of the diagnosis**: 80 of 193 composited frames (~41%) during
one transition were solid near-black flashes, confirmed visually (a
frame captured mid-transition showing pure black, sandwiched between
two correctly-rendered frames on either side).

**Root cause**: swapping `frameImg.src` on a live `<img>` element is
not an atomic paint. Chromium clears the element's currently-displayed
raster the instant `.src` changes, and only repaints once the new
JPEG's decode completes — a separate, asynchronously-scheduled step
(the `decoding="async"` attribute on the tag made this worse). At a
30fps update rate, that decode routinely lands on a *later* compositor
frame than the clear, exposing the background underneath. Separately,
the original `preload()` created throwaway `Image()` objects with no
retained reference, so even "preloaded" frames paid a fresh decode
cost on every display, increasing the odds of missing a compositor
frame.

**Fix**: replace the `<img>` with a `<canvas>` (§4). Every displayed
frame is now painted via a single synchronous `ctx.drawImage()` from
an already-decoded, retained image — there is no clear-then-wait gap
for the compositor to expose, because the decode already happened
before the paint call, not during it.

**Verification of the fix**: re-ran the identical CDP screencast +
brightness scan. Result: 0 blank frames out of 120 composited frames,
brightness held in a smooth, tight band (95.8–102.2) for the entire
transition — confirmed visually at the same frame indices where the
flash used to occur.

## 7. Decoded-image sliding cache (memory)

An earlier version retained every decoded frame forever — up to ~1GB
of raw bitmap data for all 300 frames (720×1280 RGBA ≈ 3.52MB/frame ×
300). This was replaced with a bounded sliding window.

**Design** (`imageCache: Map<frameIndex, HTMLImageElement>`,
`windowLo`/`windowHi`):

- `slideWindowFor(center, direction)` computes `[lo, hi]`:
  - moving forward (`direction > 0`): `[center-10, center+20]`
  - moving backward (`direction < 0`): `[center-20, center+10]`
  - idle at a chapter stop (`direction === 0`): `[center-16, center+16]`
    (symmetric — the next move's direction isn't known yet)
- `maintainWindow(lo, hi)` decodes anything newly in range and evicts
  (`imageCache.delete`) anything outside it.
- Called (a) **before** a transition's first tick — "pre-decode ahead
  of movement" happens the instant `goToChapter`/`beginOpening` starts,
  not reactively once a frame is first needed — and (b) continuously,
  every time the displayed frame actually changes, so the window slides
  with playback.
- **Race guard**: a decode that resolves *after* the window has already
  slid past that frame (e.g. a fast reversal) is discarded rather than
  quietly re-inflating memory that was just freed — `markReady()`
  checks the frame is still within `[windowLo, windowHi]` before
  caching it.
- If a frame is somehow needed before it's decoded (should be rare
  given ~20 frames / ~660ms of lead time against a measured ~1-2ms
  decode cost), the current frame stays on screen — never blank — and
  the animation loop retries next tick.

**Memory target**: under 150MB decoded. `MAX_CACHED_FRAMES = 36` is
the nominal cap (~127MB at the 3.52MB/frame estimate). Actual peak
observed in testing: **33 frames, ~116MB** (see §8).

The old full-sequence background sweep (which decoded and permanently
retained all 300 frames) was removed entirely — it directly worked
against the memory goal and is unnecessary given the window's own lead
time.

## 8. Controls

| Input | Forward | Backward |
|---|---|---|
| On-screen arrow buttons | tap/click down-arrow | tap/click up-arrow |
| Keyboard | `ArrowDown` / `PageDown` | `ArrowUp` / `PageUp` |
| Desktop wheel/trackpad | scroll down (`deltaY > 4`) | scroll up (`deltaY < -4`) |
| Touch swipe | finger moves **down** (`deltaY > 40px`) | finger moves **up** (`deltaY < -40px`) |

- Native page scroll is fully disabled (`overflow:hidden` on
  `html,body`, no scrollable track) — there is nothing to "doom
  scroll." Wheel/touch are captured with `preventDefault()` and
  reinterpreted as one discrete chapter-step per gesture.
- `isAnimating` blocks every input source during an active transition.
  A separate **350ms momentum lock** (`lockUntil`) applies *only* to
  wheel and touch — it absorbs a trackpad's momentum tail or a
  multi-event touch gesture so one physical swipe can't fire multiple
  chapter jumps. Button clicks and key presses are **not** gated by
  this lock (an earlier version gated everything, which made
  legitimate quick clicks silently fail).
- The down arrow hides at Finale (no further chapter); the up arrow
  hides at Welcome (no earlier chapter). Both re-fade in once the
  landing chapter is known.
- `prefers-reduced-motion: reduce` collapses every transition duration
  to 1ms (an effective instant cut) rather than the eased ramp.

## 9. Tests

All verification was done empirically with Playwright driving real
Chromium, not manual eyeballing:

- **Exact landing + zero-skip**: every frame actually rendered is
  logged (`window.__frameLog`, index + `performance.now()`) via a
  guarded debug hook in `renderFrame()`. Post-transition, the log is
  checked for (a) landing on the exact target frame and (b) zero
  consecutive-frame jumps greater than 1.
- **30fps ceiling**: the minimum gap between any two consecutive
  logged frame timestamps is checked to be ≥ ~30ms (never faster than
  the floor).
- **Flicker**: CDP `Page.startScreencast` + PNG brightness analysis,
  as detailed in §6.
- **Memory**: `window.__cacheStats()` (a guarded, read-only debug hook)
  reports `cachedFrames`/`windowLo`/`windowHi`/`estimatedMB`, sampled
  continuously through a full forward-and-reverse journey and checked
  against the 150MB budget.
- **Controls**: each input path (click, keyboard, wheel, synthetic
  `TouchEvent` swipe) was driven independently and cross-checked, on
  both a desktop viewport (1440×900) and a mobile viewport (390×844,
  `hasTouch: true`, `isMobile: true`).
- **Visual (9:16 presentation)**: screenshots at both viewport sizes
  confirmed the artwork pillarboxes cleanly on wide/desktop screens and
  fills edge-to-edge on mobile, with no stretching either way (ratio
  match between the 720×1280 frames and the `aspect-ratio: 9/16` box).

## 10. Reproduction

A consolidated, reusable verification script lives at
`experiments/ivory-palace-frame-journey/verify.js`. It spins up its
own local static server, drives the page with Playwright, and asserts
every property in §5–§9 above, printing a `PASS`/`FAIL` line per check.

```sh
# From the repo root. Requires the `playwright` package (already a
# devDependency of the parent repo) and python3 on PATH.
node experiments/ivory-palace-frame-journey/verify.js
```

Expected output ends with `ALL CHECKS PASSED` and exit code `0`
(26 checks as of this writing: opening + 3 forward chapters + 3
reverse chapters × landing/skip/fps checks, arrow visibility at both
boundaries, the memory budget, one flicker screencast check, and the
full mobile touch-swipe round trip).

**Manual local preview** (same server, for visual review):

```sh
cd experiments/ivory-palace-frame-journey
python3 -m http.server 4521 --bind 127.0.0.1
# open http://127.0.0.1:4521/
```

## Files

```
experiments/ivory-palace-frame-journey/
├── index.html      # canvas + loader + up/down nav buttons; no scroll track
├── styles.css       # fixed 9:16 stage, canvas fade-in, nav-arrow styling
├── script.js        # sliding cache, canvas renderer, frame-stepped easing, all input handling
├── verify.js         # reproducible Playwright verification (§10)
└── frames/           # 300 unaltered JPEGs, ezgif-frame-001.jpg … ezgif-frame-300.jpg
```

## Large-asset handling

No repository-wide large-asset policy or `.gitattributes`/Git LFS
configuration exists in this repo (checked: no `.gitattributes`
anywhere in the tree, `git lfs` is not installed in this environment).
Existing precedent (`design-library/hindu-wedding/**/*.png`) already
tracks individual binary masters up to ~3-6MB directly in git, well
above any individual frame here. The 300 frames total **9.5MB** (~32KB
average per file) — tracked directly as regular git objects,
consistent with that precedent. If a future source clip is
significantly higher resolution/frame-count and pushes the total well
past current repo norms, Git LFS should be introduced at that point
(`git lfs track "experiments/**/frames/*.jpg"`) rather than retroactively.
