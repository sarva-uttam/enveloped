# Ivory Palace — Layer 4 wording placement

**Status: placement checkpoint, pending Owner visual review. Not
approved.** This checkpoint establishes the semantic text containers,
their exact responsive coordinates, the entrance and exit motion, and
temporary review outlines.

**Placement approval and typography approval are separate.** Fonts,
final font sizes, colours, readability treatments (backing panels,
shadows, gradients) and decorative typography are deliberately *not*
decided here. The provisional serif at `clamp()` sizes and the dark
brown text exist only so the placement can be reviewed. Neither the
wording, the typography nor Layer 4 is Owner-approved.

The Owner-approved Layers 1–3 are unchanged, and the `baseline.test.cjs`
lock still passes 18/18.

## Files

| File | Role |
|---|---|
| `experiments/ivory-palace-frame-journey/layer4-content.js` | Centralized content and layout data: every zone's id, stop, role, top/width/height, entrance direction, enter/exit order, lines, source and status, plus its review colour |
| `experiments/ivory-palace-frame-journey/layer4-wording.js` | Controller: builds the semantic groups from the data and exposes `window.IvoryLayer4.enter/exit` |
| `experiments/ivory-palace-frame-journey/styles.css` | The Layer 4 section: centring, motion, reduced motion and dev-only outlines |
| `experiments/ivory-palace-frame-journey/script.js` | Two one-line hooks: `enterSurface` settles only after the wording enters, and `clearOrnaments` lets the wording leave first |
| `experiments/ivory-palace-frame-journey/layer4.test.cjs` | Static tests |
| `experiments/ivory-palace-frame-journey/verify.js` | Behavioural tests in the browser |

No permanent strings are written in HTML or in the controller. Every
wording string lives in `layer4-content.js`.

## Coordinate system and centring

- All numbers are **percentages of the portrait invitation box** (the
  frame box). They are never relative to the ivory panel or to any
  pillarbox area.
- Each zone is an independent element with `left: 50%`,
  `transform: translateX(-50%)`, `text-align: center`,
  `box-sizing: border-box`, and the configured `top`, `width` and
  `height`.
- Motion is carried by an inner `.wording-motion` wrapper, so the zone's
  centring transform is never overwritten. At rest the wrapper's
  transform is `none`, and every zone is centred to within 0.5px.
- Text wraps at words. It is never shrunk to force a fit, and
  `overflow: visible` means it is never clipped. Genuine overflow is
  reported, not hidden.

## Zone table

### Stop 80 — Introduction

| # | ID | Top | Width | Height | Role | Entrance | Exit order | Content (checkpoint) | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `intro-heading` | 20.5% | 30% | 8.5% | couple-heading | fade upward | 2 | Mihika & Tanish | sample-data |
| 2 | `intro-message` | 35.5% | 60% | 17.5% | romantic-opening | fade upward | 1 | Life brought them together; love gave them a reason to stay. | catalogue-provisional |

### Stop 160 — Haldi

| # | ID | Top | Width | Height | Role | Entrance | Exit order | Content (checkpoint) | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `haldi-sacred-opening` | 15.7% | 36% | 9.5% | sacred-invocation | fade upward | 9 | ॐ श्री गणेशाय नमः | pending-review |
| 2 | `haldi-title` | 25.2% | 49% | 6.5% | ceremony-title | fade upward | 8 | Rang De Haldi | catalogue-approved |
| 3 | `haldi-introduction` | 32.1% | 63% | 5% | introduction | from left | 7 | A celebration painted in love, laughter and Haldi | placeholder |
| 4 | `haldi-hosts` | 37.4% | 48% | 4.3% | hosts | from right | 6 | Arvind and Meera Rajan | sample-data |
| 5 | `haldi-invitation` | 41.7% | 62% | 5% | invitation-lead | from left | 5 | warmly invite you to the Haldi ceremony of their daughter | catalogue-approved |
| 6 | `haldi-bride-name` | 46.9% | 30% | 7.7% | honouree-name | fade upward (slower, 850ms) | 4 | Mihika | sample-data |
| 7 | `haldi-date-time` | 55% | 70% | 10% | date-time | from right | 3 | Saturday · 22 August 2026 · 6:30 PM | sample-data |
| 8 | `haldi-venue` | 65.6% | 33% | 8.8% | venue | from left | 2 | Magnolia Hall, Greenview Gardens, Vacoas | sample-data |
| 9 | `haldi-closing-note` | 75.3% | 32% | 4% | welcome-line | fade upward | 1 | Bring your smile and a touch of yellow. | catalogue-provisional |

