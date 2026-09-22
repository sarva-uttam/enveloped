# Self-hosted fonts — Ivory Palace, Signature Edition

Per `assets/source-spec/TYPOGRAPHY.md`. All four families are SIL Open
Font License 1.1, self-hosted, subsetted to the `latin` Unicode range
(`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
U+0304, U+0308, U+0329, U+2000-206F, ...`) — this range covers both
English and French (all French diacritics: `é è ê ë à â î ï ô ù û ü ç
œ` are within Latin-1 Supplement/`U+0152-0153`), satisfying the
TYPOGRAPHY.md "English and French Latin coverage is required" rule.
Zero runtime Google Fonts requests — every `@font-face src` in
`render.ts` is a relative path into this directory.

| File | Family | Role | Source |
|---|---|---|---|
| `alex-brush-latin-400-normal.woff2` | Alex Brush | Couple names only | Reused byte-for-byte from `../../timeless-editorial-v2/assets/fonts/` (same OFL family, already vetted for this repo) |
| `cormorant-garamond-latin-500-600-variable.woff2` | Cormorant Garamond | Display titles (500/600) | fonts.google.com, variable instance covering weights 500–600 in one file |
| `source-serif-4-latin-400-500-variable.woff2` | Source Serif 4 | Body / formal wording (400/500) | fonts.google.com, variable instance covering weights 400–500 |
| `manrope-latin-500-600-variable.woff2` | Manrope | Utility / small caps (500/600) | fonts.google.com, variable instance covering weights 500–600 |

Each non-Alex-Brush file is a **variable font** (Google serves the
underlying variable font, not two separate static instances, when a
CSS2 request asks for more than one static weight of a family that
ships as variable). `render.ts` declares one `@font-face` per family
with `font-weight: <min> <max>` (a range), which lets the browser
interpolate to the exact requested weight from a single downloaded
file — smaller total payload than shipping two static instances per
family, and still fully self-hosted with zero runtime third-party
requests.

Retrieved 2026-09-22 via the Google Fonts CSS2 API (`fonts.googleapis.com/css2?family=...`)
and `fonts.gstatic.com`, both fetched once at build time into this
repository — not referenced at runtime. `LICENSE-*.txt` next to each
font is the exact OFL 1.1 text for that family, fetched from
`github.com/google/fonts` (`ofl/<family>/OFL.txt`) on the same date.

Fallback stacks (used in every `font-family` declaration alongside the
self-hosted face, per TYPOGRAPHY.md):

- Alex Brush → `"Segoe Script", "Brush Script MT", cursive`
- Cormorant Garamond → `"Iowan Old Style", Baskerville, Georgia, serif`
- Source Serif 4 → `"Source Serif Pro", Georgia, serif`
- Manrope → `Inter, "Segoe UI", Arial, sans-serif`

`font-display: swap` is applied to every `@font-face` so the page is
fully readable before (or if) these ever load.
