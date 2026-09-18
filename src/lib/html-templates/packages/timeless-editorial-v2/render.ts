/**
 * Renderer for the Timeless Editorial Wedding (V2) trusted template.
 *
 * Produces a complete, standalone HTML document string from validated
 * composition data. Every interpolated value is escaped; every
 * decorative/motion value comes from the fixed presets in particles.ts,
 * never from the input data. The output contains zero <script> tags,
 * zero inline event handlers, and no external network references
 * beyond the template's own relative asset paths and the caller-
 * supplied RSVP/map URLs (already protocol-allowlisted by schema.ts).
 *
 * Visual revision (owner review 2): the previous version placed all
 * wording inside a translucent content panel over the floral frame,
 * which read as a webpage card rather than an invitation. This version
 * removes that panel entirely — text sits directly on one continuous
 * warm gradient background, with soft, edgeless radial washes (never a
 * bordered box) providing just enough contrast to stay readable over
 * the artwork.
 */

import { escapeAttr, escapeHtml } from "@/lib/html-templates/security";
import type { TimelessEditorialData } from "./schema";
import {
  PETAL_INSTANCES,
  SPARKLE_INSTANCES,
  SPARKLE_SPRITE_VARIANTS,
  type PetalInstance,
  type SparkleInstance,
} from "./particles";
import { chooseDesktopNameFormat } from "./names";

// Desktop safe-area constants the name-format decision is checked
// against — kept in one place and mirrored into the CSS below so the
// TypeScript decision and the rendered layout can never drift apart.
const DESKTOP_CONTENT_SAFE_WIDTH_PX = 640; // == 40rem, the .names-line max-width
const DESKTOP_INLINE_NAME_MAX_FONT_PX = 57.6; // == 3.6rem, the --name-font-inline clamp() ceiling

const PETAL_SHEET_COLS = 6;
const PETAL_SHEET_ROWS = 4;
const PETAL_CELL_PX = 256;
const PETAL_SHEET_W = PETAL_SHEET_COLS * PETAL_CELL_PX;
const PETAL_SHEET_H = PETAL_SHEET_ROWS * PETAL_CELL_PX;

function renderPetal(petal: PetalInstance, index: number): string {
  const bgX = -(petal.sprite.col * PETAL_CELL_PX);
  const bgY = -(petal.sprite.row * PETAL_CELL_PX);
  const scale = petal.sizePx / PETAL_CELL_PX;
  const style = [
    `left:${petal.leftPercent}%`,
    `width:${petal.sizePx}px`,
    `height:${petal.sizePx}px`,
    `animation-duration:${petal.durationSeconds}s`,
    `animation-delay:${petal.delaySeconds}s`,
    `--wind:${petal.windDriftPx}px`,
    `--rot:${petal.rotationDeg}deg`,
    `background-position:${bgX * scale}px ${bgY * scale}px`,
    `background-size:${PETAL_SHEET_W * scale}px ${PETAL_SHEET_H * scale}px`,
  ].join(";");
  return `<span class="petal" style="${escapeAttr(style)}" data-petal-index="${index}"></span>`;
}

function renderSparkle(sparkle: SparkleInstance, index: number): string {
  const crop = SPARKLE_SPRITE_VARIANTS[sparkle.variantIndex];
  const scale = sparkle.sizePx / crop.w;
  const bgX = -crop.x * scale;
  const bgY = -crop.y * scale;
  // Sparkle sheet is 1254x1254; scale the whole sheet by the same
  // factor as the crop so background-position/background-size stay
  // consistent for this instance's rendered size.
  const sheetW = 1254 * scale;
  const sheetH = 1254 * scale;
  const style = [
    `left:${sparkle.leftPercent}%`,
    `top:${sparkle.topPercent}%`,
    `width:${sparkle.sizePx}px`,
    `height:${sparkle.sizePx}px`,
    `animation-duration:${sparkle.cycleSeconds}s`,
    `animation-delay:${sparkle.delaySeconds}s`,
    `background-position:${bgX}px ${bgY}px`,
    `background-size:${sheetW}px ${sheetH}px`,
  ].join(";");
  return `<span class="sparkle" style="${escapeAttr(style)}" data-sparkle-index="${index}"></span>`;
}