### Stop 240 — Wedding

| # | ID | Top | Width | Height | Role | Entrance | Exit order | Content (checkpoint) | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `wedding-sacred-opening` | 15% | 36% | 10% | sacred-invocation | fade upward | 11 | ॐ श्री गणेशाय नमः | pending-review |
| 2 | `wedding-title` | 25.3% | 40% | 6.2% | ceremony-title | fade upward | 10 | Vivah Vidhi | catalogue-approved |
| 3 | `wedding-grandparents` | 31.6% | 64% | 7% | elder-blessing | from left | 9 | With the blessings of our grandparents / Mahendra and Kamini Rajan | pending-review |
| 4 | `wedding-hosts` | 38.6% | 65% | 4.4% | hosts | from right | 8 | Arvind and Meera Rajan | sample-data |
| 5 | `wedding-invitation` | 43% | 65% | 6% | invitation-lead | from left | 7 | request the pleasure of your company at the wedding of their daughter | catalogue-approved |
| 6 | `wedding-bride-name` | 49% | 30% | 5.8% | bride-name | fade upward (slower, 850ms) | 6 | Mihika | sample-data |
| 7 | `wedding-groom-name` | 55.8% | 30% | 5.8% | groom-name | fade upward (slower, 850ms) | 5 | Tanish | sample-data |
| 8 | `wedding-groom-lineage` | 61.6% | 64% | 3.2% | parentage | from right | 4 | Son of Rajesh and Kavita Narayan | sample-data |
| 9 | `wedding-date-time` | 65% | 65% | 7.5% | date-time | from left | 3 | Sunday · 23 August 2026 · 1:15 PM | sample-data |
| 10 | `wedding-venue` | 72.6% | 40% | 7.8% | venue | from right | 2 | Magnolia Hall, Greenview Gardens, Vacoas | sample-data |
| 11 | `wedding-guest-note` | 80.8% | 38% | 3.3% | gift-preference | fade upward | 1 | No gift boxes please | catalogue-approved |

### Stop 300 — Closing (finale light; no Layer 3)

| # | ID | Top | Width | Height | Role | Entrance | Exit order | Content (checkpoint) | Status |
|---|---|---|---|---|---|---|---|---|---|
| — | `closing-enclosure-top` | 34% | 60% | 4% | decorative-slot | none (no motion) | — | — (empty slot) | slot |
| 1 | `closing-appreciation` | 38.7% | 60% | 9.2% | presence-line | fade upward (slow, 1100ms) | 2 | Your presence will be highly appreciated. | catalogue-approved |
| 2 | `closing-family` | 49.4% | 60% | 9.8% | compliments | fade upward (slow, 1100ms) | 1 | Best Compliments From: / Rajan & Narayan Family | catalogue-approved |
| — | `closing-enclosure-bottom` | 60.3% | 60% | 4% | decorative-slot | none (no motion) | — | — (empty slot) | slot |

Status meanings:

- `catalogue-approved`: exact Owner-approved catalogue wording.
- `catalogue-provisional`: an approved alternative, whose selection is
  provisional.
- `sample-data`: fictional repository sample identity or event data.
- `placeholder`: temporary text.
- `pending-review`: under Owner or cultural review.
- `slot`: intentionally empty.

Each zone's `source` field in `layer4-content.js` records its catalogue
ID or origin.

### Where the checkpoint wording differs from the brief

These zones use canonical repository wording in place of the brief's
text:

| Zone | Brief | Used | Why |
|---|---|---|---|
| `intro-message` | "Destiny brought them together, and now love will seal their bond forever." | Romantic opening 009 | The wording system records the Destiny sentence as superseded by the 100 approved openings. 009 is the closest in meaning; the choice is provisional |
| `haldi-hosts`, `wedding-hosts` | "Mr Arvind & Mrs Meera Rajan" | "Arvind and Meera Rajan" | HOSTS.md and the wording system forbid a prejoined Mr/Mrs ampersand token |
| `haldi-invitation` | "…of their beloved daughter" | HS-01 "warmly invite you to the Haldi ceremony of their daughter" | Exact approved host structure |
| `haldi-closing-note` | "Bring your smile, blessings and a splash of yellow" | HW-031 "Bring your smile and a touch of yellow." | Closest approved welcome line |
| `wedding-title` | "Vivaha Vidhi" | "Vivah Vidhi" (WT-11) | The approved spelling |
| `wedding-grandparents` | "…Mr Mahendra & Mrs Kamini Rajan and Late Mr Harish & Mrs Shanta Devi" | "With the blessings of our grandparents / Mahendra and Kamini Rajan" | ELDERS.md: the elder wording is pending review. Harish Rajan's and Shanta Devi's relationship and living status are unconfirmed, and "Late … & Mrs Shanta Devi" would imply facts the repository forbids asserting |
| `wedding-invitation` | "…of their beloved daughter" | WI-02 | Exact approved invitation lead |
| `wedding-groom-lineage` | "Son of Mr Rajesh and Mrs Kavita Narayan" | "Son of Rajesh and Kavita Narayan" | Repository sample line (no honorifics) |
| `wedding-guest-note` | "No boxed gifts, please" | "No gift boxes please" | The only approved gift sentence (exact) |
| `closing-appreciation` | "…appreciated" | FP-01 "Your presence will be highly appreciated." | Exact approved line |
| `closing-family` | "Best compliments from the Rajan and Narayan families" | "Best Compliments From:" / "Rajan & Narayan Family" | Fixed approved label plus the family-display template |

Still placeholder or sample data:

- `intro-heading`, both name zones, the hosts, the dates, the venues and
  the family surnames (fictional samples);
- `haldi-introduction` (brief text: no exact catalogue match exists, and
  100 approved alternatives await selection);
- the sacred openings and the elder line (pending cultural and Owner
  review).

## Sequencing

**Entrance** happens only after:

1. the journey lands on the exact stop;
2. Layer 2 finishes appearing;
3. Layer 3 finishes appearing.

At stop 300, the finale light's 1.2s fade stands in for Layers 2–3. The
zones then enter in reading order:

- stagger 110ms;
- 700ms each (names 850ms, closing lines 1100ms);
- opacity 0 → 1;
- 12px upward or 16px horizontal travel;
- easing `cubic-bezier(0.22, 1, 0.36, 1)`;
- no scale, rotation, bounce or per-word effects.

Input stays locked until the last zone is at rest (a 40ms settle
margin), and then the controls appear.

**Exit**, when leaving any stop:

1. The existing input lock engages.
2. The wording leaves first, in reverse reading order: 400ms, a 30ms
   stagger, back along its entrance offset, easing
   `cubic-bezier(0.4, 0, 1, 1)`.
3. After it has fully cleared (plus 40ms), the unchanged Layer 3 exit
   runs.
4. Then the Layer 2 exit.
5. Then the journey.

At stop 300, the closing wording fades out before the finale light
dissolves and reverse travel begins. The durations of Layers 1–3 are
unchanged. Each departure gains only the wording exit (about 0.45–0.74s).

Completion always uses timers derived from the CSS custom properties,
never animation events, so content can never be stranded hidden.

**Behaviour change to note:** at stop 300 the controls used to reappear
on landing. They now reappear once the closing wording has settled,
about 2.4s later. This is the same input-lock rule as the other stops.

## Visibility and stacking

- Stacking, bottom to top: palace canvas → stop layer (ivory panel,
  gold frame, ceremonial foreground; z-index 2) and the finale light
  (z-index 2) → **wording layer (z-index 3)** → loader (5) → navigation
  controls (6).
- The wording layer has `pointer-events: none`, so it never intercepts
  input.
- Only the active stop's group is visible (`visibility` plus
  `aria-hidden`). No wording shows during travel (checked every
  animation frame), and there is never a flash of the next stop's
  wording.
- Stop 300 has its finale light, the closing wording and the controls,
  and no Layer 3.
- The earlier reserved `#stopContent` inside the panel is still empty,
  hidden and inert, because it is part of the locked Layer 2 baseline.
  Layer 4 uses its own viewport-coordinate layer instead.

