# Ivory Palace — Signature Edition: Implementation Report

Branch: `feature/ivory-palace-signature-v1` (based on `integration/hindu-wedding-registry-v1`)
Package: `src/lib/html-templates/packages/ivory-palace-signature/`
Status: **Local prototype complete. Not wired to any route, not deployed, not published.**

## 1. Reconciliation decisions

**Owner approval of static artwork.** The source package (`ivory-palace-signature-owner-review.zip`, extracted and verified: all 21 assets referenced in its `ASSET-MANIFEST.json` present on disk, zero missing) ships its own README/REVIEW-LOG marking static artwork `OWNER_REVIEW_REQUIRED` — "No Owner approval inferred" — with only the 5 Gemini animations recorded as `OWNER_APPROVED`. The Owner's implementation request explicitly stated approval of "the complete Ivory Palace static artwork package for HTML prototype implementation." That instruction is treated as the Owner-approval event the package's own process was waiting for, and implementation proceeded on that basis.

**Production-resolution gate — deferred, not waived.** Owner approval of composition does not waive the package's own flagged constraint: scene masters are 941×1672, below the 1080×1920 production-freeze minimum ("composition approval may proceed; production-resolution freeze may not" — README.md / ASSET-MANIFEST.json `productionResolutionGate`). Since this build is a local, unpublished prototype only, this is acceptable for now. **A rerender to ≥1080×1920 is required before any real production deployment of this template.**

**Asset-inclusion vs. provenance-only.** Only assets actually used by the render pipeline were processed into delivery derivatives and committed: 14 scene masters (AVIF/WebP at 541w/941w + a blurred desktop backdrop + PNG fallback), 1 alpha overlay (finale couple), 2 shared particle/light sprite sheets, and the 5 already-optimized Gemini video deliverables (WebM+MP4+poster each, unchanged from the source package). The QA-only collateral — `contact-sheets/`, `annotated-safe-areas/`, `rejected/` (empty), `GEMINI-ANIMATION-PROMPTS.md`, the raw `opening/layers/` alpha PNGs (superseded by the approved door-opening video; see §3) — was **not** committed to keep the repository lean; it remains reviewable in the original owner-review package. The 10 markdown spec documents were copied into `assets/source-spec/` so the package is self-documenting in-repo.

**Fonts sourced independently.** The package ships no font files (by design — "No font is included in this review package"). Alex Brush was reused byte-for-byte from `../timeless-editorial-v2/assets/fonts/` (already vetted in this repo). Cormorant Garamond, Source Serif 4, and Manrope were sourced from Google Fonts' CSS2 API + `fonts.gstatic.com` (OFL 1.1), each as a single variable-font file covering both required weights, with `OFL.txt` fetched from `github.com/google/fonts` alongside each. Full provenance in `assets/fonts/FONTS.md`.

## 2. What was built

One fixed, art-directed, mobile-first HTML template — `src/lib/html-templates/packages/ivory-palace-signature/` — structured identically to the existing `timeless-editorial-v2` sibling package (`schema.ts`, `names.ts`, `particles.ts`, `render.ts`, `fixture.ts`, tests, `assets/`), and **not wired into any route, the composition schema, or the database** — matching that package's own "reviewed, tested, standalone" convention. Route/schema integration is an explicit later phase (§6).

All 13 documented scenes are implemented in `render.ts`: palace doors (opening) → welcome/monogram → couple introduction → Haldi → Mehendi → Sangeet → main wedding → Reception → formal invitation → gallery → venue/map/RSVP → family blessing → couple finale. Every scene's placement follows `SCENE-SPEC.md`'s live-content zones and `ASSET-MANIFEST.json`'s anchoring/layer data, transcribed into `SAFE_AREAS` in `render.ts`.

Fictional content for **Sarvesh and Shakshina** (Mauritian Hindu wedding) lives in `fixture.ts`, entirely through the `IvoryPalaceDataSchema` structured contract in `schema.ts` — every name, date, venue, ceremony detail, formal-invitation line, and RSVP field is a real semantic HTML text node (never baked into an image), matching `timeless-editorial-v2/schema.ts`'s `safeText()`/`safeUrl()`/`.strict()` discipline.

### Zero-`<script>` architecture

