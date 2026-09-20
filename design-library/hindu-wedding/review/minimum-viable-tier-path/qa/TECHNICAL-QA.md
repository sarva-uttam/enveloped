# Technical QA — Minimum Viable Tier Path

Status: **UNDER_REVIEW**  
Run date: 2026-09-20

## Baseline before changes

- Remote branch HEAD verified as `9259f25f2b0c68ab18d6bce8ff5abe1e62c02252`.
- `npm run validate:design-library`: PASS — 8 templates, 128 components, 22 survey steps, 15 rules.
- `npm test`: PASS — 70 files, 831 tests.
- `npm run lint`: PASS.
- `tsc --noEmit`: PASS.
- `npm run build`: PASS — Next.js 16.3.4 production build completed.

## Asset QA

| Candidate | File/alpha | Construction/anatomy | Placement | Review result |
|---|---|---|---|---|
| HW-CANOPY-001-V2 | PNG alpha + WebP; full cord/loops | 21 coherent mango leaves on visible support | Upper canopy; centre remains open | PASS to Owner review |
| HW-CEREM-002-V1 | PNG alpha + WebP; complete feet/flames | Equal paired brass lamps, joined shafts and stable bases | Shared lower baseline | PASS to ceremonial review |
| HW-ANIMAL-002-V2 | PNG alpha + WebP; complete pair | Equal scale, inward-facing, two grounded legs/feet each | Lower corners, text-safe | CONDITIONAL — stylised broad crest needs Owner/biological review |
| HW-EFFECT-004-V1 | PNG alpha + WebP | Sparse glints; no dense bokeh | Outer edges; centre remains readable | PASS to Owner review |
| HW-EFFECT-002-V2 | PNG alpha + WebP; six isolated petals | Plausible rose petals; no flower heads | Six fixed paths; three-petal static fallback | CONDITIONAL — botanical dependency is not approved |
| HW-PEOPLE-005-V2 | PNG alpha + WebP; complete heads/hands/feet | Rear-facing fictional adults, distinct joined hands, coherent garments/posture | Bottom-centre; text remains unobstructed | PASS to Owner and cultural review |

Exact dimensions, alpha bounding boxes, hashes, anchors and scale limits are machine-recorded in `metadata/review-manifest.json`. The lamp and peacock pairs also have non-mirrored LEFT/RIGHT transparent child masters, deliveries, cards, thumbnails and detail crops; the combined files remain controlled fallbacks.

## Responsive and motion QA

- Native 9:16: four 1000×1778 previews generated.
- Mobile/review card: four 540×960 previews generated; six 540×960 option cards and 270×480 thumbnails generated.
- Desktop: four 1440×1000 centered-canvas previews generated.
- `HW-LIGHT-007`: broad feathered CSS glow behind the central text column; no hard circle or banding.
- Falling petals: six deterministic outer-third paths; static/reduced fallback is exactly three settled lower petals.
- `HW-EFFECT-008`: opacity/clip reveal only; the final state uses the same unchanged Celebration Bloom file and coordinates.
- Reduced motion: CSS `prefers-reduced-motion: reduce` disables transforms and immediately exposes exact static final states.
- Sacred imagery: neutral `HW-HEADER-001` is the default; no sacred figure is animated.

## Rejections and limitations

- `HW-CANOPY-001-V1` rejected for broad semi-transparent atmosphere outside the object.
- `HW-ANIMAL-002-V1` rejected for photoreal treatment and fan-like crest styling.
- `HW-EFFECT-002-V1` rejected after alpha-background concern; corrected v2 retained.
- The current registry contains no APPROVED floral or foliage component. `HW-FLORAL-010-V1-BASE` remains an explicit trial-only UNDER_REVIEW dependency.
- The semantic HTML/CSS composition is authoritative. Review PNGs are deterministic snapshots and contain generic placeholder copy, not final client text.

## Trial validator

`node scripts/validate-tier-path-review.mjs` verifies six raster packages, alpha/sRGB, option-card and thumbnail dimensions, exact metadata presence, four tier previews at all three presentation sizes, semantic HTML, the completion message, reduced-motion CSS and exclusion of unlicensed preferred fonts.

Owner decision: pending.