## Stop-300 enclosure slots

`closing-enclosure-top` and `closing-enclosure-bottom` are identical
60% × 4% empty `div`s (`aria-hidden`). They have no text, no motion
and no borders or flourishes. They are ready for future transparent
artwork.

## Reduced motion

`prefers-reduced-motion: reduce` gives:

- no translation (`--wd-shift` / `--wd-rise` 0);
- no stagger;
- 220ms opacity-only entrances and 160ms exits;
- the same entrance and exit order;
- the same input locking.

Content becomes available promptly.

## Development review mode

Add `?review=wording` to the URL, for example
`http://127.0.0.1:8080/?review=wording`. Each zone then shows a 2px
inset outline in its reference colour (`outline-offset: -2px`). The
outlines don't change the layout or wrapping. They are visible whenever
the stop's group is visible, including during animation, and absent
without the parameter.

The reference colours, in order:

- Stop 80: two distinct colours.
- Stop 160: red, blue, yellow, green, yellow, dark green, black, purple,
  orange.
- Stop 240: red, blue, yellow, green, purple, black, black, pale pink,
  orange, pink, cyan.
- Stop 300: black, red, blue, black.

## Responsive results (checkpoint)

All 26 zones were verified centred at 50%, on spec (±0.75px) and inside
the invitation at:

- 320×568, 390×844, 360×800, 412×915 and 430×932;
- 768×1024;
- 900×1400, 1080×1920 and 1440×900.

There is no horizontal overflow at any size. The controls stay
clickable.

## Open conflicts for the Owner review

1. **Height overflow.** At the provisional text size, `haldi-closing-note`
   (32% × 4%) needs two lines and exceeds its 4% height by 2–5px at
   every tested size except 1080×1920. It is not clipped. This needs a
   typography decision or a taller zone.
2. **Overlap with Layer 3.** The zones below about 57–60% sit over the
   approved ceremonial foregrounds: `haldi-venue`, `haldi-closing-note`,
   `wedding-groom-lineage` (partly), `wedding-date-time`,
   `wedding-venue` and `wedding-guest-note`. On taller phones, where
   the foregrounds start at about 63–65%, the overlap is smaller.
   Readability over the artwork is a typography-review decision; no
   backing treatment has been added.
3. **Content conflicts** with the brief's temporary text, resolved in
   favour of canonical repository wording (table above). The Owner
   should confirm these, especially the elder/remembrance line.
4. **Finale control timing**, noted above.

## Approved symbols and typography (checkpoint 2, pending Owner visual review)

### Assets

The assets come from the Owner's `small symbols.zip`, stored in
`experiments/ivory-palace-frame-journey/assets/symbols/`. Each file was
losslessly trimmed of its fully transparent outer padding, keeping a
4px margin. The crop is pixel-identical: every visible pixel is kept,
with no resampling and no recolouring.

| File | Source name | Trim | SHA-256 |
|---|---|---|---|
| `symbol-ganesha-crimson.png` | crimson Ganesha symbol | 1292×1217 → 1151×1128 | `4ca7987b…d2cd2` |
| `symbol-nuptial-knot-charcoal.png` | warm-charcoal nuptial-knot symbol | 1774×887 → 1715×852 | `f9493285…df26a6` |
| `enclosure-e2-upper.png` | E2 upright upper enclosure | 2172×724 → 2027×498 | `f7ea924b…c7647c` |
| `enclosure-e2-lower.png` | E2 vertically inverted lower enclosure | 2172×724 → 1974×500 | `aaf71bda…3187ad` |

Validation on the originals:

- all four are RGBA and 86–96% transparent;
- there is no opaque black or white matte, and no artwork touches a
  canvas edge;
- the four hashes are distinct;
- the lower enclosure matches a vertical flip of the upper one (alpha
  difference 9.0, against 12.1 unflipped), so its orientation is
  correct;
- the colours are unmodified (crimson about 166,4,42; charcoal about
  50,29,16).

### Placement