`../security.ts`'s `validateGeneratedHtml()` unconditionally forbids `<script>` tags, inline event handlers, and `<link>` tags on any generated document from this pipeline — and `timeless-editorial-v2/render.ts` already ships zero JavaScript. This isn't just a lint convention: `docs/html-invitation-generator/ARCHITECTURE.md` §7 designs the eventual admin preview as an `iframe sandbox="allow-same-origin"` with **no** `allow-scripts`, so any script in a generated document would be inert there regardless. Every "code-controlled motion" requirement in `MOTION-SPEC.md` — scene reveal, restrained parallax, petals, sparkles, lamp pulse — is implemented in pure CSS, including scroll-linked effects via `animation-timeline: view()`/`scroll()`, progressively enhanced behind `@supports` with a fully static, fully readable default for browsers that don't support them (which doubles as the `prefers-reduced-motion: reduce` fallback).

### Video strategy

All 5 Owner-approved Gemini videos use WebM-first/MP4-fallback `<source>` ordering with each own poster frame, `preload="none"`, and native `controls` — **no `autoplay` anywhere**. Under the zero-`<script>` boundary above, a guest's tap on native controls is the only available zero-JS mechanism to guarantee a video is never fetched speculatively; verified in Playwright that **zero video bytes are requested on initial page load** (stricter than an IntersectionObserver-based lazy-load, which would still fetch an off-screen-but-viewed video). The opening door video carries no `loop` attribute (plays once, holds its final frame per native `<video>` behavior); Haldi, Sangeet, Reception, and finale carry `loop`. Mehendi has no video (none was supplied for it in the source package — static-only scene). Both `prefers-reduced-motion: reduce` and `prefers-reduced-data: reduce` (the Save-Data client hint's CSS media feature) hide every `<video>` outright via CSS, leaving the always-present static artwork beneath — verified in a real Chromium instance that `prefers-reduced-data` is a recognized media feature.

### Desktop presentation

Implements the documented "center the 9:16 document at a maximum visual height, extend laterally with darkened/blurred derivatives" strategy (`SCENE-SPEC.md` §Desktop): a `.scene-frame` element (centered, capped at 620px, full scene height) is the single positioning root shared by the artwork, video, and safe-area text content, sitting over a `.scene`-level blurred/darkened backdrop derivative of the same master. The mobile master is never stretched.

### Accessibility

Keyboard-reachable RSVP CTA and map link (real `<a>` elements, `:focus-visible` outlines, 44×44px minimum targets), decorative `alt=""` on non-meaningful scenes, the specific documented alt text on the finale artwork ("An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace."), `aria-hidden="true"` on particle/scrim layers, and DOM reading order independent of visual layer order (content divs are ordinary document-order siblings, never reordered visually via absolute stacking tricks that would fight screen-reader order).

## 3. A design decision worth flagging explicitly

The source package's 4 raw alpha-layer PNGs for the door-opening sequence (`opening/layers/IP-OPEN-L01..L04`) were **not** individually composited in CSS. The Owner separately supplied and approved a purpose-built Gemini video (`IP-ANIM-OPEN-001`) that already performs this exact animation from those same source layers. Re-implementing a manual CSS layer-compositing door animation would have duplicated — at lower fidelity — motion that already exists as an approved video asset, so the video is used as the primary door-opening experience, with the two door-state master PNGs (`IP-OPEN-001` closed / `IP-OPEN-002` reveal) as the poster and reduced-motion/save-data fallback.

## 4. Verification

| Check | Result |
|---|---|
| `npm run lint` (ESLint) | Clean, zero warnings on the new package |
| `npx tsc --noEmit` | Clean, zero errors repo-wide |
| `npm test` (vitest) | **875/875 passing**, repo-wide (44 new tests in this package: schema validation incl. XSS/injection rejection, output-validator contract, RSVP on/off, gallery 0/3/6-photo states, long-names/long-venue, video preload/loop contract, accessibility markers) |
| `npm run build` (production Next.js build) | Clean; route table unchanged — confirms zero route wiring, as required |

### Manual / Playwright verification (mobile 390×844 @2x, desktop 1440×900, real Chromium)

- **Mobile and desktop layouts**: full scene-by-scene screenshots captured for both viewports; desktop centered-9:16 + blurred-lateral-extension strategy confirmed visually correct after a layout bug fix (see below).
- **Reduced motion**: `prefers-reduced-motion: reduce` confirmed to hide all `<video>` elements and reveal the static open-doors composition.
- **Save-data**: `prefers-reduced-data` confirmed as a recognized CSS media feature in the test engine.
- **Slow/failed media**: all image and video requests blocked at the network layer — page remained fully readable (couple names, venue name all present in `body.innerText`), no broken layout.
- **Keyboard accessibility**: `Tab`-equivalent `.focus()` reaches both the map link and the RSVP CTA; `getComputedStyle().outlineStyle` confirmed `solid` (visible focus ring) on focus.
- **Long names / long venue wording**: `IVORY_PALACE_FIXTURE_LONG_NAMES` (`Sarveshkumar Ramgoolam-Appadoo` / `Shakshina Devi Ramnarain-Beeharry`, a 68-character venue name) renders with zero horizontal overflow (`scrollWidth` vs. container `clientWidth` checked programmatically) and correctly selects the stacked name format.
- **RSVP-enabled / RSVP-disabled states**: both variants screenshotted; disabled state renders `response-disabled-note`, never a dangling/empty CTA.
- **Gallery states**: empty (0 photos → 6 low-contrast ivory arches, never black), partial (3 photos + 3 fallback arches), and full (6 photos) all verified.

