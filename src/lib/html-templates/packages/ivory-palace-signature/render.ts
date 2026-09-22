/**
 * Renderer for the Ivory Palace — Signature Edition trusted template.
 *
 * Produces a complete, standalone HTML document string from validated
 * composition data. Every interpolated value is escaped; every
 * decorative/motion value comes from the fixed presets in
 * particles.ts, never from input data. Zero <script> tags anywhere in
 * this file's output — this is not merely a lint rule this package
 * follows by convention (see ../security.ts's FORBIDDEN_PATTERNS,
 * unconditional on <script>), it is an architectural requirement: a
 * generated document from this pipeline is designed to eventually be
 * served inside an `iframe sandbox="allow-same-origin"` with no
 * `allow-scripts` (docs/html-invitation-generator/ARCHITECTURE.md §7),
 * so any script here would be inert there anyway. Every piece of
 * "code-controlled motion" this template needs (scene reveal,
 * parallax, petals, sparkles, lamp pulse — assets/source-spec/
 * MOTION-SPEC.md) is implemented in pure CSS, including scroll-linked
 * effects via the `animation-timeline: view()`/`scroll()` CSS
 * functions, progressively enhanced behind `@supports` with a fully
 * static, fully readable default for browsers that don't support them
 * (which is also exactly the `prefers-reduced-motion: reduce` and
 * `prefers-reduced-data: reduce` fallback — see the shared
 * `.motion-safe` gating below).
 *
 * Video strategy (assets/source-spec/PERFORMANCE-NOTES.md +
 * MOTION-SPEC.md): every one of the five Owner-approved Gemini videos
 * is `preload="none"` with native `controls` and its own poster frame,
 * positioned exactly over its scene's static artwork. Nothing is
 * fetched until the guest taps play — a zero-script guest gesture is
 * the *only* mechanism available under the no-<script> boundary above
 * to guarantee a video is never fetched speculatively, which trivially
 * satisfies "do not download every video on initial page load" and
 * "request the opening video after interaction readiness" (the tap
 * itself is the interaction) at a stricter bar than IntersectionObserver-
 * based prefetch would (this never fetches even a viewed-but-untapped
 * video). Ambient/finale videos carry `loop`; the opening door video
 * does not, so it plays exactly once and holds its final frame per
 * native <video> behavior. `prefers-reduced-motion: reduce` and
 * `prefers-reduced-data: reduce` (the Save-Data client hint's CSS
 * media feature) both hide every <video> outright, leaving only the
 * always-present static artwork underneath — this is the "usable and
 * complete without animation" and "honour save-data" requirement,
 * satisfied by construction rather than a runtime check.
 */

import { escapeAttr, escapeHtml } from "@/lib/html-templates/security";
import type { CeremonyData, GalleryPhotoData, IvoryPalaceData } from "./schema";
import {
  PETAL_INSTANCES,
  SPARKLE_INSTANCES,
  PETAL_SHEET_COLS,
  PETAL_SHEET_ROWS,
  PETAL_CELL_PX,
  SPARKLE_SHEET_COLS,
  SPARKLE_SHEET_ROWS,
  SPARKLE_SHEET_W,
  SPARKLE_SHEET_H,
  type PetalInstance,
  type SparkleInstance,
} from "./particles";
import { chooseDesktopNameFormat } from "./names";

const DESKTOP_CONTENT_SAFE_WIDTH_PX = 620;
const DESKTOP_INLINE_NAME_MAX_FONT_PX = 72; // clamp() ceiling on .names-line--inline, mirrored in CSS below

// Live-content safe-area insets per scene, transcribed directly from
// assets/source-spec/SCENE-SPEC.md's "Live-content zone" column
// (x/y percentages of the 941x1672 master -> CSS inset percentages).
interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
const SAFE_AREAS: Record<string, SafeArea> = {
  opening: { top: 30, bottom: 20, left: 15, right: 15 },
  monogram: { top: 18, bottom: 32, left: 18, right: 18 },
  introduction: { top: 24, bottom: 31, left: 18, right: 18 },
  haldi: { top: 25, bottom: 33, left: 20, right: 20 },
  mehendi: { top: 23, bottom: 34, left: 20, right: 20 },
  sangeet: { top: 24, bottom: 34, left: 20, right: 20 },
  wedding: { top: 23, bottom: 33, left: 18, right: 18 },
  reception: { top: 23, bottom: 33, left: 19, right: 19 },
  formal: { top: 15, bottom: 28, left: 17, right: 17 },
  venueText: { top: 18, bottom: 53, left: 12, right: 12 },
  venueControls: { top: 52, bottom: 28, left: 12, right: 12 },
  blessing: { top: 18, bottom: 32, left: 18, right: 18 },
  finale: { top: 12, bottom: 22, left: 14, right: 14 },
};