function renderScheduleItems(data: TimelessEditorialData): string {
  return data.schedule
    .map(
      (item) => `
        <li class="schedule-item">
          <span class="schedule-time">${escapeHtml(item.time)}</span>
          <span class="schedule-title">${escapeHtml(item.title)}</span>
          ${item.description ? `<span class="schedule-description">${escapeHtml(item.description)}</span>` : ""}
        </li>`,
    )
    .join("");
}

/**
 * Renders the couple's names as three separate semantic spans (person
 * one, ampersand, person two) rather than a single string the browser
 * would wrap on its own — required so the ampersand can never end up
 * alone at the end of one person's line or glued to the start of the
 * other's. The wrapper carries a `names-line--inline`/`--stacked`
 * modifier decided once here (server-side, from the calibrated width
 * estimate in names.ts); a mobile media query in the stylesheet below
 * forces the stacked layout regardless of which modifier is present,
 * per the owner's "mobile should default to the three-line format"
 * rule.
 */
function renderNames(data: TimelessEditorialData): string {
  const format = chooseDesktopNameFormat(
    data.partner1Name,
    data.partner2Name,
    DESKTOP_CONTENT_SAFE_WIDTH_PX,
    DESKTOP_INLINE_NAME_MAX_FONT_PX,
  );
  return `<h1 class="names-line names-line--${format}">
<span class="name-person">${escapeHtml(data.partner1Name)}</span>
<span class="name-amp">&amp;</span>
<span class="name-person">${escapeHtml(data.partner2Name)}</span>
</h1>`;
}

/**
 * The guest-response section is optional (Part 4) — when `data.response`
 * is undefined, this returns an empty string and no <section>, heading,
 * or link is emitted at all, per "if disabled, do not render an empty
 * section or link."
 */
function renderResponseSection(data: TimelessEditorialData): string {
  const response = data.response;
  if (!response) return "";

  return `
<section class="response-section">
<h2 class="response-heading">${escapeHtml(response.heading)}</h2>
${response.supportingMessage ? `<p class="response-supporting">${escapeHtml(response.supportingMessage)}</p>` : ""}
${response.deadline ? `<p class="response-deadline">Kindly respond by ${escapeHtml(response.deadline)}.</p>` : ""}
<a class="rsvp-cta" href="${escapeAttr(response.url)}">${escapeHtml(response.buttonLabel)}</a>
</section>`;
}