### Two real layout bugs found and fixed during this pass

1. **Gallery scene collapsed to a thumbnail.** `.scene`'s flex-row layout, combined with `.scene-content--gallery` intentionally not being absolutely positioned (it needs internal scroll/flow, unlike every other scene's fixed safe-area box), caused the flexbox algorithm to shrink both the background artwork and the gallery grid to a fraction of their intended size. Fixed by introducing a single `.scene-frame` positioning root that every scene's artwork, video, and content layers share, replacing the flex-based centering entirely. This also fixed a related bug where `.scene-content`'s percentage safe-area insets were being resolved against the full-viewport-width `.scene` instead of the narrower, centered artwork box — invisible on mobile (where they're equal) but silently wrong on desktop.
2. **Long names and the venue/RSVP block overflowed their allotted zones.** The original design treated `SCENE-SPEC.md`'s documented safe-area zones as fixed-height boxes (both `top` and `bottom` insets set); variable-length guest content (long names, RSVP copy) could exceed that fixed height and visually overlap neighboring content. Fixed by anchoring content boxes with `top` only (height now sizes to content) and merging the venue scene's two independently-positioned blocks (venue info, RSVP) into one naturally stacked block.

Screenshots and all local preview variants (default, no-response, empty-gallery, long-names, with-local-photos) live in the gitignored `generator-output/ivory-palace-signature/` directory (same convention as `timeless-editorial-v2`) and in this session's scratchpad; they are not committed.

## 5. Performance budget adherence (`PERFORMANCE-NOTES.md`)

| Budget | Target | Achieved |
|---|---|---|
| First-load poster artwork | 250–450 KB AVIF/WebP | Opening scene: 156 KB AVIF / 220 KB WebP |
| Individual later scene | 180–450 KB | 116–224 KB WebP across all 13 scenes (all under budget) |
| Total video fetched initially | 0 MB | **0 MB**, verified via network-request interception |
| Ambient WebM delivery | 1.2–1.8 MB each | Unchanged from Owner-approved deliverables (1.2–1.8 MB) |
| Ambient MP4 fallback | 1.8–2.4 MB each | Unchanged (1.8–2.4 MB) |
| Self-hosted fonts | subsetted WOFF2 | 4 variable-font WOFF2 files, 28–52 KB each (~156 KB total), Latin-subsetted (covers English + French) |

## 6. Known limitations and what remains for a later integration phase

- **Resolution gate** (§1): scene masters remain 941×1672; a ≥1080×1920 rerender is required before production/deploy. Not attempted in this session — explicitly deferred.
- **Real autoplay/loop-seam behavior** was verified in headless Chromium only, per `VIDEO-QA.md`'s own caveat ("approval does not imply every animation must autoplay or loop... implementation must still test actual first-to-last loop seams on target browsers"). Cross-browser (Safari/Firefox) manual verification was not performed.
- **Scroll-driven CSS animations** (`animation-timeline: view()`) are Chromium-only as of this session; Safari/Firefox fall back to the static, fully-readable default via `@supports` — by design, not a gap, but worth the Owner knowing the motion layer is progressively enhanced rather than universal.
- **Not done, by design, per the Owner's explicit scope**: no route wiring (`/preview`, `/guest`, admin editor), no `template_id` composition-schema extension, no `invite_generated_documents` migration, no marketing/pricing/survey changes, no deploy or publish of any kind.
- **Repository size**: this package adds ~85 MB (dominated by full-resolution PNG fallbacks kept alongside every AVIF/WebP derivative, mirroring `timeless-editorial-v2`'s existing convention). Worth an explicit Owner/engineering call before this template is merged toward `master`, independent of this branch.

## 7. Next steps for the Owner

Open the local preview (`generator-output/ivory-palace-signature/*/index.html` after running `npm test` to regenerate it, or the screenshots from this session) for visual review. If approved, the next phases (per `docs/html-invitation-generator/ARCHITECTURE.md`'s phased plan) would be: `template_id` composition-schema extension, the rendering-pipeline migration, sandboxed admin preview, and guest-facing rollout — each a separate, reversible, independently-reviewable phase.
