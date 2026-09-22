# Motion Specification

## Code-controlled

| Motion | Timing | Limit | Reduced motion |
|---|---:|---|---|
| Scene reveal | 600–850 ms | opacity + translateY ≤24 px | instant visible |
| Foreground drift | 8–14 s | ≤10 px, no perpetual scale | static |
| Parallax | scroll-linked | depth delta ≤4% viewport | disabled |
| Petals | 7–12 s | 3–7 visible; 0.25–0.6 opacity | absent |
| Sparkles | 2.5–5 s | ≤5 points; ≤0.2 opacity | static or absent |
| Lamp pulse | 3–5 s | opacity delta ≤0.08 | static |
| Text entrance | 450–700 ms | opacity + ≤16 px rise | instant visible |

Door opening is a one-time, user- or scroll-triggered event; never replay on minor scroll changes. Scene snapping must not trap keyboard or screen-reader navigation. `prefers-reduced-motion: reduce` loads complete static compositions.

## Owner-approved Gemini animations

The Owner supplied and approved five 10-second, 720 × 1280, 24 fps H.264 masters: palace doors, Haldi fabric, Sangeet ambience, Reception ambience and finale micro-animation. Use poster-first loading and lazy-load each video only near its scene. The opening plays once; ambient/finale videos may loop only after implementation seam testing. All other movement belongs in code.