export function renderTimelessEditorialInvitation(data: TimelessEditorialData): string {
  const title = `${data.partner1Name} & ${data.partner2Name}`;
  const petalsMarkup = PETAL_INSTANCES.map(renderPetal).join("");
  const sparklesMarkup = SPARKLE_INSTANCES.map(renderSparkle).join("");
  const scheduleMarkup = renderScheduleItems(data);
  const namesMarkup = renderNames(data);
  const responseMarkup = renderResponseSection(data);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
/* Self-hosted fonts — see assets/fonts/FONTS.md for name, source and
   SIL Open Font License 1.1 text for each. Referenced only by relative
   path within this document's own inline styles; no font CDN, no
   runtime request to an external origin. font-display: swap plus a
   realistic system fallback in every font stack below means the page
   is fully readable before (or if) these ever load. */
@font-face {
  font-family: "Invitation Calligraphy";
  src: url("assets/fonts/alex-brush-latin-400-normal.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Invitation Display Serif";
  src: url("assets/fonts/playfair-display-latin-400-normal.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Invitation Display Serif";
  src: url("assets/fonts/playfair-display-latin-600-normal.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

:root {
  --ivory: #f6efe3;
  --ivory-bright: #fffcf6;
  --blush: #b4676b;
  --blush-soft: #d9a5a2;
  --sage: #7c8b6f;
  --gold: #a9803e;
  --burgundy: #5a1a1f;
  --ink: #241d17;
  --ink-soft: #5b5148;
  --line: #d9c8ae;

  /* Typography hierarchy (see FONTS.md):
     calligraphy   -> couple names, restrained on major romantic moments
     display-serif -> refined high-contrast serif for event information
     body-serif    -> elegant readable serif for paragraphs
     sans          -> small caps / practical labels */
  --font-calligraphy: "Invitation Calligraphy", "Segoe Script", "Brush Script MT", cursive;
  --font-display-serif: "Invitation Display Serif", Georgia, "Iowan Old Style", serif;
  --font-body-serif: Georgia, "Iowan Old Style", "Palatino Linotype", "URW Palladio L", serif;
  --font-sans: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

  /* Responsive safe-area system (Part 2). Every section inherits the
     same protected composition via these custom properties — nothing
     below guesses its own margins independently. Mobile overrides all
     five inside the max-width:820px media query further down. */
  --frame-corner-size: 168px;
  --frame-side-width: 84px;
  --content-inline-padding: 40px;
  --frame-top-clearance: 210px;
  --frame-bottom-clearance: 190px;
  --content-safe-width: min(40rem, calc(100% - 2 * (var(--frame-side-width) + var(--content-inline-padding))));
}

* { box-sizing: border-box; }

html { background: var(--ivory); }

body {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-body-serif);
  line-height: 1.7;
}

/* .page is one continuous warm gradient across the whole document —
   the only "background" this invitation has. There is no separate
   card/panel color layered on top of it anywhere below. */
.page {
  position: relative;
  overflow-x: hidden;
  background:
    radial-gradient(120% 60% at 50% 0%, #fffaf1 0%, rgba(255, 250, 241, 0) 60%),
    linear-gradient(180deg, #faf3e6 0%, #f6efe3 28%, #f3e8d7 60%, #eeddc7 100%);
}

/* Real edge-frame system (Part 1). Every piece is a genuine crop of
   the owner-supplied artwork (see scripts/derive-frame-assets.cjs for
   exactly how each was cut) — nothing here is CSS-drawn, redrawn, or
   invented. Every piece touches the page edge it belongs to and nests
   its own natural aspect ratio (width set, height:auto via
   aspect-ratio — never independently stretched). Desktop is built
   from four independent corner pieces (the source art itself is
   corner-accented, not a uniform repeating border, so spanning it
   full-width would force an upscale-blur or a squeezed, edge-detached
   band) plus two side pieces that pick up exactly where the top
   corners end, so nothing floats disconnected in the middle. Mobile's
   source art is already one continuous top-to-edge / bottom-to-edge
   garland, so it uses two full-width bands instead.

   Each background-image is declared twice: a plain url() first (the
   PNG fallback for any browser without image-set() support), then an
   image-set() with AVIF preferred over WebP — browsers that don't
   understand image-set() treat it as an invalid value and keep the
   first, valid url() declaration, so the fallback is automatic, not
   conditional markup. Only the breakpoint's own pieces are ever
   requested — mobile pieces are display:none above 820px and vice
   versa, so a visit never fetches both packages. */
.frame-corner,
.frame-side,
.frame-band {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-size: contain;
  filter: saturate(1.04) brightness(1.01);
}

.frame-corner {
  width: var(--frame-corner-size);
  aspect-ratio: 512 / 480;
  display: none;
}

.frame-corner--top-left {
  top: 0;
  left: 0;
  background-position: top left;
  background-image: url("assets/frame-pieces/desktop-top-left.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-top-left.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-top-left.webp") type("image/webp")
  );
}

.frame-corner--top-right {
  top: 0;
  right: 0;
  background-position: top right;
  background-image: url("assets/frame-pieces/desktop-top-right.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-top-right.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-top-right.webp") type("image/webp")
  );
}

.frame-corner--bottom-left {
  bottom: 0;
  left: 0;
  background-position: bottom left;
  background-image: url("assets/frame-pieces/desktop-bottom-left.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-bottom-left.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-bottom-left.webp") type("image/webp")
  );
}

.frame-corner--bottom-right {
  bottom: 0;
  right: 0;
  background-position: bottom right;
  background-image: url("assets/frame-pieces/desktop-bottom-right.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-bottom-right.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-bottom-right.webp") type("image/webp")
  );
}

.frame-side {
  width: var(--frame-side-width);
  aspect-ratio: 160 / 576;
  top: var(--frame-corner-size);
  display: none;
}

.frame-side--left {
  left: 0;
  background-position: top left;
  background-image: url("assets/frame-pieces/desktop-left.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-left.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-left.webp") type("image/webp")
  );
}

.frame-side--right {
  right: 0;
  background-position: top right;
  background-image: url("assets/frame-pieces/desktop-right.png");
  background-image: image-set(
    url("assets/frame-pieces/desktop-right.avif") type("image/avif"),
    url("assets/frame-pieces/desktop-right.webp") type("image/webp")
  );
}

.frame-band {
  left: 0;
  width: 100%;
  aspect-ratio: 941 / 360;
  display: block;
}

.frame-band--top {
  top: 0;
  background-position: top center;
  background-image: url("assets/frame-pieces/mobile-top.png");
  background-image: image-set(
    url("assets/frame-pieces/mobile-top.avif") type("image/avif"),
    url("assets/frame-pieces/mobile-top.webp") type("image/webp")
  );
}

.frame-band--bottom {
  bottom: 0;
  background-position: bottom center;
  background-image: url("assets/frame-pieces/mobile-bottom.png");
  background-image: image-set(
    url("assets/frame-pieces/mobile-bottom.avif") type("image/avif"),
    url("assets/frame-pieces/mobile-bottom.webp") type("image/webp")
  );
}

/* Below 821px: hide the desktop corners entirely, hide the mobile
   bands' desktop counterparts (bands are display:block by default,
   see .frame-band above, so nothing to do there), swap .frame-side's
   image/aspect-ratio/anchor to the thinner mobile pieces, and shrink
   the safe-area custom properties — one shared box-model, per-
   breakpoint values, exactly as Part 2 asks for. Only the mobile
   piece URLs are referenced in this block, so only they are ever
   requested below 821px; the desktop corner/side URLs above are only
   referenced inside the min-width:821px block, so only *they* are
   requested at that width and up. A single visit only ever fetches
   one breakpoint's package. */
@media (max-width: 820px) {
  :root {
    --frame-corner-size: 0px;
    --frame-side-width: 34px;
    --content-inline-padding: 20px;
    --frame-top-clearance: 150px;
    --frame-bottom-clearance: 140px;
    --content-safe-width: calc(100% - 2 * (var(--frame-side-width) + var(--content-inline-padding)));
  }

  .frame-corner {
    display: none;
  }

  .frame-side--left,
  .frame-side--right {
    display: block;
    aspect-ratio: 110 / 990;
    top: var(--frame-top-clearance);
  }

  .frame-side--left {
    background-image: url("assets/frame-pieces/mobile-left.png");
    background-image: image-set(
      url("assets/frame-pieces/mobile-left.avif") type("image/avif"),
      url("assets/frame-pieces/mobile-left.webp") type("image/webp")
    );
  }

  .frame-side--right {
    background-image: url("assets/frame-pieces/mobile-right.png");
    background-image: image-set(
      url("assets/frame-pieces/mobile-right.avif") type("image/avif"),
      url("assets/frame-pieces/mobile-right.webp") type("image/webp")
    );
  }
}

@media (min-width: 821px) {
  .frame-band {
    display: none;
  }

  .frame-corner,
  .frame-side--left,
  .frame-side--right {
    display: block;
  }
}

/* Fixed (viewport-relative), unlike .frame-layer: petals/sparkles are
   ambient atmosphere that should stay visible in the viewport as the
   guest scrolls through a page taller than one screen, rather than
   being tied to a single document-relative fall distance that would
   only ever play out near the very top of a long page. A shared
   filter keeps their colour and light consistent with the frame
   artwork above. */
.particle-layer {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  filter: saturate(1.05) brightness(1.02);
}

.petal {
  position: absolute;
  top: -10%;
  /* Plain url() first (PNG fallback for browsers without image-set()
     support), then image-set() with AVIF preferred over WebP — same
     progressive-enhancement pattern as the frame pieces above. An
     unsupporting browser treats image-set() as invalid and keeps the
     prior, valid url() declaration. */
  background-image: url("assets/petal-sprites.png");
  background-image: image-set(
    url("assets/petal-sprites.avif") type("image/avif"),
    url("assets/petal-sprites.webp") type("image/webp")
  );
  background-repeat: no-repeat;
  border-radius: 40%;
  opacity: 0;
  animation-name: petal-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}

@keyframes petal-fall {
  0%    { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
  8%    { opacity: 0.95; }
  92%   { opacity: 0.85; }
  100%  { transform: translate3d(var(--wind, 0px), 115vh, 0) rotate(var(--rot, 180deg)); opacity: 0; }
}

.sparkle {
  position: absolute;
  background-image: url("assets/sparkle-sprites.png");
  background-image: image-set(
    url("assets/sparkle-sprites.avif") type("image/avif"),
    url("assets/sparkle-sprites.webp") type("image/webp")
  );
  background-repeat: no-repeat;
  opacity: 0;
  animation-name: sparkle-pulse;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}

@keyframes sparkle-pulse {
  0%, 100% { opacity: 0; transform: scale(0.6); }
  45%      { opacity: 0.9; transform: scale(1); }
  55%      { opacity: 0.9; transform: scale(1); }
  70%      { opacity: 0; transform: scale(0.85); }
}

@media (prefers-reduced-motion: reduce) {
  .petal, .sparkle { display: none; }
}

/* No card, no border, no drop shadow, no background fill on <main> or
   any section below — only soft, edgeless radial washes that fade to
   fully transparent well inside the column so no rectangle is ever
   visible. These exist purely to keep body text readable over the
   busier upper portion of the artwork; the lower half of a long page,
   away from the densest florals, needs little to none. */
main {
  position: relative;
  z-index: 2;
  width: var(--content-safe-width);
  max-width: var(--content-safe-width);
  margin: 0 auto;
  padding: var(--frame-top-clearance) var(--content-inline-padding) var(--frame-bottom-clearance);
  background:
    radial-gradient(60% 44% at 50% 9%, rgba(255, 252, 245, 0.82), rgba(255, 252, 245, 0) 76%),
    radial-gradient(65% 45% at 50% 46%, rgba(255, 252, 245, 0.32), rgba(255, 252, 245, 0) 78%),
    radial-gradient(60% 42% at 50% 88%, rgba(255, 252, 245, 0.4), rgba(255, 252, 245, 0) 76%);
}

.hero {
  text-align: center;
}

.eyebrow {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 1.5rem;
}

/* Couple-name line formats (Part 3). The renderer emits three
   semantic spans (person / ampersand / person) inside a wrapper
   carrying names-line--inline or names-line--stacked, decided once at
   render time in names.ts. Both formats share this base styling; only
   layout (flex row vs. stacked block) and font-size differ. */
.names-line {
  margin: 0 0 0.75rem;
  color: var(--burgundy);
  max-width: 100%;
}

.name-person,
.name-amp {
  font-family: var(--font-calligraphy);
  font-weight: 400;
  /* Soft ivory glow (large blur, no offset) lifts the calligraphy off
     busy floral artwork wherever the two overlap, without ever
     drawing a visible box — the "subtle localized gradient" the owner
     asked for, applied per-glyph via text-shadow rather than as a
     background panel. A tighter, faint warm shadow underneath adds a
     touch of restrained depth. */
  text-shadow:
    0 0 22px rgba(255, 252, 245, 0.9),
    0 0 44px rgba(255, 252, 245, 0.55),
    0 2px 14px rgba(90, 26, 31, 0.12);
}

/* Inline (Format A — "Eleanor Whitfield & Julian Marsh"): a flex row,
   never wrapping (the render-time decision already guarantees this
   fits the desktop safe area at its largest possible size), each
   name's own text never breaking internally. */
.names-line--inline {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.4em;
  max-width: var(--content-safe-width);
  margin-left: auto;
  margin-right: auto;
}

.names-line--inline .name-person,
.names-line--inline .name-amp {
  white-space: nowrap;
  font-size: clamp(2.2rem, 4.2vw, 3.6rem);
  line-height: 1.1;
}

/* Stacked (Format B — three lines, ampersand alone in the middle):
   each span is its own block-level line by construction, so the
   ampersand can never end up attached to either name. */
.names-line--stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.names-line--stacked .name-person,
.names-line--stacked .name-amp {
  display: block;
  text-align: center;
  font-size: clamp(2.6rem, 11vw, 4.4rem);
  line-height: 1.15;
  max-width: 100%;
  overflow-wrap: break-word;
}

.names-line--stacked .name-amp {
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  margin: 0.1em 0;
}

/* Mobile always stacks (Part 3: "mobile should default to the
   three-line format"), regardless of which format the renderer chose
   for desktop — this overrides names-line--inline's flex-row layout
   outright below the frame breakpoint. */
@media (max-width: 820px) {
  .names-line--inline {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
  }

  .names-line--inline .name-person,
  .names-line--inline .name-amp {
    display: block;
    white-space: normal;
    text-align: center;
    font-size: clamp(2.4rem, 10vw, 3.4rem);
    line-height: 1.15;
    overflow-wrap: break-word;
  }

  .names-line--inline .name-amp {
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    margin: 0.1em 0;
  }

  .names-line--stacked .name-person,
  .names-line--stacked .name-amp {
    font-size: clamp(2.4rem, 10vw, 3.4rem);
  }

  .names-line--stacked .name-amp {
    font-size: clamp(1.5rem, 4.5vw, 2rem);
  }
}

.event-date {
  font-family: var(--font-display-serif);
  font-weight: 400;
  font-style: italic;
  font-size: 1.05rem;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
  margin: 0;
  text-shadow: 0 0 14px rgba(255, 252, 245, 0.8);
}

.ornament-divider {
  width: 6rem;
  height: 1px;
  margin: 3rem auto;
  background: linear-gradient(90deg, transparent, var(--gold) 50%, transparent);
}

.welcome-section {
  margin-top: 3.5rem;
}

.welcome-text {
  text-align: center;
  font-family: var(--font-body-serif);
  font-size: 1.15rem;
  font-style: italic;
  color: var(--ink);
  max-width: 32rem;
  margin: 0 auto;
}

.section-label {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  text-align: center;
  color: var(--burgundy);
  margin: 0 0 2rem;
}

.schedule-section, .venue-section, .response-section {
  margin-top: 4.5rem;
}

.schedule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.schedule-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: center;
}

.schedule-time {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gold);
}