/**
 * Only `top`/`left`/`right` are emitted — `bottom` is deliberately
 * left out of the inline style, even though SCENE-SPEC.md documents a
 * bottom bound too (kept in the SAFE_AREAS table above as a reference
 * to that documented zone). An absolutely positioned box with top/
 * left/right set but bottom auto sizes its height to its own content
 * rather than being clamped to a fixed box — which matters because
 * couple names and RSVP copy are guest-editable and can run
 * considerably longer than the fixture text the zone was sized
 * against (see the long-names fixture); a fixed-height box silently
 * overlapping the artwork or the next block on long input is worse
 * than a box that grows downward from its documented top anchor.
 */
function safeAreaStyle(area: SafeArea): string {
  return `top:${area.top}%;left:${area.left}%;right:${area.right}%;`;
}

// ---------------------------------------------------------------------------
// Scene artwork (AVIF/WebP/PNG responsive picture + blurred desktop backdrop)
// ---------------------------------------------------------------------------

function scenePicture(key: string, altText: string, eager: boolean): string {
  const alt = altText.length > 0 ? escapeAttr(altText) : "";
  return `<picture class="scene-artwork">
<source type="image/avif" srcset="assets/scenes/${key}-541.avif 541w, assets/scenes/${key}-941.avif 941w" sizes="(max-width: 820px) 100vw, 620px">
<source type="image/webp" srcset="assets/scenes/${key}-541.webp 541w, assets/scenes/${key}-941.webp 941w" sizes="(max-width: 820px) 100vw, 620px">
<img src="assets/scenes/${key}-941.png" alt="${alt}" width="941" height="1672" loading="${eager ? "eager" : "lazy"}" decoding="async">
</picture>`;
}

/**
 * Opens a scene section plus its `.scene-frame` — the one positioned
 * box (centered, capped at var(--scene-max-width), full scene height)
 * that the artwork, video, and safe-area content all share as their
 * common coordinate space. This is what makes SCENE-SPEC.md's
 * percentage safe-area insets (x/y % of the 941x1672 master) resolve
 * correctly on desktop too — without a shared frame, insets computed
 * against the full-width .scene would drift away from the actually
 * displayed, narrower centered artwork box once the viewport exceeds
 * --scene-max-width.
 */
function sceneOpenTag(key: string, extraClass: string, hasBackdrop: boolean): string {
  const backdrop = hasBackdrop ? `background-image:url(assets/scenes/${key}-backdrop.webp);` : "";
  return `<section id="scene-${key}" class="scene ${extraClass}" style="${escapeAttr(backdrop)}">
<div class="scene-frame">`;
}

function sceneCloseTag(): string {
  return `</div>
</section>`;
}

// ---------------------------------------------------------------------------
// Video (Owner-approved Gemini animations) — see file header for the
// preload=none/controls/no-autoplay rationale.
// ---------------------------------------------------------------------------

function sceneVideo(animId: string, label: string, loop: boolean): string {
  const loopAttr = loop ? " loop" : "";
  return `<div class="scene-video-wrap">
<video class="scene-video" controls preload="none" muted playsinline${loopAttr} poster="assets/video/${animId}-poster.webp" aria-label="${escapeAttr(label)}">
<source src="assets/video/${animId}.webm" type="video/webm">
<source src="assets/video/${animId}.mp4" type="video/mp4">
</video>
</div>`;
}

// ---------------------------------------------------------------------------
// Petals / sparkles (see particles.ts header for the sheet-grid math)
// ---------------------------------------------------------------------------

