# Timeless Editorial Wedding — Test Package V2

Status: **prototype package for one HTML invitation test**. This is not yet a reusable production library.

## Included assets

| File | Role |
| --- | --- |
| `frame-desktop.png` | Full-page botanical and champagne-gold frame for wide layouts. |
| `frame-mobile.png` | Portrait frame composed separately for narrow/mobile layouts. |
| `petal-sprites.png` | Isolated blush and ivory petal sprites for bounded CSS animation. |
| `sparkle-sprites.png` | Isolated champagne light/sparkle sprites for bounded CSS animation. |

All assets have alpha transparency. Invitation names, dates, wording, links, and controls must remain real HTML; never bake client content into these images.

## Art direction

- Warm ivory base with blush, muted sage, champagne gold, and restrained burgundy accents.
- Extravagant botanical-romance luxury rather than minimalist stationery.
- Florals and ornament belong near the viewport edges; the content column remains readable.
- This package contains no portrait and no Hindu-specific ceremonial objects.

## Implementation rules

1. Use `<picture>` or a breakpoint-controlled source so mobile receives `frame-mobile.png` and desktop receives `frame-desktop.png`. Do not download both unnecessarily.
2. Treat frames and particles as decorative: `aria-hidden="true"` and `pointer-events: none`.
3. Animate only composited `transform` and `opacity`. Keep particle counts bounded: at most 14 petals and 18 sparkles concurrently.
4. Petals should drift on varied 10–18 second paths with mild rotation. A small minority may travel diagonally to imply a soft wind; never create a storm or confetti effect.
5. Sparkles should pulse once or twice and disappear. Avoid permanent rapid twinkling.
6. Pause animations when `document.hidden`; remove timers/listeners on unmount.
7. Under `prefers-reduced-motion: reduce`, render a calm static frame with no falling or drifting particles.
8. Use a warm ivory fallback background so the invitation remains elegant if imagery fails.
9. Apply a soft rose-and-gold color grade with CSS gradients behind content, not a dark overlay that muddies the flowers.
10. Keep text contrast WCAG-compliant and prevent decorative layers from crossing primary controls.

## Test scope

Build one complete **Timeless Editorial Wedding** HTML invitation using these assets. Validate desktop, mobile, reduced motion, no-JavaScript readability, image-failure fallback, and performance before creating more template packages.

## Deferred

- AI portrait transformations and background removal.
- Hindu wedding assets such as mango-leaf torans, marigolds, brass kalash vessels, diyas, and mandap framing.
- A full multi-template asset library.