.schedule-title {
  font-family: var(--font-display-serif);
  font-weight: 600;
  font-size: 1.2rem;
  color: var(--ink);
}

.schedule-description {
  font-family: var(--font-body-serif);
  font-size: 0.92rem;
  color: var(--ink-soft);
}

.venue-block {
  text-align: center;
}

.venue-name {
  font-family: var(--font-display-serif);
  font-weight: 400;
  font-size: 1.45rem;
  margin: 0 0 0.4rem;
}

.venue-address {
  font-family: var(--font-body-serif);
  color: var(--ink-soft);
  margin: 0 0 1.1rem;
}

.map-link {
  display: inline-block;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--burgundy);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dress-code {
  margin-top: 1.6rem;
  font-family: var(--font-body-serif);
  font-style: italic;
  font-size: 0.92rem;
  color: var(--ink-soft);
}

.response-section {
  text-align: center;
}

.response-heading {
  font-family: var(--font-calligraphy);
  font-weight: 400;
  font-size: clamp(2.1rem, 6vw, 2.75rem);
  color: var(--burgundy);
  margin: 0 0 0.9rem;
  text-shadow:
    0 0 18px rgba(255, 252, 245, 0.85),
    0 0 36px rgba(255, 252, 245, 0.5),
    0 1px 12px rgba(90, 26, 31, 0.1);
}