function renderPetal(petal: PetalInstance, index: number): string {
  const bgX = -(petal.sprite.col * PETAL_CELL_PX);
  const bgY = -(petal.sprite.row * PETAL_CELL_PX);
  const scale = petal.sizePx / PETAL_CELL_PX;
  const sheetW = PETAL_SHEET_COLS * PETAL_CELL_PX * scale;
  const sheetH = PETAL_SHEET_ROWS * PETAL_CELL_PX * scale;
  const style = [
    `left:${petal.leftPercent}%`,
    `width:${petal.sizePx}px`,
    `height:${petal.sizePx}px`,
    `animation-duration:${petal.durationSeconds}s`,
    `animation-delay:${petal.delaySeconds}s`,
    `--wind:${petal.windDriftPx}px`,
    `--rot:${petal.rotationDeg}deg`,
    `--peak-opacity:${petal.opacityPeak}`,
    `background-position:${bgX * scale}px ${bgY * scale}px`,
    `background-size:${sheetW}px ${sheetH}px`,
  ].join(";");
  return `<span class="petal" style="${escapeAttr(style)}" data-petal-index="${index}"></span>`;
}

function renderSparkle(sparkle: SparkleInstance, index: number): string {
  const cellW = SPARKLE_SHEET_W / SPARKLE_SHEET_COLS;
  const cellH = SPARKLE_SHEET_H / SPARKLE_SHEET_ROWS;
  const col = sparkle.cellIndex % SPARKLE_SHEET_COLS;
  const row = Math.floor(sparkle.cellIndex / SPARKLE_SHEET_COLS);
  const scale = sparkle.sizePx / cellW;
  const bgX = -(col * cellW * scale);
  const bgY = -(row * cellH * scale);
  const style = [
    `left:${sparkle.leftPercent}%`,
    `top:${sparkle.topPercent}%`,
    `width:${sparkle.sizePx}px`,
    `height:${sparkle.sizePx}px`,
    `animation-duration:${sparkle.cycleSeconds}s`,
    `animation-delay:${sparkle.delaySeconds}s`,
    `background-position:${bgX}px ${bgY}px`,
    `background-size:${SPARKLE_SHEET_W * scale}px ${SPARKLE_SHEET_H * scale}px`,
  ].join(";");
  return `<span class="sparkle" style="${escapeAttr(style)}" data-sparkle-index="${index}"></span>`;
}

const petalsMarkup = PETAL_INSTANCES.map(renderPetal).join("");
const sparklesMarkup = SPARKLE_INSTANCES.map(renderSparkle).join("");
const particleLayer = `<div class="particle-layer" aria-hidden="true">${petalsMarkup}${sparklesMarkup}</div>`;
const lampGlow = `<div class="lamp-glow" aria-hidden="true"></div>`;

// ---------------------------------------------------------------------------
// Individual scenes
// ---------------------------------------------------------------------------

function renderOpeningScene(): string {
  return `${sceneOpenTag("opening-reveal", "scene--opening", false)}
<div class="scene-artwork-stack">
${scenePicture("opening-closed", "", true)}
${sceneVideo("IP-ANIM-OPEN-001", "The palace doors opening", false)}
</div>
<div class="scene-content scene-content--center" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.opening))}">
<p class="opening-hint">Tap the doors to begin</p>
</div>
<div class="reduced-motion-only">${scenePicture("opening-reveal", "", true)}</div>
${sceneCloseTag()}`;
}

function renderMonogramScene(data: IvoryPalaceData): string {
  return `${sceneOpenTag("monogram", "scene--monogram scene--ink", true)}
${scenePicture("monogram", "", false)}
${particleLayer}
<div class="scene-content scene-content--center scene-reveal" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.monogram))}">
<p class="scene-eyebrow">Welcome</p>
<p class="scene-lede">${escapeHtml(data.welcomeLine)}</p>
</div>
${sceneCloseTag()}`;
}

function renderIntroductionScene(data: IvoryPalaceData): string {
  const format = chooseDesktopNameFormat(
    data.coupleName1,
    data.coupleName2,
    DESKTOP_CONTENT_SAFE_WIDTH_PX,
    DESKTOP_INLINE_NAME_MAX_FONT_PX,
  );
  return `${sceneOpenTag("introduction", "scene--introduction scene--ink", true)}
${scenePicture("introduction", "", false)}
<div class="scene-content scene-content--center scene-reveal" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.introduction))}">
<h1 class="names-line names-line--${format}">
<span class="name-person">${escapeHtml(data.coupleName1)}</span>
<span class="name-amp">&amp;</span>
<span class="name-person">${escapeHtml(data.coupleName2)}</span>
</h1>
<p class="event-date">${escapeHtml(data.eventDateDisplay)}</p>
<p class="intro-line">${escapeHtml(data.introLine)}</p>
</div>
${sceneCloseTag()}`;
}

