# Ivory Palace — Layer 3 decision log

This log records the development path from the first ornament attempt
to the Owner-approved ceremonial foreground system, in order. Every
commit remains in Git history. Nothing in "Rejected" is present in the
approved tree.

**Approved baseline:** `3892648600f5b63a11a00d67cffacd7a24a2d9c8`
(final scale `6ee2ca3`).

## Approved method (what worked)

- Placement composites first. Then production cutouts reproduced from
  the approved composites.
- Assets delivered as a ZIP with deterministic filenames plus a
  manifest, and validated for alpha, hashes, orientation and edges on
  intake.
- Height-first responsive placement anchored to the bottom outer
  corners. Visible artwork starts about 57–60% from the top on 9:16
  (display height 42/43/42%), with an inward-reach cap of 66%. The
  ornaments overlap the frame and pass behind the down control.
- Sequencing: Layer 3 enters after Layer 2 settles and leaves before
  it.
- Placement judged from visible alpha bounds and compared directly with
  the approved composites.

## Development path

| # | Attempt / finding | Outcome | Commit(s) |
|---|---|---|---|
| 1 | Small corner decorations placed inside the frame's panel (40% of the panel width, resting on the arch floor) | **Rejected:** sparse and timid, reading as small icons beside the frame | `81023fc` |
| 2 | Wide landscape ornament assets (about 1.5:1), sized into lower-corner zones | **Rejected:** a landscape silhouette cannot give the required vertical presence without crossing the centre | `81023fc`; working-tree trials (not committed) |
| 3 | Assets pasted into chat as images | **Rejected as a delivery route:** chat previews arrived flattened (0% transparent, black matte), and once as a duplicate | — (detected on intake) |
| 4 | Delivery by ZIP | **Adopted:** preserves the original RGBA files byte-for-byte | `0b89d44`, `9f086d2` |
| 5 | Automatic black-background removal (offered as an option) | **Rejected by the Owner:** it risks damaging gold edges, glows, shadows and fine details. Failed files are regenerated, never repaired | — |
| 6 | Duplicate files and wrong-side compositions (the same file supplied twice; left-weighted art assigned to the right) | **Prevented:** SHA-256 uniqueness plus a solid-mass orientation check on intake | checks in `baseline.test.cjs` |
| 7 | Transparent canvas size used as the measure of the artwork | **Rejected:** canvas margins differ per file, so canvas bounds misstate the visible artwork | — |
| 8 | Placement judged from visible alpha bounds (each ornament rendered alone, bounds found from pixels) | **Adopted** in `verify.js` | `0b89d44` onward |
| 9 | Lossless trimming of transparent padding to enlarge the art | **Rejected by the Owner:** the approved files must stay untouched. Margins are handled in CSS instead | working tree only (reverted) |
| 10 | Tall, narrow third-layer set at 32% height | Superseded by the final package | `0b89d44` |
| 11 | Final package at the manifest's 32–34% (visible top about 67–70%) | **Rejected as too small** against the approved composites | `9f086d2` |
| 12 | 42/43/42% display height, visible artwork from about 57–60% | **Approved** | `6ee2ca3` |
| 13 | Inward-reach cap of 47–49% (keep each ornament to its own half) | **Replaced by 66%:** the cap must allow frame overlap and natural extension behind the down control | `6ee2ca3` |
| 14 | Manifest numbers versus the approved composites | **Decision:** the approved composites are the visual source of truth; manifest numbers are a starting point | `6ee2ca3` |

## Lessons

1. Design the **complete composition** before producing any cutouts.
   Isolated assets hide scale problems.
2. **Portrait-leaning silhouettes** (about 0.8–0.9 width/height) are
   needed to reach about 57–60% from the top without swamping the
   centre.
3. **Transfer production files as files** (a ZIP), and verify alpha on
   the files themselves.
4. **Reject and regenerate**; never auto-repair alpha.
5. **Hash and orientation checks** catch duplicates and swapped sides
   cheaply.
6. **Measure visible artwork**, not canvases.
7. **The composite is the target.** When numbers and the composite
   disagree, the composite wins, and the numbers are updated.
