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
- **Every chapter journey** (80→160, 160→240, 240→300, and the same
  in reverse): `cinematicEase`, a custom velocity curve (below). It
  leaves a stop extremely slowly, accelerates gradually, cruises
  moderately faster mid-journey, decelerates over a long glide and lands
  gently on the exact destination frame.

**Opening duration**: `realTimeDuration()` computes
`(frameCount / 30) * 1000`, the source clip's own pace (80 frames ≈
2.67s).

**Journey duration**: `journeyDuration()` is 5.2s per 80 frames, with a
4.5s floor, so the 60-frame finale leg takes 4.5s rather than a
proportional 3.9s and leaves and lands just as gently.

**The cinematic velocity curve** (`cinematicEase`, normalised time
`t ∈ [0, 1]`). Speed is a fraction of the cruising speed:

| Phase | Time | Speed | Share of travel |
|---|---|---|---|
| Accelerate | 0–25% | `V0 → 1` along a smoothstep (`3s² − 2s³`) | 18.8% |
| Cruise | 25–70% | `1` (the moderately faster middle) | 58.7% |
| Decelerate | 70–100% | `1 → V0` along the mirrored smoothstep | 22.5% |

`V0 = 0.15`, so the first and last frames keep moving gently instead
of holding for a long beat. Position is the exact integral of that
speed, normalised to run 0 → 1. Speed and position are continuous
everywhere, so there is no speed jump when movement begins and no
abrupt braking. The peak speed is 1.305× the average.

For an 80-frame, 5.2s leg, that means:

- cruise ≈ 20 fps;
- about 3 fps at the very start (the first frame moves about 270ms in);
- measured roughly 9 fps across the first four frames, 20 fps
  mid-journey, and 5.6 fps across the last four;
- peak acceleration about 20 fps/s.

The 4.5s finale leg cruises at about 18 fps. The curve never
approaches the 30fps ceiling, so the ceiling never shapes the motion.
Every integer frame is still shown exactly once.

**Why frame-stepping, not interpolate-and-round**: `animateFrameStepped()`
walks through every integer frame exactly once, advancing only when
*both* (a) at least `1000/30`ms (`FLOOR_GAP_MS`) has passed since the
last paint — a hard, structural 30fps ceiling — and (b) the eased
curve's ideal position has reached that next integer frame. This
guarantees zero skipped frames by construction: the loop can only ever
move the display forward (or back) by exactly one frame per commit,
never round a fast mid-curve position past several integers at once.

History: journeys originally ran at exactly `frames/30fps` (≈2.67s per
80 frames) with `gentleEase`, a 30%-weighted blend of linear and cubic
ease-in-out. That left almost no room for a speed curve, because 30fps
was already the average rate. It read as rapid, nearly constant motion,
so the Owner asked for the slower cinematic curve above. The longer
duration is what gives the curve room under the 30fps ceiling.

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
  Since §11 it is raised the moment a stop is left (while its surface
  dissolves), not only once frames start moving.
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
  to 1ms (an effective instant cut) rather than the eased ramp. Stop
  surfaces keep their states with short opacity-only crossfades (§11).

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
every property in §5–§9 and §11, printing a `PASS`/`FAIL` line per check.

```sh
# From the repo root. Requires the `playwright` package (already a
# devDependency of the parent repo) and python3 on PATH.
node experiments/ivory-palace-frame-journey/verify.js
```

Expected output ends with `ALL CHECKS PASSED` and exit code `0`. As of
§11 there are 84 checks:

- the original journey checks: landing, skips and the 30fps ceiling on
  every transition, plus the measured cinematic speed profile (slow
  start, faster middle, long glide, bounded acceleration) on every leg
  in both directions;
- arrow visibility, the memory budget and 36-frame cap, flicker, and
  the mobile swipe;
- the stop-surface checks: rest state at every stop in both directions,
  no surface during travel (per-animation-frame sampling), no opacity
  jumps, measured fade-in and fade-out timing, rapid-input bursts at
  rest, during the fade-in (ignored), mid-exit and mid-travel, the full-box finale light, the reverse from 300, and the
  measured panel geometry, 85% fill and clear frame exterior;
- seven responsive viewports;
- reduced motion;
- the empty, inert wording layer, with none of the 348 approved
  catalogue sentences present in the page.

Set `VERIFY_SHOTS=<dir>` to also save one screenshot per viewport.

**Manual local preview** (same server, for visual review):

```sh
cd experiments/ivory-palace-frame-journey
python3 -m http.server 4521 --bind 127.0.0.1
# open http://127.0.0.1:4521/
```

## 11. Framed ivory stop panels (approved visual baseline)

