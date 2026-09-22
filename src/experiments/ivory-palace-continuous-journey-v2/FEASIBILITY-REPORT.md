# Ivory Palace — Continuous Journey V2: Motion-Feasibility Report

**EXPERIMENTAL — NOT PRODUCTION READY.** Disposable prototype. Not wired into
any route, database, composition schema, or template registry. Does not
replace, modify, or touch `feature/ivory-palace-signature-v1` or the
production `ivory-palace-signature` template package.

## 1. Branch

`experiment/ivory-palace-continuous-journey-v2`, created off
`integration/hindu-wedding-registry-v1`. **Not pushed** — committed locally
only, per instruction to wait for separate push authorization after visual
review.

## 2. Experiment path

`src/experiments/ivory-palace-continuous-journey-v2/`

## 3. Local preview command and URL

```sh
npm test -- src/experiments/ivory-palace-continuous-journey-v2
cd generator-output/ivory-palace-continuous-journey-v2
python3 -m http.server 8744
# http://127.0.0.1:8744/default/index.html
# http://127.0.0.1:8744/long-names/index.html
# http://127.0.0.1:8744/blocked-media/index.html  (assets/ intentionally absent)
```

Append `?t04=A` / `?t04=B` / `?t04=C` to the URL, or use the on-page
"Finale treatment" panel (bottom-right, keyboard-reachable), to switch
between the three T04 treatments without reloading. Use your browser's
DevTools to force `prefers-reduced-motion: reduce` for the static fallback.

## 4. Assets used

From the V2 review package (all 9 manifest assets verified present,
`approvalRule: "No asset is OWNER_APPROVED"` — nothing here is claimed as
Owner-approved anywhere in this experiment):

| Asset | Role |
|---|---|
| `opening/IPCJ-V2-S00-THRESHOLD-MASTER.png` | **Sole** principal world plate, states 0–3 |
| `plates/state-02-haldi/IPCJ-V2-HALDI-LAYER.png` | Haldi pavilion overlay (alpha) |
| `transition-occluders/IPCJ-V2-MANDAP-OCCLUDER.png` | T04 Treatment A (and partial use in C) |
| `finale/foreground/IPCJ-V2-MANDAP-FOREGROUND.png` | T04 Treatment B curtain edges (code-cropped, see §16) |
| `finale/background/IPCJ-V2-FINALE-BACKGROUND.png` | State 4 background |
| `finale/couple-layer/IPCJ-V2-COUPLE-LAYER.png` | State 4 couple overlay (alpha) |

**Not shipped, by design** (core implementation decision): the
`state-01-welcome`, `state-02-haldi` (world master, not the Haldi layer),
and `state-03-wedding` master PNGs — these were used only as camera-framing
*reference* during development, never as separate plates in the shipped
document. `render.test.ts` asserts none of their filenames appear in the
output. `finale/review-composite/IPCJ-V2-FINALE-COUPLE-COMPOSITE.png` is
reference-only and also not shipped.

**Resolution disclosure carried forward**: the package's genuine canonical
source is 941×1672; all "2160×3840" masters used above are deterministic
Lanczos-upscaled enlargements with mild unsharp masking, not native
captures — texture softness is visible on close inspection, most noticeably
on the Haldi and couple alpha layers at their larger derivative size.

## 5. Runtime derivatives created

`scripts/derive-assets.cjs` (sharp) produced 14 derivatives into `assets/`
(source masters read from the external review package, never copied into
the repo at full resolution or modified):

| Source | Width | AVIF | WebP |
|---|---:|---:|---:|
| world-plate | 540 | 63KB | 87KB |
| world-plate | 720 | 98KB | 138KB |
| world-plate | 1080 | 165KB | 234KB |
| haldi-layer (alpha) | 678 | — | 122KB |
| haldi-layer (alpha) | 1356 | — | 379KB |
| mandap-occluder (alpha) | 583 | — | 100KB |
| mandap-occluder (alpha) | 1165 | — | 281KB |
| mandap-foreground (alpha) | 1080 | — | 261KB |
| mandap-foreground (alpha) | 2160 | — | 598KB |
| finale-background | 540 | 60KB | 80KB |
| finale-background | 720 | 92KB | 123KB |
| finale-background | 1080 | 149KB | 194KB |
| couple-layer (alpha) | 512 | — | 99KB |
| couple-layer (alpha) | 1024 | — | 293KB |