- **Ganesha (stops 160 and 240)** sits inside the sacred-opening zone.
  The structure is `div.wording-motion.sacred-opening` containing
  `img.sacred-opening__ganesha` and then `div.sacred-opening__mantra`,
  so the symbol and mantra move as one unit. The layout is a centred
  flex column with a gap of `clamp(2px, 0.5cqh, 6px)` and 2px of
  vertical padding. Ganesha is `clamp(34px, 10cqw, 72px)` wide with
  `max-height: 52%`, `object-fit: contain` and its natural aspect
  ratio. `cqw` (the invitation width) replaces the brief's `vw`, which
  would be measured against the pillarboxed desktop viewport. The outer
  coordinates are unchanged.
- **Nuptial knot (stop 240 only).** The structure is a
  `div.wedding-couple-names` subgroup spanning the invitation box, with
  the bride name zone, the knot and the groom name zone inside it. The
  knot is centred on the 50% axis at `centerY` 55.3%, the midpoint
  between the bride zone's bottom (54.8%) and the groom zone's top
  (55.8%). It is not inside either name box. It measures
  `clamp(38px, 10cqw, 72px)` wide with a maximum height of
  `clamp(16px, 2.6cqh, 30px)`, and uses `object-fit: contain`.
  - **Internal adjustment (allowed by the brief):** the bride name has
    `padding-bottom: min(1.6cqh, 14px)` and the groom name
    `padding-top: min(1.6cqh, 14px)`. This nudges the two texts apart
    by up to 7px inside their unchanged zones, giving the knot 3–8px of
    clear space above and below at every tested size.
  - **Sequence:** the bride name enters, then the knot (a simple fade
    with 4px of rise), then the groom name.
- **Enclosures (stop 300).** These are image zones at the approved
  34% and 60.3% positions, each 60% × 4%. The images are
  `width: 100%; height: 100%; object-fit: contain`. They use the
  dedicated upright and inverted PNGs, with no runtime flip, filter,
  shadow, line or pseudo-element. Both fade in without sliding. The
  visual order is: upper enclosure, appreciation, compliments, lower
  enclosure. Both render at the same scale, because both are limited by
  the same 4% height. The lower artwork is about 3% narrower than the
  upper because of the artwork itself, so its drawn width differs by
  3–10px.
- **Behaviour.** Every Layer 4 image has `pointer-events: none`,
  `user-select: none` and is not draggable. The knot and enclosures are
  `aria-hidden`; Ganesha has `alt="Ganesha"`. All images are decoded,
  and the webfonts loaded, before a group enters. They enter and exit
  with their wording, are never shown during travel, and follow the
  reduced-motion rules (the knot has no rise under reduced motion).

### Typography

The fonts are self-hosted OFL files copied from the Timeless Editorial
package (`assets/fonts/FONTS.md`):

- **Ceremonial script:** Alex Brush, in `#9f163a` crimson, for the
  ceremony titles and personal names.
- **Formal serif:** Playfair Display 400, in `#382b23` charcoal, for the
  supporting wording.
- **Structured serif date:** Playfair Display 600, with 0.06em tracking
  and lining numerals.
- **Mantra:** crimson, using the system Devanagari font (the Playfair
  subset is Latin only).

The coordinates are unchanged. Font sizes remain responsive `clamp()`
values and are part of the typography review.

### Open item

At the new font metrics, `haldi-closing-note` (32% × 4%) needs three
lines on phones and exceeds its zone height by 4–23px at every size
except 1080×1920. `wedding-invitation` also exceeds its zone by 4px at
412×915. Neither is clipped. These need a typography or coordinate
decision.

## Visual-refinement pass (pending Owner visual review)

### Layer 2: opaque Ivory Palace paper

This change is Owner-authorised. The previously locked 85% fill is
superseded, and `baseline.test.cjs` was updated to match.

- `.stop-panel__fill` is `var(--ivory-paper-base)`, which is
  `#f7f0e3` at 100% opacity. The panel shape (the arch-opening mask)
  and the gold frame are unchanged.
- **Texture:** `.stop-panel__fill::after` is CSS only, with no image. It
  has four very low-alpha horizontal fibre layers at co-prime spacings
  (4, 7, 11 and 17px) and slight angles (0°, 0.6°, −0.4° and 0.25°),
  plus two soft tonal radials, using `mix-blend-mode: multiply`. It has
  no motion and `pointer-events: none`. It sits inside the fill, so the
  fill's mask clips it to the paper, and it never covers the frame.