interface CeremonyConfig {
  key: "haldi" | "mehendi" | "sangeet" | "wedding" | "reception";
  label: string;
  animId?: string;
  loopVideo?: boolean;
  textColorClass: "scene--ink" | "scene--light";
  showLampGlow?: boolean;
}

const CEREMONY_CONFIGS: CeremonyConfig[] = [
  { key: "haldi", label: "Haldi", animId: "IP-ANIM-HALDI-001", loopVideo: true, textColorClass: "scene--ink" },
  { key: "mehendi", label: "Mehendi", textColorClass: "scene--ink" },
  { key: "sangeet", label: "Sangeet", animId: "IP-ANIM-SANGEET-001", loopVideo: true, textColorClass: "scene--light", showLampGlow: true },
  { key: "wedding", label: "The Wedding Ceremony", textColorClass: "scene--ink" },
  { key: "reception", label: "Reception", animId: "IP-ANIM-RECEPTION-001", loopVideo: true, textColorClass: "scene--light", showLampGlow: true },
];

function renderCeremonyScene(config: CeremonyConfig, data: CeremonyData | undefined): string {
  if (!data) return "";
  const safeArea = SAFE_AREAS[config.key];
  const video = config.animId ? sceneVideo(config.animId, `Ambient motion for the ${config.label} scene`, Boolean(config.loopVideo)) : "";
  return `${sceneOpenTag(config.key, `scene--${config.key} ${config.textColorClass}`, true)}
<div class="scene-artwork-stack">
${scenePicture(config.key, "", false)}
${video}
</div>
${config.showLampGlow ? lampGlow : ""}
${config.showLampGlow ? particleLayer : ""}
<div class="scene-content scene-content--center scene-reveal" style="${escapeAttr(safeAreaStyle(safeArea))}">
<p class="scene-eyebrow">${escapeHtml(config.label)}</p>
<p class="ceremony-date">${escapeHtml(data.dateDisplay)}${data.timeDisplay ? ` &middot; ${escapeHtml(data.timeDisplay)}` : ""}</p>
<p class="ceremony-venue">${escapeHtml(data.venueName)}</p>
${data.venueDetail ? `<p class="ceremony-detail">${escapeHtml(data.venueDetail)}</p>` : ""}
</div>
${sceneCloseTag()}`;
}

function renderFormalScene(data: IvoryPalaceData): string {
  const lines = data.formalInvitation.bodyLines.map((line) => `<p class="formal-line">${escapeHtml(line)}</p>`).join("");
  return `${sceneOpenTag("formal", "scene--formal scene--ink", true)}
${scenePicture("formal", "", false)}
<div class="scene-content scene-content--center scene-reveal" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.formal))}">
<p class="scene-eyebrow">${escapeHtml(data.formalInvitation.headline)}</p>
<div class="formal-body">${lines}</div>
</div>
${sceneCloseTag()}`;
}

function renderGallerySlot(photo: GalleryPhotoData | undefined, index: number, position: "top" | "middle" | "bottom"): string {
  if (!photo) {
    return `<div class="gallery-slot gallery-slot--${position} gallery-slot--empty" data-slot-index="${index}" aria-hidden="true"></div>`;
  }
  return `<div class="gallery-slot gallery-slot--${position}" data-slot-index="${index}">
<img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.alt)}" loading="lazy" decoding="async">
</div>`;
}

function renderGalleryScene(data: IvoryPalaceData): string {
  const positions: Array<"top" | "middle" | "bottom"> = ["top", "top", "middle", "middle", "bottom", "bottom"];
  const slots = positions.map((position, index) => renderGallerySlot(data.gallery[index], index, position)).join("");
  return `${sceneOpenTag("gallery", "scene--gallery scene--ink", true)}
${scenePicture("gallery", "", false)}
<div class="scene-content scene-content--gallery scene-reveal">
<p class="scene-eyebrow">Gallery</p>
<div class="gallery-grid">${slots}</div>
</div>
${sceneCloseTag()}`;
}