Alpha layers ship WebP-only (AVIF alpha support is inconsistent across
target browsers); opaque plates ship AVIF-first with WebP fallback via
`<picture>`. Two derivatives exceed the 100–350KB alpha-layer budget in
`PERFORMANCE-NOTES.md` at their largest requested size (haldi-layer@1356:
379KB, mandap-foreground@2160: 598KB) — both are the largest `sizes`
candidate only, used at narrow rendered widths in practice (`sizes="70vw"`),
so the browser should rarely fetch them; flagged as a real, uncorrected
budget miss rather than silently rounding it down.

Alex Brush (couple names) is **reused** from
`src/lib/html-templates/packages/timeless-editorial-v2/assets/fonts/`
(already self-hosted, OFL-licensed, copied verbatim with its license file).
Cormorant Garamond / Source Sans 3 / Noto Devanagari from `TYPOGRAPHY.md`
were **not** sourced for this prototype — body/display text falls back to
the documented system-font stack (Georgia/serif). This is a deliberate
scope cut for a disposable motion prototype, called out as a known
limitation (§16), not an oversight.

## 6. Motion architecture

One shared, `position: sticky` stage (`.stage-fixed`) holds every visual
layer and every text block as a **singleton** element, sticking to the top
of `#scrolly` for the combined scroll distance of all 5 states and
releasing naturally at the end (no `position: fixed`, no manual
release/hide logic needed). Five invisible spacer `<div>`s (`.state-track`)
provide the scroll distance and, via their own `getBoundingClientRect()`,
each state's local 0–1 progress.