**Status: the approved visual baseline, pending the Owner's final review
of the running prototype.** No invitation wording is displayed. The
stop surfaces are presentation layers above the canvas. They are never
baked into, and never require regenerating, the 300 frames.

History: first a smoky, mist-edged rectangle, then a smooth oval mist,
then a first framed panel using a lotus-vine frame. All three are
superseded by the cusped-arch frame below. Their styling, code and
assets have been removed.

### Owner-approved treatment

- **Frames 80, 160 and 240** show the Owner-approved ivory-and-gold
  **cusped Mughal-arch frame** (pillared sides, lattice corner
  spandrels, lotus finials) over a warm ivory-white inner panel at
  **85% opacity**, so the palace stays faintly visible through the
  centre.
- The complete framed panel keeps the artwork's own **941 × 1672**
  ratio. It is centred and as large as fits within **90% × 90%** of the
  invitation box (`width: min(90cqw, 90cqh × 941/1672)`), so it reaches
  90% on whichever side limits it and is never stretched. The
  invitation is 9:16, the same as the artwork, on desktop and tablet
  (90% × 90% exactly). On tall phones the invitation box is taller than
  9:16, so the panel is 90% wide and about 72–74% tall.
- **Frame 300** keeps its distinct, previously approved full-box
  warm-light ending, unchanged.

### Frame assets

- `experiments/ivory-palace-frame-journey/assets/ivory-palace-arch-frame.png`
  is the frame artwork: a 941 × 1672 RGBA PNG, ~0.57MB.
- **Provenance:** the Owner-supplied frame artwork. As delivered, its
  PNG had an alpha channel but was **fully opaque, on a flat black
  matte** (every pixel alpha 255). The transparency was therefore
  derived: "unmultiply black" with a knee `K = 120`, so
  `α = min(1, max(r,g,b) / K)` and `rgb = rgb / α`, and near-black matte
  noise (`max ≤ 4`) becomes fully transparent. Composited back over
  black, the result reproduces the delivered image to within 4/255 per
  channel. The gold and ivory bodies are fully opaque; only the thin
  anti-aliased and glow edges are translucent. 85.2% of pixels are
  fully transparent, 13.6% fully opaque and 1.2% partial. The lattice
  openings are transparent, so the palace shows through them.
- `experiments/ivory-palace-frame-journey/assets/ivory-palace-arch-frame-opening.png`
  is the fill mask (941 × 1672, ~7KB): white, with alpha only where
  the ivory fill may appear. It was derived from the same source by
  flood-filling the dark matte from the centre, which gives exactly the
  cusped-arch and curved-corner opening (62.8% of the artwork, 8–92% ×
  6–91%, with no leak to the exterior). The opening was then grown by
  4px so the fill tucks under the inner gold line, and softened by a
  0.6px blur.
- Both files are encoded losslessly. For the frame, the re-decoded
  pixels were checked to equal the encoded buffer exactly.
- If a natively transparent original becomes available, replace the
  frame file at the same path. Regenerate the opening mask only if the
  frame's inner line moves.

### Implementation

- `#stopPanel` is one element that fades as a unit. Inside it:
  1. `.stop-panel__fill`, the rgba(253, 249, 241, 0.85) ivory fill,
     masked by the opening mask at `100% 100%` of the panel. It fills
     exactly the arch-shaped opening. The arch spandrels, lattice
     corners and transparent exterior margin stay clear.
  2. `#stopFrameArt`, the frame PNG, drawn at the panel's exact size.
  3. `#stopContent`, the reserved wording layer.
- The opening mask is preloaded (`<link rel="preload">`). Before the
  first fade-in, the script waits for `HTMLImageElement.decode()` of both
  the artwork and the mask, so the panel never appears without either. A
  surface token stops a late decode from re-showing a panel after its
  stop has been left.
- The visual state is a single attribute,
  `#frameBox[data-surface] = "none" | "panel" | "finale"`. CSS owns every
  fade. `script.js` only sets the attribute and reads the exit
  durations from CSS custom properties.

### Visual layer order (inside `.frame-box`)

1. animated palace background (frame canvas);
2. warm ivory-white inner panel, 85% opaque (`.stop-panel__fill`);
3. transparent ivory-and-gold frame (`#stopFrameArt`);
4. reserved live-wording layer (`#stopContent`);
5. navigation controls, above everything, with a darker fill while a
   surface is shown.

The finale light shares level 2 but is never shown at the same time as
the panel. No surface receives pointer events.

### Timing

