/**
 * EXPERIMENTAL — NOT PRODUCTION READY
 *
 * Generates the static HTML document for the Continuous Journey
 * scrollymation feasibility prototype. This is disposable, isolated
 * prototype code — it is NOT the production Ivory Palace template
 * (see src/lib/html-templates/packages/ivory-palace-signature/) and
 * does NOT follow that package's zero-`<script>` trusted-document
 * contract, because CAMERA-MOTION-SPEC.md explicitly permits "one
 * reviewed content-hashed template-owned controller" for this kind of
 * scroll-driven work, and this document is template-owned code, never
 * built from stored/user-supplied composition data.
 *
 * All wording is emitted as live HTML text nodes (see JourneyFixture),
 * never baked into artwork.
 */

import type { JourneyFixture } from "./fixture";
import type { T04Treatment } from "./motion";

const COLORS = {
  ivory: "#FFF6E8",
  burgundy: "#5F1428",
  brown: "#34251F",
  gold: "#C9A55C",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderOptions {
  defaultTreatment?: T04Treatment;
  assetBasePath?: string;
}

function pictureRGB(base: string, alt: string, opts: { eager?: boolean; className?: string } = {}): string {
  const { eager = false, className = "" } = opts;
  const loading = eager ? "eager" : "lazy";
  const fetchpriority = eager ? ' fetchpriority="high"' : "";
  // The class goes on the <img>, not <picture>: <picture> isn't a
  // replaced element, so object-fit/percentage-sizing/transform rules
  // aimed at it (via a class meant for the image) would silently be
  // no-ops — <picture> only ever affects which <source> the nested
  // <img> resolves to, the <img> itself does all the actual painting.
  return `<picture>
    <source type="image/avif" srcset="assets/${base}-540.avif 540w, assets/${base}-720.avif 720w, assets/${base}-1080.avif 1080w" sizes="100vw" />
    <source type="image/webp" srcset="assets/${base}-540.webp 540w, assets/${base}-720.webp 720w, assets/${base}-1080.webp 1080w" sizes="100vw" />
    <img class="${className}" src="assets/${base}-720.webp" alt="${esc(alt)}" loading="${loading}"${fetchpriority} decoding="async" data-savedata-src="assets/${base}-540.webp" />
  </picture>`;
}

function pictureAlpha(
  base: string,
  widths: number[],
  alt: string,
  opts: { className?: string; eager?: boolean } = {}
): string {
  const { className = "", eager = false } = opts;
  const srcset = widths.map((w) => `assets/${base}-${w}.webp ${w}w`).join(", ");
  const fallback = widths[0];
  return `<img class="${className}" src="assets/${base}-${fallback}.webp" srcset="${srcset}" sizes="70vw" alt="${esc(
    alt
  )}" loading="${eager ? "eager" : "lazy"}" decoding="async" />`;
}

export function renderJourneyDocument(fixture: JourneyFixture, options: RenderOptions = {}): string {
  const { defaultTreatment = "A" } = options;
  const [name1, name2] = fixture.coupleNames;

  return `<!DOCTYPE html>
<html lang="en" data-t04-treatment="${defaultTreatment}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>Ivory Palace — Continuous Journey V2 (Experimental)</title>
<style>${STYLE_SHEET}</style>
<script>
// Blocking, minimal: set save-data class before first paint to avoid
// a flash of the heavy scrolly experience on a metered connection.
(function () {
  try {
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    if (saveData) document.documentElement.classList.add("save-data");
  } catch (e) {}
})();
</script>
</head>
<body>
<div class="experimental-banner" role="note">EXPERIMENTAL — NOT PRODUCTION READY — motion feasibility prototype, not final artwork or template</div>

<main>
${renderScrollyExperience(fixture, name1, name2)}
${renderStaticFallback(fixture, name1, name2)}
</main>

<div class="t04-panel" role="group" aria-label="Finale transition treatment (experimental comparison control)">
  <span class="t04-panel-label">Finale treatment:</span>
  <button type="button" class="t04-btn" data-treatment="A">A · Mandap pass</button>
  <button type="button" class="t04-btn" data-treatment="B">B · Curtain edge</button>
  <button type="button" class="t04-btn" data-treatment="C">C · Light conceal</button>
</div>

<script type="module">${RUNTIME_SCRIPT_SOURCE}</script>
</body>
</html>`;
}

/**
 * One shared sticky stage (`.stage-fixed`) holds every visual layer as
 * a SINGLETON element, positioned sticky at the top of `#scrolly` so it
 * stays pinned to the viewport across the whole combined scroll
 * distance of states 0-3 (releasing naturally once `#scrolly` itself
 * ends) — this is what makes the world plate read as one continuous
 * background instead of getting replaced/scrolled away between
 * per-state sections. Each `.state-track` below is a plain, invisible
 * spacer that exists only to give the runtime script something to
 * measure scroll progress against (via its own bounding rect); it
 * carries no visual content of its own.
 */
function renderScrollyExperience(fixture: JourneyFixture, name1: string, name2: string): string {
  return `<div id="scrolly" class="scrolly">
  <div class="stage-fixed">

    <div class="world-plate-layer" data-layer="world-plate">
      ${pictureRGB("world-plate", "", { eager: true, className: "world-plate-img" })}
    </div>

    <div class="haldi-layer" data-layer="haldi">
      ${pictureAlpha("haldi-layer", [678, 1356], "", { className: "haldi-img" })}
    </div>

    <div class="t04-a-occluder" data-t04="A">
      ${pictureAlpha("mandap-occluder", [583, 1165], "", { className: "occluder-img" })}
    </div>
    <div class="t04-b-curtains" data-t04="B">
      <div class="curtain curtain-left">${pictureAlpha("mandap-foreground", [1080, 2160], "", { className: "curtain-img" })}</div>
      <div class="curtain curtain-right">${pictureAlpha("mandap-foreground", [1080, 2160], "", { className: "curtain-img curtain-img-flip" })}</div>
    </div>
    <div class="t04-c-bloom" data-t04="C">
      <div class="bloom-glow"></div>
      <div class="bloom-occluder">${pictureAlpha("mandap-occluder", [583, 1165], "", { className: "occluder-img occluder-img-partial" })}</div>
    </div>

    <div class="finale-background-layer" data-layer="finale-bg">
      ${pictureRGB("finale-background", "An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace.", { className: "finale-bg-img" })}
    </div>
    <div class="couple-layer" data-layer="couple">
      ${pictureAlpha("couple-layer", [512, 1024], "", { className: "couple-img" })}
    </div>

    <div class="text-block text-primary" data-text="state0-primary">
      <h1 class="threshold-title">You are invited</h1>
    </div>
    <div class="scroll-cue" data-scroll-cue aria-hidden="true">
      <span class="scroll-cue-chevron"></span>
      <span class="scroll-cue-label">Scroll or swipe to begin</span>
    </div>

    <div class="text-block text-primary" data-text="state1-primary">
      <h2 class="couple-names">${esc(name1)} <span class="ampersand">&amp;</span> ${esc(name2)}</h2>
      <p class="intro-line">${esc(fixture.state1Intro)}</p>
    </div>

    <div class="text-block text-secondary haldi-text" data-text="state2-primary">
      <h2 class="ceremony-title">${esc(fixture.haldi.title)}</h2>
      <p>${esc(fixture.haldi.date)}</p>
      <p>${esc(fixture.haldi.time)}</p>
      <p>${esc(fixture.haldi.venue)}</p>
      <p class="ceremony-note">${esc(fixture.haldi.note)}</p>
    </div>

    <div class="text-block text-primary" data-text="state3-phaseA">
      <p class="blessing-line">${esc(fixture.wedding.phaseA.blessing)}</p>
      <p class="phase-names">${esc(fixture.wedding.phaseA.name1)}</p>
      <p class="ampersand-standalone">&amp;</p>
      <p class="phase-names">${esc(fixture.wedding.phaseA.name2)}</p>
    </div>
    <div class="text-block text-secondary" data-text="state3-phaseB">
      <p>${esc(fixture.wedding.phaseB.date)}</p>
      <p>${esc(fixture.wedding.phaseB.time)}</p>
      <p>${esc(fixture.wedding.phaseB.venue)}</p>
      <p>${esc(fixture.wedding.phaseB.address)}</p>
    </div>

    <div class="text-block text-primary" data-text="state4-phaseA">
      <p class="closing-line">${esc(fixture.finale.closing)}</p>
    </div>
    <div class="text-block text-secondary state4-controls" data-text="state4-phaseB">
      <a class="journey-cta" href="#directions" data-experimental-control>${esc(fixture.finale.directionsLabel)}</a>
      <a class="journey-cta journey-cta-primary" href="#rsvp" data-experimental-control>${esc(fixture.finale.rsvpLabel)}</a>
    </div>

  </div>

  <div class="state-track" data-state="0" aria-hidden="true" style="height:220svh"></div>
  <div class="state-track" data-state="1" aria-hidden="true" style="height:260svh"></div>
  <div class="state-track" data-state="2" aria-hidden="true" style="height:260svh"></div>
  <div class="state-track" data-state="3" aria-hidden="true" style="height:300svh"></div>
  <div class="state-track" data-state="4" aria-hidden="true" style="height:260svh"></div>
</div>`;
}

function renderStaticFallback(fixture: JourneyFixture, name1: string, name2: string): string {
  return `<div id="static" class="static-sequence">
  <section class="static-state" aria-label="Threshold">
    <div class="static-media">${pictureRGB("world-plate", "", { eager: true })}</div>
    <div class="static-text"><h1 class="threshold-title">You are invited</h1></div>
  </section>

  <section class="static-state" aria-label="Welcome">
    <div class="static-media">${pictureRGB("world-plate", "")}</div>
    <div class="static-text">
      <h2 class="couple-names">${esc(name1)} <span class="ampersand">&amp;</span> ${esc(name2)}</h2>
      <p class="intro-line">${esc(fixture.state1Intro)}</p>
    </div>
  </section>

  <section class="static-state" aria-label="Haldi">
    <div class="static-media">
      ${pictureRGB("world-plate", "")}
      ${pictureAlpha("haldi-layer", [678], "", { className: "haldi-img static-haldi" })}
    </div>
    <div class="static-text">
      <h2 class="ceremony-title">${esc(fixture.haldi.title)}</h2>
      <p>${esc(fixture.haldi.date)}</p>
      <p>${esc(fixture.haldi.time)}</p>
      <p>${esc(fixture.haldi.venue)}</p>
      <p class="ceremony-note">${esc(fixture.haldi.note)}</p>
    </div>
  </section>

  <section class="static-state" aria-label="Wedding">
    <div class="static-media">${pictureRGB("world-plate", "")}</div>
    <div class="static-text">
      <p class="blessing-line">${esc(fixture.wedding.phaseA.blessing)}</p>
      <p class="phase-names">${esc(fixture.wedding.phaseA.name1)}</p>
      <p class="ampersand-standalone">&amp;</p>
      <p class="phase-names">${esc(fixture.wedding.phaseA.name2)}</p>
      <p>${esc(fixture.wedding.phaseB.date)}</p>
      <p>${esc(fixture.wedding.phaseB.time)}</p>
      <p>${esc(fixture.wedding.phaseB.venue)}</p>
      <p>${esc(fixture.wedding.phaseB.address)}</p>
    </div>
  </section>

  <section class="static-state" aria-label="Finale">
    <div class="static-media">
      ${pictureRGB("finale-background", "An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace.")}
      ${pictureAlpha("couple-layer", [512], "", { className: "couple-img static-couple" })}
    </div>
    <div class="static-text">
      <p class="closing-line">${esc(fixture.finale.closing)}</p>
      <a class="journey-cta" href="#directions" data-experimental-control>${esc(fixture.finale.directionsLabel)}</a>
      <a class="journey-cta journey-cta-primary" href="#rsvp" data-experimental-control>${esc(fixture.finale.rsvpLabel)}</a>
    </div>
  </section>
</div>`;
}

const STYLE_SHEET = `
@font-face {
  font-family: "Alex Brush";
  src: url("assets/fonts/alex-brush-latin-400-normal.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
}
:root {
  --ivory: ${COLORS.ivory};
  --burgundy: ${COLORS.burgundy};
  --brown: ${COLORS.brown};
  --gold: ${COLORS.gold};
}
* { box-sizing: border-box; }
/* Deliberately NOT overflow-x:hidden here: per the CSS Overflow spec,
   giving one axis a non-"visible" overflow value forces the UA to
   auto-promote the other axis to "auto" too, which turns <body> into
   its own scroll container and breaks position:sticky for
   .stage-fixed (its containing block stops tracking the real
   viewport). Horizontal overflow is instead contained locally by
   .stage-fixed's own overflow:hidden (it also clips the T04
   curtain-edge animation, which needs to translate off both sides). */
html, body { margin: 0; padding: 0; background: #100a08; color: var(--brown); }
body { font-family: "Cormorant Garamond", Georgia, serif; }
img { max-width: 100%; display: block; }
picture { display: block; }
.world-plate-layer picture, .finale-background-layer picture { width: 100%; height: 100%; }

.experimental-banner {
  position: sticky; top: 0; z-index: 50;
  background: #7a1c1c; color: #fff6e8;
  font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 0.04em;
  text-align: center; padding: 6px 10px;
}

main { position: relative; }

/* ---------- desktop centring (RESPONSIVE-STRATEGY.md) ---------- */
.stage-fixed, .static-media {
  max-width: 608px;
  margin: 0 auto;
}
@media (min-width: 900px) {
  .scrolly, .static-sequence { background: radial-gradient(120% 100% at 50% 0%, #241512 0%, #0d0908 70%); }
}

/* ---------- scrolly: one sticky stage + invisible spacer tracks ----------
   The stage is sticky (not fixed) so it self-releases once #scrolly's
   combined height (the sum of every .state-track spacer) is exhausted,
   instead of staying pinned to the viewport forever. Each spacer
   track's own bounding rect (measured by the runtime script) is what
   drives that state's local scroll progress — see render.ts's
   RUNTIME_SCRIPT_SOURCE. This is what keeps the world plate reading as
   ONE continuous background across states 0-3 rather than getting
   replaced at each section boundary. */
.scrolly { position: relative; }
.state-track { position: relative; }
.stage-fixed {
  position: sticky; top: 0; height: 100svh; height: 100vh;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
}

.world-plate-layer, .finale-background-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.world-plate-img, .finale-bg-img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 43%; will-change: transform; transform-origin: 50% 43%; }
/* Both start hidden — world-plate-layer is shown explicitly below (it's
   the only thing visible at State 0); finale-background-layer only
   becomes visible once the T04 concealment swap flips it. A short
   transition avoids any single-frame flash right at the swap instant. */
.world-plate-layer { opacity: 1; }
.finale-background-layer { opacity: 0; transition: opacity 0.08s linear; }

.haldi-layer { position: absolute; left: 4%; bottom: 14%; width: 44%; max-width: 340px; will-change: transform, opacity; opacity: 0; }
.haldi-img { width: 100%; height: auto; filter: drop-shadow(0 12px 18px rgba(0,0,0,0.35)); }

.couple-layer { position: absolute; left: 50%; bottom: 8%; width: 46%; max-width: 320px; transform: translateX(-50%); opacity: 0; }
.couple-img { width: 100%; height: auto; }

.text-block {
  position: absolute; left: 9%; right: 9%; text-align: center; opacity: 0; will-change: opacity, transform;
  text-shadow: 0 2px 10px rgba(0,0,0,0.35);
}
.text-primary { top: 10%; }
.text-secondary { bottom: 14%; }
.threshold-title { font-size: clamp(28px, 7vw, 44px); color: var(--ivory); letter-spacing: 0.02em; margin: 0; }
.couple-names { font-family: "Alex Brush", "Segoe Script", cursive; font-size: clamp(40px, 11vw, 68px); color: var(--ivory); margin: 0 0 10px; line-height: 1; }
.ampersand { font-size: 0.7em; opacity: 0.9; }
.intro-line { color: var(--ivory); font-size: clamp(15px, 4vw, 19px); line-height: 1.5; margin: 0; }
.ceremony-title { font-size: clamp(24px, 6vw, 34px); color: var(--brown); margin: 0 0 6px; }
.text-secondary p, .text-primary p { color: var(--brown); font-size: clamp(14px, 3.6vw, 18px); margin: 2px 0; }
.haldi-text p, .haldi-text .ceremony-title { color: var(--ivory); }
.ceremony-note { font-style: italic; opacity: 0.85; }
.blessing-line { font-size: clamp(14px, 3.6vw, 18px); color: var(--ivory); margin-bottom: 8px; }
.phase-names { font-family: "Alex Brush", cursive; font-size: clamp(30px, 8vw, 44px); color: var(--ivory); margin: 2px 0; }
.ampersand-standalone { font-family: "Cormorant Garamond", serif; font-size: clamp(20px, 5vw, 28px); color: var(--gold); margin: 0; }
.closing-line { color: var(--ivory); font-size: clamp(16px, 4vw, 20px); margin-bottom: 14px; }

.scroll-cue { position: absolute; bottom: 6%; left: 50%; transform: translateX(-50%); text-align: center; color: var(--ivory); font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; transition: opacity 0.4s ease; }
.scroll-cue-chevron { display: block; width: 14px; height: 14px; margin: 0 auto 6px; border-right: 2px solid var(--gold); border-bottom: 2px solid var(--gold); transform: rotate(45deg); animation: cue-bob 1.6s ease-in-out infinite; }
@keyframes cue-bob { 0%, 100% { transform: rotate(45deg) translate(0,0); } 50% { transform: rotate(45deg) translate(4px,4px); } }
.scroll-cue.is-hidden { opacity: 0; pointer-events: none; }

/* ---------- T04 treatment layers ---------- */
.t04-a-occluder, .t04-b-curtains, .t04-c-bloom { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
html[data-t04-treatment="A"] .t04-a-occluder,
html[data-t04-treatment="B"] .t04-b-curtains,
html[data-t04-treatment="C"] .t04-c-bloom { opacity: 1; }

.t04-a-occluder .occluder-img { position: absolute; left: 50%; bottom: -6%; width: 60%; max-width: 420px; transform: translateX(-50%) scale(1); transform-origin: 50% 100%; will-change: transform, opacity; opacity: 0; }

.t04-b-curtains .curtain { position: absolute; top: 0; bottom: 0; width: 58%; overflow: hidden; will-change: transform; }
.curtain-left { left: 0; transform: translateX(-100%); }
.curtain-right { right: 0; transform: translateX(100%); }
.curtain-img { height: 100%; width: auto; object-fit: cover; }
.curtain-left .curtain-img { float: left; }
.curtain-right .curtain-img-flip { float: right; transform: scaleX(-1); }

.t04-c-bloom .bloom-glow { position: absolute; inset: 0; background: radial-gradient(60% 50% at 50% 55%, rgba(255,214,150,0.85) 0%, rgba(255,214,150,0) 70%); opacity: 0; will-change: opacity; }
.t04-c-bloom .bloom-occluder { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; }
.t04-c-bloom .occluder-img-partial { width: 44%; max-width: 300px; opacity: 0; will-change: opacity, transform; }

/* ---------- T04 comparison panel ---------- */
.t04-panel { position: fixed; right: 10px; bottom: 10px; z-index: 60; background: rgba(16,10,8,0.82); border: 1px solid rgba(255,246,232,0.25); border-radius: 10px; padding: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-family: system-ui, sans-serif; }
.t04-panel-label { color: var(--ivory); font-size: 11px; width: 100%; }
.t04-btn { font-size: 11px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,246,232,0.4); background: transparent; color: var(--ivory); cursor: pointer; min-height: 32px; }
.t04-btn:focus-visible, .journey-cta:focus-visible, .t04-btn:focus { outline: 3px solid var(--gold); outline-offset: 2px; }
html[data-t04-treatment="A"] .t04-btn[data-treatment="A"],
html[data-t04-treatment="B"] .t04-btn[data-treatment="B"],
html[data-t04-treatment="C"] .t04-btn[data-treatment="C"] { background: var(--gold); color: var(--brown); font-weight: 600; }

.journey-cta { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; padding: 10px 18px; margin: 6px; border-radius: 999px; border: 1px solid var(--ivory); color: var(--ivory); text-decoration: none; font-family: system-ui, sans-serif; font-size: 14px; }
.journey-cta-primary { background: var(--gold); color: var(--brown); border-color: var(--gold); }
.state4-controls { display: flex; justify-content: center; flex-wrap: wrap; }

/* ---------- static / reduced-motion / save-data fallback ---------- */
#static { display: none; }
.static-state { position: relative; min-height: 100svh; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.static-media { position: absolute; inset: 0; }
.static-media picture, .static-media img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 43%; }
.static-haldi { position: absolute; left: 4%; bottom: 12%; width: 42%; max-width: 300px; height: auto !important; object-fit: contain !important; }
.static-couple { position: absolute; left: 50%; bottom: 6%; width: 42%; max-width: 280px; height: auto !important; object-fit: contain !important; transform: translateX(-50%); }
.static-text { position: relative; z-index: 2; text-align: center; padding: 0 8%; text-shadow: 0 2px 10px rgba(0,0,0,0.4); }
.static-state .journey-cta { color: var(--ivory); border-color: var(--ivory); }

@media (prefers-reduced-motion: reduce) {
  #scrolly { display: none; }
  #static { display: block; }
}
html.save-data #scrolly { display: none; }
html.save-data #static { display: block; }

.t04-panel[hidden] { display: none; }
img.asset-blocked { background: linear-gradient(180deg, #efe3cf, #e6d7bd); min-height: 160px; }
`;

/**
 * Runtime `<script type="module">` source, inlined verbatim into the
 * generated document. Re-implements motion.ts's math in plain JS
 * (a static HTML file has no build step to import the TS module at
 * request time) — keep the two in sync by hand when either changes.
 * motion.test.ts is the source of truth for the math; this mirrors it.
 */
const RUNTIME_SCRIPT_SOURCE = `
const TIMING = { settleEnd: 0.12, textInEnd: 0.2, holdEnd: 0.52, textOutEnd: 0.62, pushEnd: 0.9, switchEnd: 0.94 };
const STATE_SCALE_MULTIPLIER = { 0: 1.10, 1: 1.10, 2: 1.15, 3: 1.10 };
const STATE4_SCALE_RANGE = { start: 1.0, end: 1.06 };

function clamp01(v) { return Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)); }
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

function cumulativeScaleAtStateStart(state) {
  let scale = 1.0;
  for (let s = 0; s < state; s++) scale *= STATE_SCALE_MULTIPLIER[s];
  return scale;
}
function worldPlateScale(state, p) {
  p = clamp01(p);
  const start = cumulativeScaleAtStateStart(state);
  const end = start * STATE_SCALE_MULTIPLIER[state];
  if (p <= TIMING.textOutEnd) return start;
  if (p >= TIMING.pushEnd) return end;
  return lerp(start, end, (p - TIMING.textOutEnd) / (TIMING.pushEnd - TIMING.textOutEnd));
}
function finaleScale(p) { return lerp(STATE4_SCALE_RANGE.start, STATE4_SCALE_RANGE.end, clamp01(p)); }
function textOpacity(p) {
  p = clamp01(p);
  if (p < TIMING.settleEnd) return 0;
  if (p < TIMING.textInEnd) return (p - TIMING.settleEnd) / (TIMING.textInEnd - TIMING.settleEnd);
  if (p < TIMING.holdEnd) return 1;
  if (p < TIMING.textOutEnd) return 1 - (p - TIMING.holdEnd) / (TIMING.textOutEnd - TIMING.holdEnd);
  return 0;
}
function twoPhaseOpacity(p) {
  p = clamp01(p);
  const mid = (TIMING.textInEnd + TIMING.holdEnd) / 2;
  const gap = 0.03;
  const rampIn = (s, e) => (p < s ? 0 : p < e ? (p - s) / (e - s) : 1);
  const rampOut = (s, e) => (p < s ? 1 : p < e ? 1 - (p - s) / (e - s) : 0);
  const phaseA = p < mid - gap ? rampIn(TIMING.settleEnd, TIMING.textInEnd) : rampOut(mid - gap, mid);
  const phaseB = p < mid ? 0 : p < mid + gap ? rampIn(mid, mid + gap) : rampOut(TIMING.holdEnd, TIMING.textOutEnd);
  return { phaseA: clamp01(phaseA), phaseB: clamp01(phaseB) };
}
function haldiLayerOpacity(p) {
  p = clamp01(p);
  if (p < 0.15) return 0;
  if (p < 0.3) return (p - 0.15) / 0.15;
  if (p < 0.78) return 1;
  if (p < 0.9) return 1 - (p - 0.78) / 0.12;
  return 0;
}
function haldiParallaxPx(p, refWidth) { return -lerp(0, refWidth * 0.06, clamp01(p)); }

function concealmentFrame(treatment, p) {
  p = clamp01(p);
  if (treatment === "A") {
    const coverIn = clamp01(p / 0.55);
    const holdEnd = 0.75;
    const recede = p <= holdEnd ? 1 : 1 - clamp01((p - holdEnd) / (1 - holdEnd));
    const coverage = p <= holdEnd ? coverIn : recede;
    return { occluderOpacity: coverage, occluderScale: lerp(1.4, 4.2, coverIn), curtainOffsetPercent: 0, bloomOpacity: 0, backgroundSwapped: p > holdEnd + 0.02 || (p >= 0.5 && p <= holdEnd + 0.02) };
  }
  if (treatment === "B") {
    const closeEnd = 0.5, holdEnd = 0.72;
    const closing = p <= closeEnd ? 100 - 100 * clamp01(p / closeEnd) : 0;
    const opening = p > holdEnd ? 100 * clamp01((p - holdEnd) / (1 - holdEnd)) : 0;
    const offset = p <= closeEnd ? closing : p <= holdEnd ? 0 : opening;
    return { occluderOpacity: 0, occluderScale: 1, curtainOffsetPercent: offset, bloomOpacity: 0, backgroundSwapped: p >= closeEnd };
  }
  const bloomIn = clamp01(p / 0.5);
  const bloomHoldEnd = 0.68;
  const bloomOut = p <= bloomHoldEnd ? 1 : 1 - clamp01((p - bloomHoldEnd) / (1 - bloomHoldEnd));
  const bloom = (p <= bloomHoldEnd ? bloomIn : bloomOut) * 0.72;
  return { occluderOpacity: clamp01(bloomIn * 0.6), occluderScale: lerp(1.4, 2.4, bloomIn), curtainOffsetPercent: 0, bloomOpacity: bloom, backgroundSwapped: p > 0.5 };
}

const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrolly = document.getElementById("scrolly");

if (!prefersReducedMotion && scrolly) {
  const tracks = Array.from(document.querySelectorAll(".state-track"));
  const worldPlateLayers = Array.from(document.querySelectorAll(".world-plate-img"));
  const scrollCue = document.querySelector("[data-scroll-cue]");
  let cueHidden = false;

  function frameGeometry(el) {
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const scrollable = Math.max(1, rect.height - viewportH);
    return { top: rect.top, scrollable, viewportH };
  }

  function update() {
    if (!cueHidden && window.scrollY > 4) {
      cueHidden = true;
      if (scrollCue) scrollCue.classList.add("is-hidden");
    }

    // Compute every track's own local progress up front. A track not
    // yet reached is 0; one fully scrolled past is 1 — both are valid,
    // "settled" boundary values for every per-track effect below, so
    // most effects can just be applied unconditionally per-track with
    // no explicit "is this the active state" branching (haldiLayerOpacity(0)
    // and (1) are both 0, textOpacity(0) and (1) are both 0, etc).
    const progress = tracks.map((track) => {
      const { top, scrollable } = frameGeometry(track);
      return { state: Number(track.dataset.state), p: clamp01(-top / scrollable) };
    });

    // The ONE exception: worldPlateLayers is a single shared element,
    // so only one state's scale value may ever be applied per tick —
    // find the state currently "in progress" (first one not yet at
    // p=1) rather than looping every track's own scale over it in DOM
    // order, which would let a later, not-yet-reached state's fixed
    // start-of-state constant incorrectly overwrite the true
    // in-progress value from the state actually being scrolled.
    const active = progress.find((s) => s.p < 1) || progress[progress.length - 1];
    const worldScale = active.state <= 3 ? worldPlateScale(active.state, active.p) : cumulativeScaleAtStateStart(4);
    worldPlateLayers.forEach((img) => {
      img.style.transform = "scale(" + worldScale.toFixed(4) + ")";
    });

    progress.forEach(({ state, p }) => {
      const primary = document.querySelector('[data-text="state' + state + '-primary"]');
      if (primary) primary.style.opacity = String(textOpacity(p));

      if (state === 2) {
        const haldi = document.querySelector(".haldi-layer");
        if (haldi) {
          const op = haldiLayerOpacity(p);
          haldi.style.opacity = String(op);
          haldi.style.transform = "translateY(" + haldiParallaxPx(p, window.innerWidth) + "px)";
        }
      }

      if (state === 3) {
        const { phaseA, phaseB } = twoPhaseOpacity(p);
        const a = document.querySelector('[data-text="state3-phaseA"]');
        const b = document.querySelector('[data-text="state3-phaseB"]');
        if (a) a.style.opacity = String(phaseA);
        if (b) b.style.opacity = String(phaseB);

        const concealP = clamp01((p - 0.82) / 0.18);
        const treatment = document.documentElement.dataset.t04Treatment || "A";
        const frame = concealmentFrame(treatment, concealP);

        const occluder = document.querySelector(".t04-a-occluder .occluder-img");
        if (occluder) {
          occluder.style.opacity = String(frame.occluderOpacity);
          occluder.style.transform = "translateX(-50%) scale(" + frame.occluderScale.toFixed(3) + ")";
        }
        const curtainL = document.querySelector(".curtain-left");
        const curtainR = document.querySelector(".curtain-right");
        if (curtainL) curtainL.style.transform = "translateX(" + -frame.curtainOffsetPercent + "%)";
        if (curtainR) curtainR.style.transform = "translateX(" + frame.curtainOffsetPercent + "%)";
        const bloomGlow = document.querySelector(".bloom-glow");
        const bloomOccluder = document.querySelector(".t04-c-bloom .occluder-img-partial");
        if (bloomGlow) bloomGlow.style.opacity = String(frame.bloomOpacity);
        if (bloomOccluder) {
          bloomOccluder.style.opacity = String(frame.occluderOpacity);
          bloomOccluder.style.transform = "scale(" + frame.occluderScale.toFixed(3) + ")";
        }

        const finaleBgLayer = document.querySelector(".finale-background-layer");
        const worldPlateLayerEls = document.querySelectorAll(".world-plate-layer");
        if (finaleBgLayer) finaleBgLayer.style.opacity = frame.backgroundSwapped ? "1" : "0";
        worldPlateLayerEls.forEach((el) => {
          el.style.filter = frame.backgroundSwapped ? "brightness(0.4)" : "none";
        });
      }

      if (state === 4) {
        const finaleImg = document.querySelector(".finale-bg-img");
        if (finaleImg) finaleImg.style.transform = "scale(" + finaleScale(p).toFixed(4) + ")";
        const { phaseA, phaseB } = twoPhaseOpacity(p);
        const a = document.querySelector('[data-text="state4-phaseA"]');
        const b = document.querySelector('[data-text="state4-phaseB"]');
        if (a) a.style.opacity = String(phaseA);
        if (b) b.style.opacity = String(phaseB);
        const couple = document.querySelector(".couple-layer");
        if (couple) couple.style.opacity = String(clamp01(p / 0.3));
      }
    });
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        update();
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
}

// T04 treatment comparison panel.
const panel = document.querySelector(".t04-panel");
if (panel) {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("t04");
  if (initial && ["A", "B", "C"].includes(initial.toUpperCase())) {
    document.documentElement.dataset.t04Treatment = initial.toUpperCase();
  }
  panel.querySelectorAll(".t04-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.documentElement.dataset.t04Treatment = btn.dataset.treatment;
      try {
        localStorage.setItem("ipcj-v2-t04-treatment", btn.dataset.treatment);
      } catch (e) {}
    });
  });
}

// Save-Data: swap to the smallest delivery derivative everywhere.
if (document.documentElement.classList.contains("save-data")) {
  document.querySelectorAll("img[data-savedata-src]").forEach((img) => {
    img.src = img.getAttribute("data-savedata-src");
    img.removeAttribute("srcset");
  });
}

// Blocked/failed image handling — graceful fallback, never a broken-image
// icon. "error" doesn't bubble, so listen on window's capturing phase
// (catches every <img>, including ones inside <picture> whose selected
// <source> failed to load) rather than binding per-element, which can
// race a late-inserted or still-negotiating <picture> source.
window.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (target && target.tagName === "IMG") {
      target.classList.add("asset-blocked");
    }
  },
  true
);
`;