.response-supporting,
.response-deadline {
  font-family: var(--font-body-serif);
  font-size: 0.98rem;
  color: var(--ink-soft);
  margin: 0 0 2rem;
}

.response-supporting + .response-deadline {
  margin-top: -1.2rem;
}

.rsvp-cta {
  display: inline-block;
  padding: 0.8rem 2.2rem;
  border-top: 1px solid var(--gold);
  border-bottom: 1px solid var(--gold);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--burgundy);
  text-decoration: none;
  transition: background-color 200ms ease, color 200ms ease;
}

.rsvp-cta:hover, .rsvp-cta:focus-visible {
  background-color: rgba(90, 26, 31, 0.08);
}

.rsvp-cta:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}

.closing {
  margin-top: 5rem;
  margin-bottom: 3rem;
  text-align: center;
  font-family: var(--font-calligraphy);
  font-size: clamp(1.6rem, 5vw, 2rem);
  color: var(--ink);
  text-shadow:
    0 0 16px rgba(255, 252, 245, 0.8),
    0 0 32px rgba(255, 252, 245, 0.45);
}

a { color: inherit; }

a:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
</style>
</head>
<body>
<div class="page">
<div class="frame-corner frame-corner--top-left" aria-hidden="true"></div>
<div class="frame-corner frame-corner--top-right" aria-hidden="true"></div>
<div class="frame-corner frame-corner--bottom-left" aria-hidden="true"></div>
<div class="frame-corner frame-corner--bottom-right" aria-hidden="true"></div>
<div class="frame-side frame-side--left" aria-hidden="true"></div>
<div class="frame-side frame-side--right" aria-hidden="true"></div>
<div class="frame-band frame-band--top" aria-hidden="true"></div>
<div class="frame-band frame-band--bottom" aria-hidden="true"></div>
<div class="particle-layer" aria-hidden="true">
${petalsMarkup}
${sparklesMarkup}
</div>
<main>

<header class="hero">
<span class="eyebrow">${escapeHtml(data.openingLine)}</span>
${namesMarkup}
<p class="event-date">${escapeHtml(data.eventDateDisplay)}</p>
</header>

<div class="ornament-divider" aria-hidden="true"></div>

<section class="welcome-section">
<p class="welcome-text">${escapeHtml(data.introLine)}</p>
</section>

<section class="schedule-section">
<h2 class="section-label">Schedule</h2>
<ol class="schedule-list">
${scheduleMarkup}
</ol>
</section>

<section class="venue-section">
<h2 class="section-label">Venue &amp; Directions</h2>
<div class="venue-block">
<p class="venue-name">${escapeHtml(data.venueName)}</p>
<p class="venue-address">${escapeHtml(data.venueAddress)}</p>
<a class="map-link" href="${escapeAttr(data.mapUrl)}">View directions</a>
${data.dressCode ? `<p class="dress-code">${escapeHtml(data.dressCode)}</p>` : ""}
</div>
</section>

${responseMarkup}

<footer class="closing">
${escapeHtml(data.closingLine)}
</footer>

</main>
</div>
</body>
</html>
`;
}