- **Verification (`verify.js`, every viewport):**
  - With and without the palace canvas, the paper opening is
    pixel-identical (maximum difference 0), so nothing shows through.
  - With and without the fill, the frame exterior is identical, so the
    texture never escapes the opening.
  - The paper's luminance varies by only 6–8 (on a 0–255 scale) across
    the opening, so the texture stays subtle.

### Fit corrections

- `haldi-closing-note`:
  - top 75.3% and centre 50% are unchanged;
  - width is `clamp(144px, 46%, 280px)` and height 4.5%;
  - font size is `clamp(11px, 3cqw, 16px)` with line height 1.05;
  - it now fits on at most 2 lines at every tested size (1 line on large
    desktops).
- `wedding-invitation`:
  - position and 65% width are unchanged;
  - font size is `clamp(11px, 1.6cqh, 24.5px)`, about 6% below the
    supporting size, with line height 1.04;
  - it fits at every size (10–35px of spare height; 23px at 412×915).
- **Result:** no wording exceeds its zone at any of the ten tested
  sizes.

### Sacred opening on narrow phones

On invitations 360px wide or narrower (a container query on the
invitation box):

- the centred group moves down by 0.8cqh (`padding-top`);
- Ganesha shrinks to `clamp(28px, 8.5cqw, 72px)`;
- the outer container is unchanged, the group still animates as one
  unit, and it clears the frame's top arch point (checked visually at
  320×568).

### Interface: right-side control rail

The rail is an `aside.invite-controls` containing
`nav.invite-controls__navigation` (previous above next) and a hidden,
empty `div.invite-controls__utilities` reserved for future functions.
There are no placeholder buttons.

- **Reusable control:** `.invite-control` gives every button the same
  size, states and icon slot (`.invite-control__icon`). Visibility
  comes from `.is-visible`, `[hidden]` or `:disabled`.
- **Placement:**
  - `right: max(10px, env(safe-area-inset-right))`, `top: 47%`,
    `translateY(-50%)`, a 10px gap, z-index 6;
  - the rail itself has `pointer-events: none`, so only the buttons
    take input.
- **Why 47%:** at nine viewports, it was the only centre in the 47–55%
  range that keeps both buttons at least 6px clear of every wording
  line at every stop. At 50% and below, the Haldi date collides. It
  overlaps the pillar's middle medallion, because clear wording was
  given priority.
- **Style:**
  - fill `rgba(56,43,35,0.28)`, border `rgba(247,240,227,0.42)`,
    icon colour `rgba(255,255,255,0.82)`, with a 3px backdrop blur;
  - hover and focus darken the fill to 0.42, with a 2px focus outline;
  - disabled uses a 0.14 fill;
  - a fallback fill of 0.4 applies without backdrop-filter;
  - there is no whole-button opacity, and reduced motion removes the
    fade.
- **Behaviour:** the ids `navUp` and `navDown`, the click directions,
  input locking and journey timing are all unchanged.

| Viewport | Previous button (x, y, size) | Next button (x, y, size) |
|---|---|---|
| 320×568 | 266, 218, 44 | 266, 272, 44 |
| 360×640 | 306, 252, 44 | 306, 306, 44 |
| 390×844 | 336, 348, 44 | 336, 402, 44 |
| 360×800 | 306, 327, 44 | 306, 381, 44 |
| 412×915 | 357, 380, 45 | 357, 435, 45 |
| 430×932 | 373, 386, 47 | 373, 443, 47 |
| 768×1024 | 516, 426, 50 | 516, 486, 50 |
| 900×1400 | 728, 603, 50 | 728, 663, 50 |
| 1080×1920 | 1020, 847, 50 | 1020, 907, 50 |
| 1440×900 | 446, 368, 50 | 446, 428, 50 |

Coordinates are px relative to the invitation box.

## Checkpoint commit (2026-09-25)

This Layer 4 work was committed together with the Owner-approved
interface-controls checkpoint. Its scope preserves the existing Layers
1–4 and the closing composition as reviewed. The earlier notes still
apply: the wording statuses (placeholder, sample-data and pending-review
items) and the separation of wording approval from typography approval
are unchanged. Real client wording and data must still replace the
samples.
