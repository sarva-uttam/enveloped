# Self-hosted fonts — Timeless Editorial Wedding (V2)

Both fonts below are distributed under the **SIL Open Font License, Version 1.1 (OFL-1.1)**, which explicitly permits embedding in websites, commercial use, self-hosting, bundling, and modification, with the only restriction being that the font may not be sold by itself. Full license text for each is included alongside the font files in this directory. This satisfies the requirement that any bundled font be confirmed as permitting web embedding and commercial use before inclusion.

## Research note: the owner-supplied reference article

The reference article (katrinacrouch.com, "Top 9 Calligraphy Fonts for Wedding Invitations") recommends nine fonts — Ms Claudy, Mozart Script, Slight, Adora Bouton, Modern Symphony, Boheme Floral, Ecatherina, Modernist, and Rhapsody — all from independent commercial foundries (Calamar Studio, Blessed Print, Up Up Creative, Peach Creme, 50Fox, Muntab Art). **None of these are free or openly licensed**; all require a paid license per-use or per-seat from their respective marketplaces (Creative Market and similar). None were used, copied, or approximated pixel-for-pixel. Per instruction, this is reported explicitly rather than silently substituted: if the owner wants one of these nine specific fonts, it must be purchased and its license terms reviewed before it could be bundled here.

In its place, the two fonts below were selected from Google Fonts' catalog (all OFL-licensed, freely self-hostable) for the closest available character to the reference brief's most formal/expressive entries (closest in spirit to "Ecatherina" and "Mozart Script" — connected, flowing, swash-bearing brush calligraphy with real presence, not a thin handwriting-style script).

## Fonts included

### Alex Brush (calligraphy — couple names, restrained on major romantic headings)

- **Font name:** Alex Brush
- **Source:** Google Fonts / Fontsource (`@fontsource/alex-brush@5.3.0`), original authors: The Alex Brush Project Authors — https://github.com/googlefonts/alex-brush
- **License:** SIL Open Font License 1.1 — see `LICENSE-alex-brush.txt`
- **File included:** `alex-brush-latin-400-normal.woff2` (33 KB) — regular weight (the only weight this family ships), Latin subset only
- **Character:** expressive, connected brush-script calligraphy with genuine swash character — used at large scale for the couple's names, and at smaller scale/tighter tracking for the "Will you celebrate with us?" heading, so the same file serves both the "expressive formal" and "restrained calligraphic" tiers of the requested hierarchy without adding a second calligraphy font.

### Playfair Display (high-contrast serif — event date, section titles)

- **Font name:** Playfair Display
- **Source:** Google Fonts / Fontsource (`@fontsource/playfair-display@5.3.0`), original authors: The Playfair Display Project Authors — https://github.com/clauseggers/Playfair-Display
- **License:** SIL Open Font License 1.1 — see `LICENSE-playfair-display.txt`
- **Files included:** `playfair-display-latin-400-normal.woff2` (22 KB), `playfair-display-latin-600-normal.woff2` (23 KB) — regular and semibold weights only, Latin subset only
- **Character:** genuine high-contrast (thick/thin stroke) didone-style serif, used for the event date and the small ornamental section titles ("Schedule", "Venue & Directions", etc.)

## What was deliberately left out (subsetting/weight discipline)

- No italic cuts of either family — not needed by this design.
- No Cyrillic/Greek/Vietnamese subsets — this invitation is English-only.
- No `.woff` fallback files — only `.woff2` is bundled. The project already targets evergreen browsers (Next.js 16 / React 19); `.woff2` has full support across all browsers this app supports. `@font-face` still declares system-font fallbacks (see below) so text remains fully readable even before the webfont loads or if it fails to load.
- Body paragraphs, schedule items, addresses, and small labels intentionally use the existing system-font stacks (no webfont) — per the owner's instruction that calligraphy is reserved for names and major romantic headings only.

## Fallback stack

Every `@font-face` rule declares `font-display: swap`, and every place these fonts are used in `render.ts` lists a realistic system-font fallback after them (e.g. `"Alex Brush", "Segoe Script", "Brush Script MT", cursive` for calligraphy; `"Playfair Display", Georgia, "Iowan Old Style", serif` for the high-contrast serif), so the page remains legible immediately even before the woff2 files finish loading, and stays fully legible if they fail to load at all.

## Runtime loading

Both fonts are referenced via relative `url("assets/fonts/...")` paths inside the document's own inline `<style>` block — there is no `<link>` to any font CDN (Google Fonts or otherwise) and no runtime network request to an external origin. This satisfies "no Google Fonts CDN or external runtime font request": the font *files* originate from Google Fonts' open-licensed catalog, but they are fetched and bundled once, at build/session time, into this trusted template package, and served from the invitation's own asset path — never fetched live from fonts.googleapis.com or fonts.gstatic.com.
