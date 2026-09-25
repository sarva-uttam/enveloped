# Layer 3 — Automation contract

This contract defines what a repeatable Layer 3 run needs, what it must
produce, what can be checked automatically, and what only the Owner can
decide. It implements
[`LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md`](LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md).

- **Specification:** [`layer-3-foreground.schema.json`](layer-3-foreground.schema.json).
- **First validated example:** [`ivory-palace/layer-3-foreground.config.json`](ivory-palace/layer-3-foreground.config.json).

**Artistic approval cannot be fully automated.** Automated checks prove
that the files are valid and the implementation matches its
specification. They do not prove that the result is beautiful,
culturally right or rich enough.

## Inputs

| Input | Description | Ivory Palace |
|---|---|---|
| Locked Layer 1 background | Frame sequence and grade, Owner-approved and hash-locked | `frames/` (300 JPEGs), CSS grade (METHOD §13) |
| Locked Layer 2 panel/frame | Panel fill, frame artwork, timings | METHOD §11; `assets/ivory-palace-arch-frame.png` |
| Stop-frame list | Stop frames that receive Layer 3, and the excluded stops | 80, 160, 240; 300 excluded |
| Event identity per stop | The story each pair tells | Introductory celebration / Haldi / Wedding |
| Palette and material rules | Shared palette, materials, lighting | [`ivory-palace/LAYER-3-PROMPTS.md`](ivory-palace/LAYER-3-PROMPTS.md) §B |
| Cultural authenticity requirements | Allowed objects and usage, and anything to avoid | Hindu ceremonial objects; believable physics |
| Navigation geometry | Control positions, sizes and z-index | 50px circles, 5% from top and bottom, z-index 6 |
| Wording-safe region | Region to keep clear | The central panel opening above the foregrounds |
| Reference viewport | The 9:16 plate size | A 9:16 invitation box (e.g. 900×1600) |
| Output directory | Where the assets live | `experiments/<template>/assets/ornaments/` |
| Naming prefix | Deterministic filename pattern | `frame-<NNN>-<left|right>-<description>.png` |

## Required outputs

1. **Placement composites:** one approved 9:16 composite per stop.
2. **Left and right RGBA PNGs:** one pair per stop, byte-stable.
3. **Manifest:** Markdown plus JSON giving the stop, side, file and
   starting placement.
4. **Hashes:** SHA-256 per file, recorded on intake.
5. **Alpha report:** RGBA status, transparent %, opaque-matte test,
   edge-contact test and orientation mass per file.
6. **Responsive placement map:** height, reach, ratio and offsets per
   asset, in the config.
7. **Animation mapping:** entrance/exit direction, duration and easing,
   reduced-motion rules, sequence.
8. **Review sheet:** per-stop browser screenshots next to the
   composites, with measured visible-artwork bounds.
9. **Approval record:** the Owner decision, the commit and scope.
10. **Regression fixtures:** the static lock (hashes, mapping, config
    agreement) and the behavioural verification.

## Automated validation

| Check | Rule | Ivory Palace implementation |
|---|---|---|
| Asset count | Exactly 2 × (number of Layer 3 stops) | `baseline.test.cjs` |
| Unique hashes | All SHA-256 distinct, and equal to the config | `baseline.test.cjs` |
| Alpha transparency | RGBA; fully transparent pixels ≥ 40% | `baseline.test.cjs` (decoded with the existing `sharp` devDependency) |
| No opaque background | No opaque near-black corner; opaque black under 1% | `baseline.test.cjs` |
| No unexpected edge contact | No solid (alpha ≥ 200) run along any canvas edge | `baseline.test.cjs` |
| Correct side orientation | At least 60% of the solid mass on the assigned outer half | `baseline.test.cjs` |
| Exact stop mapping | Each file bound to its stop index and side in the markup | `baseline.test.cjs` |
| Config agreement | Config ↔ CSS placement map ↔ HTML ↔ files | `baseline.test.cjs` |
| Responsive bounds | Visible artwork top in range; bottom- and outer-edge anchored; reach within the cap; no overflow | `verify.js` (seven viewports) |
| z-index ordering | Foreground inside the stop layer, after the frame and before the wording; controls at a higher z-index | `baseline.test.cjs` |
| Entrance/exit sequencing | Foreground enters after Layer 2 settles; clears before Layer 2 exits; travel starts after both | `verify.js` plus the source lock |
| No display during travel | Sampled every animation frame | `verify.js` |
| Finale exclusion | No foreground at excluded stops | `verify.js` plus the source lock |
| Navigation interactivity | Controls hit-testable above the foreground | `verify.js` |
| Reduced motion | Same order, opacity only, no slide | `verify.js` plus `baseline.test.cjs` |
| Visual regression | Screenshots per stop and viewport, reviewed against the composites | `verify.js` `VERIFY_SHOTS=<dir>` (review, not a pixel-exact assertion) |

The tests deliberately avoid exact-pixel comparisons. Rendering
differences between browser versions must not fail the build. Geometry
is checked with tolerances (for example, visible-artwork top 55–61% on
9:16).

## Human Owner review (never automated)

- Cultural appropriateness of every object and its use.
- Artistic quality and painterly consistency with Layers 1–2.
- Pair balance: coordinated, not mirrored.
- Perceived scale and visual richness against the composites.
- Wording-space suitability, confirmed again at Layer 4.
- Final approval, recorded in the approval record before wording
  begins.