function renderVenueScene(data: IvoryPalaceData): string {
  const response = data.response;
  // A single stacked content block (venue info, then RSVP), not two
  // independently top-anchored boxes — variable-length RSVP copy
  // pushed a second, separately positioned box to visually collide
  // with the venue text above it; one flowing block with a natural
  // gap between its two parts can't overlap itself.
  return `${sceneOpenTag("venue", "scene--venue scene--ink", true)}
${scenePicture("venue", "", false)}
<div class="scene-content scene-content--top scene-reveal venue-block-wrap" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.venueText))}">
<p class="scene-eyebrow">Venue &amp; Directions</p>
<p class="venue-name">${escapeHtml(data.venue.name)}</p>
<p class="venue-address">${escapeHtml(data.venue.address)}</p>
<a class="map-link" href="${escapeAttr(data.venue.mapUrl)}">View directions</a>
<div class="response-section">
${
  response
    ? `<h2 class="response-heading">${escapeHtml(response.heading)}</h2>
${response.supportingMessage ? `<p class="response-supporting">${escapeHtml(response.supportingMessage)}</p>` : ""}
${response.deadline ? `<p class="response-deadline">Kindly respond by ${escapeHtml(response.deadline)}.</p>` : ""}
<a class="rsvp-cta" href="${escapeAttr(response.url)}">${escapeHtml(response.buttonLabel)}</a>`
    : `<p class="response-disabled-note">Details to follow.</p>`
}
</div>
</div>
${sceneCloseTag()}`;
}

function renderBlessingScene(data: IvoryPalaceData): string {
  return `${sceneOpenTag("blessing", "scene--blessing scene--light", true)}
${scenePicture("blessing", "", false)}
${particleLayer}
<div class="scene-content scene-content--center scene-reveal" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.blessing))}">
<p class="scene-eyebrow">With Blessings</p>
<p class="blessing-line">${escapeHtml(data.familyBlessingLine)}</p>
</div>
${sceneCloseTag()}`;
}