The single world-plate `<img>` is scaled (never cross-faded) by CSS
`transform: scale()` about a fixed `transform-origin: 50% 43%` (the
package's own locked axis point) driven by a per-tick `requestAnimationFrame`
handler. Because the scale is a single shared value, the runtime picks the
"active" state (first track whose local progress hasn't reached 1) each
tick and applies only *its* scale — every other per-track effect (text
opacity, Haldi opacity/parallax, T04 concealment) is safe to compute for
all 5 tracks unconditionally every tick, since each one's own function
already returns its "off" value (0 opacity, etc.) outside its own active
window; see `motion.ts`'s module doc comment for the full reasoning, and
the `worldPlateScale`/`cumulativeScaleAtStateStart` tests in `motion.test.ts`.

**What's real layered parallax vs. simulated on a flat plate**, honestly:

- **Real, distinct-rate parallax**: the Haldi pavilion layer (own
  opacity envelope + its own `translateY`, moving at a different rate
  than the world plate's `scale`).
- **Real depth cue, not parallax**: the world-plate `scale()` push — this
  reads as forward camera movement but is a single flat plate scaling
  around one anchor point, not true multi-plane perspective. The
  package's own `CAMERA-CONTINUITY-PLAN.md` names this same limitation
  for its own crop-based approach ("S00–S03 are still crop-derived rather
  than true multi-plane perspective reconstructions").
- **Simulated, not layered**: State 4's couple layer is a simple fade-in
  over the (also flat) finale background — no independent parallax rate,
  since the package's finale composite is a single forward-cropped plate
  plus one couple alpha layer, not a multi-depth scene.

## 7. Scroll-state mapping

Each state's local progress (0–1) drives, in order: 0–12% settle → 12–20%
text enters → 20–52% hold → 52–62% text exits → 62–90% camera push
(world-plate scale ramps only in this window) → 90–94% switch → 94–100%
next-state settle, exactly the timing curve in `CAMERA-MOTION-SPEC.md`.
State 3's concealment window (T04) is mapped from local progress 0.82–1.0
of state 3 itself (i.e. it starts before the nominal 90% switch point and
completes by the time state 3's spacer is exhausted), which is what lets
the swap be fully resolved by the time the user's scroll position enters
state 4's own spacer.

Reverse scroll: every value is a pure function of the current scroll
position (no accumulated/one-way state), so scrolling back up re-plays the
exact same curve in reverse — verified by scrolling forward then back to a
mid-Haldi position and confirming the Haldi layer and world-plate scale
both returned to their forward-scroll values (screenshot:
`mobile-reverse-scroll-back-to-haldi.png`).

## 8. Finale treatments tested (T04)

All three were built as real, independently switchable code paths (not
mocked), toggled via the on-page panel or `?t04=` query param, sharing the
same `concealmentFrame()` pure function (`motion.ts`, unit-tested for all
three treatments — see "no blank-rectangle reveal at p=0" and
per-treatment coverage/swap-timing tests in `motion.test.ts`).

- **Treatment A — Mandap pass**: the mandap-occluder alpha layer scales
  from a small bottom-foreground silhouette up to full-viewport coverage,
  holds while the background swaps underneath, then recedes. Screenshots:
  `t04-treatment-a-mid.png`, `t04-treatment-a-peak.png`.
- **Treatment B — Curtain edge**: the mandap-foreground alpha layer, split
  into two halves via CSS (left half floated/clipped left, right half
  mirrored via `scaleX(-1)` and floated right — see §16 limitation), slides
  in from both edges to meet at center, holds, then opens back out.
  Screenshots: `t04-treatment-b-mid.png`, `t04-treatment-b-peak.png`.
- **Treatment C — Cinematic light conceal**: a capped (max 0.72 alpha —
  unit-tested to never reach full opacity, i.e. never a white flash) warm
  radial-gradient bloom, combined with a partial (not full-cover) occluder.
  Screenshots: `t04-treatment-c-mid.png`, `t04-treatment-c-peak.png`.

At full concealment ("peak" screenshots, all three), **no blank ivory
rectangle or visible flat boundary appeared in any of the three** — the
background swap consistently landed while coverage/bloom was at its
highest, matching the unit-tested `backgroundSwapped` timing.

## 9. Recommended finale treatment

**Treatment A (Mandap pass), with reservations.** It reads most clearly as
"passing under/through a structure" of the three, and the occluder's own
silhouette (arch + hanging florals) gives it a recognizable shape rather
than an abstract wipe. Treatment B is a close second and visually pleasant,
but its two curtain halves are a **code-composited approximation** from one
single mandap-foreground layer (see §16) rather than a purpose-built
two-piece curtain asset, and it reads slightly more like a deliberate UI
transition than an in-world event. Treatment C is the weakest of the three
in its current form: the capped, restrained bloom is barely perceptible
against the already-warm sunset palette in the mid-transition screenshots,
so in practice it behaves almost identically to a lower-intensity Treatment
A rather than establishing its own distinct "light concealment" identity —
**this is a real, honest limitation, not a treatment that should be
recommended as-is.**

None of the three achieves genuine physical depth/parallax through the
mandap structure itself — this matches the source package's own conclusion
("the canopy proof removes ghosting but still reads more like a designed
transition than proven physical parallax," `V2-CORRECTION-REPORT.md`).

## 10. Mobile results

Tested at 390×844 (Playwright default device metrics close to the
requested 360–430 matrix; full 5-breakpoint sweep was not separately
captured due to time — the layout is percentage/`clamp()`-based throughout
with no fixed pixel breakpoints, so risk of breakage at the untested widths
is low but **not independently verified at 360×800, 393×873, 412×915, or
430×932**, flagged as a real gap, not silently assumed passing). All 5
requested states + both State 3 and State 4 phase pairs captured
(`mobile-s0-threshold.png` through `mobile-s4b-controls.png`). World plate
persists continuously across states 0–3 (the core requirement) after a
structural fix — see §15. No horizontal overflow observed
(`desktopHorizontalOverflow`/curtain-clip checks; `.stage-fixed`'s own
`overflow: hidden` contains the curtain-edge animation). Reverse scroll
confirmed working.

## 11. Desktop results

Tested at 1440×900 (1366×768 and 1920×1080 not independently captured, same
time constraint as above — the centering rule (`max-width: 608px; margin:
0 auto`) is viewport-width-independent so is expected to hold, but this is
inference, not verification, at those two sizes). Confirmed: centered
9:16 stage, no artwork stretching, dark surrounding space, no duplicated
clutter (`desktop-1440-s0.png`, `desktop-1440-s3.png`).
`desktopHorizontalOverflow: false` measured via
`document.documentElement.scrollWidth > clientWidth`.

## 12. Accessibility results

- Reading order: every text block lives in the shared stage in state
  0→1→2→3→4 DOM order, independent of scroll/visual position — a screen
  reader's linear reading order matches the narrative order regardless of
  where the sighted viewport currently is.
- Keyboard: first `Tab` stop is the "View directions" link (confirmed via
  `document.activeElement` after one `Tab` press); `PageDown` scrolls the
  document normally (native browser behavior, no custom key trapping).
  Visible focus (`outline: 3px solid var(--gold)`) on all interactive
  controls (T04 panel buttons, both CTAs).
- `prefers-reduced-motion: reduce`: confirmed via Playwright's
  `reducedMotion: "reduce"` context — `#scrolly` computed `display: none`,
  `#static` computed `display: block` (`reducedMotion.scrollyVisible:
  false`, `staticVisible: true` in the measured results). The static
  fallback is pure CSS-media-query-gated markup, not JS-detected, so it
  also degrades correctly with JavaScript disabled/failed.
  Screenshots: `reduced-motion-top.png`, `reduced-motion-scrolled.png`.
- Decorative vs. meaningful alt text: background/world plates use
  `alt=""`; the finale composite carries the specific alt text from
  `CULTURAL-AND-ACCESSIBILITY-NOTES.md` (asserted in `render.test.ts`).
- Control size: CSS asserts `min-height: 44px` on `.journey-cta`/`.t04-btn`
  (asserted in `render.test.ts`).
- **Not independently verified**: measured WCAG AA contrast ratios on the
  final composited crops (`CULTURAL-AND-ACCESSIBILITY-NOTES.md` explicitly
  calls this out as required before freeze) — visually, body-weight brown
  text (`#34251F`) over the brighter sky/floor regions in States 1 and 3
  looked borderline in the captured screenshots and should be measured,
  not assumed, before this direction is taken further.

## 13. Performance results

Measured with Playwright response-body byte-counting on the `default`
variant, cold load, scrolled through the entire journey:

| Metric | Result | Target (`PERFORMANCE-NOTES.md`) |
|---|---:|---:|
| Initial transferred bytes | 201KB (2 requests: HTML + first world-plate AVIF) | ≤700KB incl. font subset |
| Total transferred, full journey | 1.18MB (8 requests) | 1.8–3.4MB |
| Largest single asset | couple-layer-1024.webp, 300KB | 100–350KB (alpha layers) |
| Video bytes requested, ever | 0 | 0 |
| Simultaneously decoded major plates | 2 max (world-plate + finale-background, only briefly overlapping at the T04 swap) | 2 max |

Both headline byte budgets are **comfortably met** — largely because only
one world-plate image is ever shipped (vs. up to 4 separate master plates
in the original per-state-crossfade design) and lazy-loading meant only 8
of 15 `<img>` elements on the page ever issued a network request during a
full top-to-bottom scroll (the rest are the hidden `#static` fallback's own
`<img>`s, correctly never fetched while `display: none`).

**Not measured** (flagged, not fabricated): decoded-image memory estimate,
real mobile-device frame timing (headless Chromium only, no on-device
profiling), Cumulative Layout Shift (no `PerformanceObserver` was wired in
before first paint in this pass), and long-task warnings. These would need
a dedicated profiling pass, not a byte-counting one, before any resourcing
decision is made on this direction.

## 14. Test results

```
npx eslint src/experiments/ivory-palace-continuous-journey-v2   → clean
npx tsc --noEmit -p .                                             → clean
npx vitest run src/experiments/ivory-palace-continuous-journey-v2 → 42/42 passing
npx vitest run  (full repo suite)                                 → 873/873 passing, no regressions
npm run build                                                     → clean; route table unchanged
                                                                      (experiment ships zero Next.js
                                                                      routes, so this check is by
                                                                      construction rather than a
                                                                      grep of the build manifest)
```

`motion.test.ts` (27 tests): pure math — progress computation, cumulative
scale budgets, world-plate scale monotonicity/holds, two-phase text
non-overlap, Haldi fade-in/out, all three T04 treatments' coverage and
background-swap timing including "never swaps at p=0" for every treatment.

`render.test.ts` (11 tests): every required string of live copy present as
text (never baked into an image reference); ampersand kept independent;
fixture text HTML-escaped (markup-injection defence); S01/S02/S03 master
filenames absent from output (core decision enforcement); all three T04
treatments declared; complete reduced-motion markup present; zero
`<video>`/`.mp4`/`.webm` references anywhere; long names render on
independent lines; 44px control target; correct alt-text split.

`__tests__/output.test.ts` (4 tests): writes default/long-names/blocked-media
variants to `generator-output/`, confirms derivation report + assets exist.

## 15. Known limitations

1. **A real structural bug was found and fixed during this pass, not before
   it shipped**: the first implementation scoped the world-plate layer
   inside each state's own sticky section, so it scrolled away after State
   0 instead of persisting — the exact failure mode this whole experiment
   exists to test for. Root cause: `overflow-x: hidden` on `<body>`
   silently promotes `overflow-y` to `auto` per the CSS Overflow spec,
   turning `<body>` into its own scroll container and breaking
   `position: sticky`. Fixed by moving to one shared sticky stage and
   removing the body-level `overflow-x` rule (contained instead by
   `.stage-fixed`'s own `overflow: hidden`). Documented here because a
   feasibility report that hid this would be dishonest about how close the
   first draft came to silently failing its own core test.
2. A second real bug (also found and fixed in this pass): the `<picture>`
   wrapper, not the nested `<img>`, was receiving the sizing/`object-fit`/
   transform CSS class — `<picture>` isn't a replaced element, so those
   rules were silent no-ops. This broke the desktop centered presentation
   specifically (mobile's default `img { max-width: 100% }` reset
   coincidentally produced a passable-looking result, masking the bug
   until desktop was checked).
3. T04 Treatment B's curtains are a **single mandap-foreground layer
   split via CSS** (float + `scaleX(-1)` mirroring), not a purpose-built
   two-piece curtain asset — acceptable for feasibility comparison, not
   for production use.
4. T04 Treatment C's bloom is too subtle to read as visually distinct from
   Treatment A in practice — reported honestly in §9 rather than
   overstated.
5. Cormorant Garamond / Source Sans 3 / Noto Devanagari were not sourced;
   display/body text uses the documented system-font fallback stack only.
6. Mobile 360×800/393×873/412×915/430×932 and desktop 1366×768/1920×1080
   were not independently captured (390×844 and 1440×900 only) — inferred
   safe given the percentage/`clamp()`-based layout, not verified.
7. Measured WCAG AA contrast, on-device frame timing, CLS, decoded-memory
   estimate, and long-task warnings were not captured this pass (§13).
8. World-plate/finale-background scale and opacity values are computed and
   applied via inline styles on every scroll tick without any `will-change`
   promotion beyond what's already declared in CSS — fine at the tested
   scale, unverified at production polish level.
9. The 941×1672-genuine / 2160×3840-upscaled resolution gap (§4) applies to
   every plate used here, same as the production package.

## 16. Feasibility classification

**PARTIALLY FEASIBLE — SPECIFIC ASSET CORRECTIONS REQUIRED**

The core motion premise holds up well in practice: a single world plate,
scaled continuously about a locked axis point with a separately-timed
Haldi overlay, genuinely reads as forward movement through one environment
rather than a slideshow — once the sticky-stage structure was corrected
(§16.1), states 0–3 do not show the architectural ghosting the V1 approach
produced, matching the package's own T01–T03 registration QA. All three
T04 treatments avoid a blank-rectangle reveal.

What's not yet proven: genuine physical depth (§6 lists exactly what's
real parallax vs. a flat scaling plate — most of the "depth" here is one
plate's scale, not multiple registered depth planes), a T04 treatment that
reads as more than "a designed transition" (matching the source package's
own conclusion), and Treatment C specifically needs either a stronger
effect or should be dropped rather than pursued further as-is. These are
squarely "specific asset/treatment corrections," not a rejection of the
scrollytelling approach itself.

## 17. Confirmation

Nothing was published, deployed, merged, or pushed. The branch
`experiment/ivory-palace-continuous-journey-v2` exists only as local
commits. `feature/ivory-palace-signature-v1` and the production
`ivory-palace-signature` template package were not read, modified, or
touched by any command in this session. No database, Supabase, survey,
pricing, or production-route file was changed. No V2 asset is marked
Owner-approved anywhere in this experiment's code, tests, or docs.