| Transition | Duration | Easing |
|---|---|---|
| Panel entrance | 1800ms opacity | `cubic-bezier(0.39, 0.575, 0.565, 1)` (very soft sine ease-out) |
| Panel exit | 1400ms opacity | `cubic-bezier(0.42, 0, 1, 1)` (gentle ease-in) |
| Journey between stops | 5.2s per 80 frames; 4.5s for the 60-frame finale leg | `cinematicEase` (§5) |
| Finale fade to light | 1200ms | `cubic-bezier(0.4, 0, 0.2, 1)` (unchanged) |
| Finale dissolve (leaving 300) | 800ms | `ease-in-out` (unchanged) |
| Reduced motion | 220 / 180 / 260 / 180ms | same states, short crossfades |

Measured by `verify.js` from per-animation-frame sampling: each
entrance reaches full opacity after about 1.73s. The first frame moves
about 1.72s after a departure begins: the 1.4s fade-out, then the
journey's own gentle first step. Frame, fill and reserved wording layer
fade together as one group (`#stopPanel`).

The panel fades by opacity only. There is no scale, so the ornament
detail never resamples mid-transition.

### Sequences

- **Arrival at a stop:** the camera travel completes and lands exactly on
  the target frame. `animateFrameStepped` finishes (the canvas stops),
  the chapter state updates, and only then is `data-surface` set to
  `panel` (after the artwork has decoded), so the fade begins. No
  surface ever appears during travel. Every input source stays locked
  until the 1.8s fade-in has completed, so the entrance cannot be
  interrupted or doubled. The navigation controls appear once the panel
  has settled. The finale is unchanged: its controls return on landing.
- **Leaving a stop** (any input, either direction): all input is locked
  at once (`isAnimating = true`), `data-surface` returns to `none`, and
  the journey waits the full exit duration (1400ms, or 800ms from the
  finale). Only then does frame travel start, and it unlocks through the
  existing state machine. The first moved frame is at least a further
  33ms later, so the panel is fully cleared before the background moves.
  Input is ignored for the whole exit and travel, and (at panel stops)
  until the next fade-in completes.
- **Backward from 300:** the light dissolves and reveals frame 300, then
  the reverse journey runs to 240, where the framed panel returns.

### Reserved wording layer

`<section id="stopContent" hidden inert>` sits inside the panel, above
the frame art. It is empty, hidden and inert in this phase, so it has
no focus targets and no screen-reader output. It does not import or
select catalogue wording. Its text-safe region is inset 18% from the
top (below the arch's shoulders at about 20%), 12% from the bottom and
14% from the sides of the panel, inside the frame's clear opening
(about 8–92% × 6–91% of the artwork), with padding. It
therefore scales with the panel and never reaches the ornaments.

### Responsive results

Measured by `verify.js` at frame 80:

| Viewport | Invitation box | Framed panel | Share of viewport |
|---|---|---|---|
| 320×568 narrow mobile | 320×568 | 288×511 (90.0% × 90.0%) | 89.9vw × 90.0vh |
| 390×844 standard mobile | 390×844 | 351×624 (90.0% × 73.9%) | 90.0vw × 73.9vh |
| 360×800 tall mobile | 360×800 | 324×576 (90.0% × 72.0%) | 90.0vw × 72.0vh |
| 412×915 tall mobile | 412×915 | 371×659 (90.0% × 72.0%) | 90.0vw × 72.0vh |
| 768×1024 tablet portrait | 576×1024 | 518×921 (90.0% × 89.9%) | 67.5vw × 89.9vh |
| 900×1400 desktop portrait | 788×1400 | 709×1259 (90.0% × 90.0%) | 78.8vw × 90.0vh |
| 1440×900 desktop landscape | 506×900 | 456×810 (90.0% × 90.0%) | 31.6vw × 90.0vh |

At every size:

- the ratio stays 0.5628 (the artwork's ratio);
- the centre measures 85.0% opacity from pixels;
- the artwork's exterior margin, the arch spandrels and the box outside
  the panel are untouched;
- there is no overflow;
- the controls stay hit-testable.

## Files

```
experiments/ivory-palace-frame-journey/
├── index.html      # canvas, framed stop panel, reserved wording layer, finale light, loader, nav buttons
├── styles.css       # fixed 9:16 stage, stop-surface layers and timings, nav styling
├── script.js        # sliding cache, canvas renderer, frame-stepped easing, input, stop-surface hook
├── verify.js         # reproducible Playwright verification (§10)
├── assets/
│   ├── ivory-palace-arch-frame.png          # Owner-approved stop frame artwork (§11)
│   └── ivory-palace-arch-frame-opening.png  # fill mask: the frame's clear opening (§11)
├── mist/
│   └── paper-grain.svg      # paper grain tile used by the frame-300 finale light
├── wording/          # approved wording catalogue (not displayed yet)
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