function renderFinaleScene(data: IvoryPalaceData): string {
  return `${sceneOpenTag("finale", "scene--finale scene--light", true)}
<div class="scene-artwork-stack">
${scenePicture("finale-bg", "An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace.", false)}
<picture class="scene-artwork scene-artwork--overlay">
<source type="image/avif" srcset="assets/scenes/finale-couple-941.avif">
<source type="image/webp" srcset="assets/scenes/finale-couple-941.webp">
<img src="assets/scenes/finale-couple-941.png" alt="" width="941" height="1672" loading="lazy" decoding="async">
</picture>
${sceneVideo("IP-ANIM-FINALE-001", "Couple finale ambient motion", true)}
</div>
${particleLayer}
<div class="scene-content scene-content--top scene-reveal" style="${escapeAttr(safeAreaStyle(SAFE_AREAS.finale))}">
<p class="closing">${escapeHtml(data.closingLine)}</p>
</div>
${sceneCloseTag()}`;
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

export function renderIvoryPalaceInvitation(data: IvoryPalaceData): string {
  const title = `${data.coupleName1} & ${data.coupleName2}`;
  const ceremonyScenes = CEREMONY_CONFIGS.map((config) => renderCeremonyScene(config, data.ceremonies[config.key])).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
${DOCUMENT_STYLES}
</style>
</head>
<body>
<div class="page">
${renderOpeningScene()}
${renderMonogramScene(data)}
${renderIntroductionScene(data)}
${ceremonyScenes}
${renderFormalScene(data)}
${renderGalleryScene(data)}
${renderVenueScene(data)}
${renderBlessingScene(data)}
${renderFinaleScene(data)}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

const DOCUMENT_STYLES = `
/* Self-hosted fonts — see assets/fonts/FONTS.md for name, source and
   SIL Open Font License 1.1 text for each. Referenced only by relative
   path within this document's own inline styles; no font CDN, no
   runtime request to an external origin. */
@font-face {
  font-family: "Ivory Calligraphy";
  src: url("assets/fonts/alex-brush-latin-400-normal.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Ivory Display Serif";
  src: url("assets/fonts/cormorant-garamond-latin-500-600-variable.woff2") format("woff2");
  font-weight: 500 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Ivory Body Serif";
  src: url("assets/fonts/source-serif-4-latin-400-500-variable.woff2") format("woff2");
  font-weight: 400 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Ivory Sans";
  src: url("assets/fonts/manrope-latin-500-600-variable.woff2") format("woff2");
  font-weight: 500 600;
  font-style: normal;
  font-display: swap;
}

:root {
  /* Exact palette — assets/source-spec/ART-DIRECTION.md */
  --ivory: #F3E7D2;
  --sandstone: #CDB99A;
  --champagne: #B78A47;
  --burgundy: #6B1727;
  --rose: #B96872;
  --marigold: #D58A22;
  --botanical-green: #526A4C;
  --candlelight: #F2BF73;
  --ruby: #8D1632;
  --peacock: #1E5A5D;
  --ink: #34251F;
  --light-text: #FFF6E8;

  --font-calligraphy: "Ivory Calligraphy", "Segoe Script", "Brush Script MT", cursive;
  --font-display: "Ivory Display Serif", "Iowan Old Style", Baskerville, Georgia, serif;
  --font-body: "Ivory Body Serif", "Source Serif Pro", Georgia, serif;
  --font-sans: "Ivory Sans", Inter, "Segoe UI", Arial, sans-serif;

  --scene-max-width: 620px;
  color-scheme: light;
}

* { box-sizing: border-box; }
html { background: var(--ink); }
body {
  margin: 0;
  font-family: var(--font-body);
  line-height: 1.55;
  background: var(--ink);
}
a { color: inherit; }
a:focus-visible, button:focus-visible, video:focus-visible {
  outline: 2px solid var(--candlelight);
  outline-offset: 3px;
}

.page { position: relative; }

/* --- Scene shell ------------------------------------------------------- */

.scene {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background-color: #1b120e;
  background-position: center;
  background-size: cover;
}

/* .scene-frame is the one positioned box — centered, capped at
   var(--scene-max-width), full scene height — that the artwork,
   video, and safe-area content all share as their common coordinate
   space. Every SCENE-SPEC.md percentage safe-area inset (x/y % of the
   941x1672 master) is authored against *this* box, not the full-width
   .scene, so it resolves correctly on both mobile (where the frame
   equals the viewport width) and desktop (where the frame is narrower
   than the viewport and centered) — without this shared frame, insets
   computed against the full-width .scene would drift away from the
   actually displayed, narrower centered artwork once the viewport
   exceeds --scene-max-width. .scene-artwork-stack and
   .reduced-motion-only are plain, unpositioned wrapper divs nested
   inside the frame purely to group/toggle content. */
.scene-frame {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--scene-max-width);
  height: 100%;
  max-height: 100vh;
}

.scene-artwork {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.scene-artwork img { width: 100%; height: 100%; object-fit: cover; display: block; }

.scene-artwork--overlay { pointer-events: none; z-index: 1; }

@media (min-width: 821px) {
  .scene-frame { box-shadow: 0 40px 120px rgba(0, 0, 0, 0.45); }
}

/* Video sits exactly over its scene's static artwork; until tapped,
   only its poster (visually near-identical to the static frame) is
   visible — see file header for why no autoplay/preload is used. */
.scene-video-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 2;
}

.scene-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.opening-hint {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--light-text);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.reduced-motion-only { display: none; }

@media (prefers-reduced-motion: reduce), (prefers-reduced-data: reduce) {
  .scene-video-wrap { display: none; }
  .scene--opening .scene-artwork-stack picture:first-child { display: none; }
  .reduced-motion-only { display: block; }
}

/* --- Scene content / safe areas ---------------------------------------- */

/* No explicit width: with left/right both set (from the inline
   safeAreaStyle() insets) and width left auto, absolute positioning
   computes the box width as exactly (frame width - left - right) —
   the correct reading of SCENE-SPEC.md's x-percentage safe areas.
   Setting an explicit width here as well would over-constrain the box
   and cause the browser to silently discard the 'right' inset. */
.scene-content {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
}

.scene-content--top { justify-content: flex-start; }

.scene--ink .scene-content { color: var(--ink); }
.scene--light .scene-content { color: var(--light-text); }

.scene--ink .scene-content,
.scene--light .scene-content {
  /* Feathered colour-grade scrim, never a visible card — CULTURAL-AND-
     ACCESSIBILITY-NOTES.md: "a local contrast scrim only if it is a
     feathered colour-grade layer, not a visible card." */
  background: radial-gradient(65% 55% at 50% 50%, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0) 78%);
}
.scene--ink .scene-content {
  background: radial-gradient(65% 55% at 50% 50%, rgba(255, 246, 232, 0.5), rgba(255, 246, 232, 0) 78%);
}

.scene-eyebrow {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  margin: 0 0 0.9rem;
}

.scene-lede {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: clamp(1.4rem, 5vw, 2rem);
  margin: 0;
  font-style: italic;
}

/* --- Names (couple introduction) --------------------------------------- */

.names-line { margin: 0 0 0.6rem; color: var(--burgundy); }
.scene--light .names-line { color: var(--light-text); }

.name-person, .name-amp {
  font-family: var(--font-calligraphy);
  font-weight: 400;
  text-shadow: 0 0 20px rgba(255, 246, 232, 0.85), 0 2px 12px rgba(0, 0, 0, 0.2);
}

.names-line--inline {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.4em;
}
.names-line--inline .name-person, .names-line--inline .name-amp {
  white-space: nowrap;
  font-size: clamp(2.1rem, 4.2vw, 4.5rem);
  line-height: 1.1;
}

.names-line--stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.names-line--stacked .name-person, .names-line--stacked .name-amp {
  display: block;
  text-align: center;
  font-size: clamp(2.4rem, 10vw, 4.2rem);
  line-height: 1.15;
  max-width: 100%;
  overflow-wrap: break-word;
}
.names-line--stacked .name-amp { font-size: clamp(1.5rem, 4.5vw, 2.2rem); margin: 0.1em 0; }

@media (max-width: 820px) {
  .names-line--inline { flex-direction: column; }
  .names-line--inline .name-person, .names-line--inline .name-amp {
    display: block; white-space: normal; font-size: clamp(2.2rem, 9vw, 3.2rem);
  }
  .names-line--inline .name-amp { font-size: clamp(1.4rem, 4.2vw, 1.9rem); margin: 0.1em 0; }
}

.event-date {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 1.05rem;
  margin: 0.4rem 0 1rem;
  text-shadow: 0 0 14px rgba(255, 246, 232, 0.7);
}
.intro-line {
  font-family: var(--font-body);
  font-size: 0.98rem;
  max-width: 30rem;
  margin: 0;
}

/* --- Ceremony scenes ----------------------------------------------------- */

.ceremony-date {
  font-family: var(--font-sans);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0 0 0.6rem;
  opacity: 0.9;
}
.ceremony-venue {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1.35rem;
  margin: 0 0 0.4rem;
}
.ceremony-detail {
  font-family: var(--font-body);
  font-size: 0.92rem;
  margin: 0;
  opacity: 0.92;
}

/* --- Formal invitation ---------------------------------------------------- */

.formal-body { display: flex; flex-direction: column; gap: 0.5rem; }
.formal-line { font-family: var(--font-body); font-size: 1rem; margin: 0; }
.formal-line:nth-child(4) { font-family: var(--font-calligraphy); font-size: 1.8rem; margin: 0.3rem 0; }
.formal-line:nth-child(6) { font-family: var(--font-calligraphy); font-size: 1.8rem; margin: 0.3rem 0; }

/* --- Gallery --------------------------------------------------------------- */

.scene--gallery .scene-content.scene-content--gallery {
  position: absolute;
  inset: 0;
  width: auto;
  max-width: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow-y: auto;
  padding: 3rem 1.5rem;
  color: var(--ink);
  background: none;
  z-index: 3;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-top: 1.5rem;
  width: 100%;
  max-width: 26rem;
}

.gallery-slot {
  position: relative;
  overflow: hidden;
  border-radius: 50% 50% 6% 6% / 32% 32% 4% 4%;
  aspect-ratio: 4 / 5;
  background: linear-gradient(160deg, #efe3ce, #e3d3b6);
  box-shadow: 0 12px 30px rgba(52, 37, 31, 0.18);
}
.gallery-slot--middle { aspect-ratio: 4 / 5; }
.gallery-slot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-slot--empty {
  /* Low-contrast ivory texture, never a black placeholder — SCENE-
     SPEC.md's documented empty-arch fallback. */
  background: repeating-linear-gradient(135deg, #efe3ce 0 12px, #e9dbc0 12px 24px);
}

/* --- Venue / RSVP ------------------------------------------------------------ */

.venue-name { font-family: var(--font-display); font-weight: 500; font-size: 1.4rem; margin: 0 0 0.3rem; }
.venue-address { font-family: var(--font-body); font-size: 0.95rem; margin: 0 0 0.9rem; }
.map-link {
  display: inline-block;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-decoration: underline;
  text-underline-offset: 3px;
  min-height: 44px;
  min-width: 44px;
  padding: 0.4rem 0.2rem;
}

.response-section { color: var(--ink); margin-top: 2.5rem; }
.response-heading {
  font-family: var(--font-calligraphy);
  font-weight: 400;
  font-size: clamp(1.9rem, 5.5vw, 2.5rem);
  margin: 0 0 0.7rem;
}
.response-supporting, .response-deadline, .response-disabled-note {
  font-family: var(--font-body);
  font-size: 0.92rem;
  margin: 0 0 1.2rem;
}
.rsvp-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.7rem 2rem;
  border-top: 1px solid var(--champagne);
  border-bottom: 1px solid var(--champagne);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background-color 200ms ease;
}
.rsvp-cta:hover, .rsvp-cta:focus-visible { background-color: rgba(107, 23, 39, 0.08); }

/* --- Blessing / finale ------------------------------------------------------- */

.blessing-line { font-family: var(--font-body); font-size: 1.02rem; max-width: 28rem; margin: 0; }
.closing {
  font-family: var(--font-calligraphy);
  font-size: clamp(1.8rem, 6vw, 2.6rem);
  margin: 0;
  text-shadow: 0 0 18px rgba(0, 0, 0, 0.35);
}

/* --- Particles: petals / sparkles / lamp glow --------------------------------- */

.particle-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}

.petal {
  position: absolute;
  top: -10%;
  background-image: url("assets/particles/petal-sheet.png");
  background-image: image-set(
    url("assets/particles/petal-sheet.avif") type("image/avif"),
    url("assets/particles/petal-sheet.webp") type("image/webp")
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
  0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
  8%   { opacity: var(--peak-opacity, 0.5); }
  92%  { opacity: calc(var(--peak-opacity, 0.5) * 0.85); }
  100% { transform: translate3d(var(--wind, 0px), 115vh, 0) rotate(var(--rot, 180deg)); opacity: 0; }
}

.sparkle {
  position: absolute;
  background-image: url("assets/particles/sparkle-sheet.png");
  background-image: image-set(
    url("assets/particles/sparkle-sheet.avif") type("image/avif"),
    url("assets/particles/sparkle-sheet.webp") type("image/webp")
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
  45%      { opacity: 0.18; transform: scale(1); }
  55%      { opacity: 0.18; transform: scale(1); }
  70%      { opacity: 0; transform: scale(0.85); }
}

.lamp-glow {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(45% 30% at 50% 30%, rgba(242, 191, 115, 0.35), rgba(242, 191, 115, 0) 70%);
  animation: lamp-pulse 4s ease-in-out infinite;
}
@keyframes lamp-pulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.93; }
}

@media (prefers-reduced-motion: reduce) {
  .petal, .sparkle, .lamp-glow { display: none; }
}

/* --- Scene reveal / parallax (progressive scroll-driven enhancement) ---------- */

.scene-reveal { opacity: 1; transform: none; }

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .scene-reveal {
      animation: scene-reveal-in 750ms ease-out both;
      animation-timeline: view(block 65% 0%);
      animation-range: entry;
    }
    .scene-artwork-stack {
      animation: scene-parallax 1 linear both;
      animation-timeline: view();
      animation-range: cover;
    }
  }
}
@keyframes scene-reveal-in {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes scene-parallax {
  from { transform: translateY(-3%); }
  to   { transform: translateY(3%); }
}
`;
