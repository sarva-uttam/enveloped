# Layer 3 — Ceremonial Foreground Method (reusable)

**Status: the canonical, reusable production method** for the third
presentation layer of chapter-stop HTML invitations. It is derived from
the Owner-approved Ivory Palace implementation. The authoritative
baseline is commit `3892648600f5b63a11a00d67cffacd7a24a2d9c8` on
`experiment/ivory-palace-frame-journey`. The approved Layer 3 scale
landed in `6ee2ca3`, and `3892648` is the complete approved state.

This method is template-neutral. Reuse the *process*, the *validation*
and the *design rules*. Never copy Ivory Palace artwork into another
template. Template-specific material lives under a per-template folder,
for example [`ivory-palace/`](ivory-palace/).

Companion documents:

| Document | Role |
|---|---|
| [`LAYER-3-AUTOMATION-CONTRACT.md`](LAYER-3-AUTOMATION-CONTRACT.md) | Inputs, outputs, automated checks, human-review gates |
| [`layer-3-foreground.schema.json`](layer-3-foreground.schema.json) | Versioned machine-readable specification |
| [`ivory-palace/layer-3-foreground.config.json`](ivory-palace/layer-3-foreground.config.json) | First validated example configuration |
| [`ivory-palace/LAYER-3-ASSET-CATALOGUE.md`](ivory-palace/LAYER-3-ASSET-CATALOGUE.md) | The six approved Ivory Palace assets |
| [`ivory-palace/LAYER-3-PROMPTS.md`](ivory-palace/LAYER-3-PROMPTS.md) | Canonicalized prompt library |
| [`ivory-palace/LAYER-3-DECISION-LOG.md`](ivory-palace/LAYER-3-DECISION-LOG.md) | Rejected approaches and lessons |
| [`IVORY-PALACE-FRAME-JOURNEY-METHOD.md`](IVORY-PALACE-FRAME-JOURNEY-METHOD.md) | Layer 1 (§1–§10, §13) and Layer 2 (§11) method; Layer 3 implementation (§12) |
| [`IVORY-PALACE-STOP-LAYER-APPROVAL.md`](IVORY-PALACE-STOP-LAYER-APPROVAL.md) | Approval record |

## The layer model

| Layer | Content | Ivory Palace example |
|---|---|---|
| 1 | Animated background journey (frame canvas) | 300-frame palace journey, CSS-graded |
| 2 | Stop panel: translucent inner panel plus architectural frame | 85% ivory panel plus the gold arch frame |
| **3** | **Ceremonial foreground: one left/right pair per stop** | Six ceremonial compositions |
| 4 | Live wording (future) | Reserved, empty `#stopContent` |
| 5 | Navigation and accessibility controls | Up/down buttons (z-index 6) |

## What Layer 3 is for

Layer 3 is a **foreground storytelling system**, not a set of
decorative corner icons. At each stop it places a coordinated pair of
substantial ceremonial compositions in the lower corners. They tell
that chapter's story (for example the welcome, the Haldi and the
wedding), give the frame a sense of physical depth, and anchor the
composition, while leaving the central wording area and the controls
clear.

## The workflow

Each step lists what "done" means before moving on.

1. **Define the purpose.** Name each stop's event and the story its
   foreground tells. Done means one sentence per stop, and no two stops
   telling the same story.
2. **Lock Layers 1 and 2.** Layer 3 is designed against a *fixed*
   background and panel/frame. Record both in an approval record and
   protect them with a static lock test (Ivory Palace:
   `baseline.test.cjs`). Done means both are Owner-approved and the
   lock is green.
3. **Identify the safe regions.** Measure, in invitation-box
   percentages:
   - the **wording-safe region**, where future text will sit;
   - the **navigation-safe geometry**, the control positions and sizes.

   Layer 3 may pass *behind* controls, which stay above it by z-index,
   but must never make them unclickable.
4. **Prepare a fixed 9:16 reference composite.** Take one screenshot
   per stop of the locked Layers 1–2 at the reference viewport (a 9:16
   invitation box). Placement studies are painted onto these exact
   plates.
5. **Generate three complete placement studies first.** Produce one
   full 9:16 composite per stop, before any cutouts. Each shows the
   final left/right pair in place, over the real frame and background.
   Judge scale, overlap, balance and wording space *as a whole*.
   Studies of isolated objects are not acceptable at this stage.
6. **One coordinated pair per stop.** Every stop gets exactly one left
   composition and one right composition. The two are designed together
   (shared palette, lighting and ground plane) but are **not mirrored**.
7. **Owner approval of the complete compositions.** The Owner approves
   the three composites, and they become the **visual source of truth**
   for scale and placement. Manifest numbers only approximate them.
8. **Generate production cutouts from the approved compositions only.**
   Each side becomes a separate transparent PNG that faithfully
   reproduces its approved composite element. Never invent new objects
   at this step.
9. **Validate genuine alpha.** Check the files themselves, never a
   preview:
   - RGBA format;
   - substantial fully transparent area;
   - no opaque background or black matte;
   - no solid artwork cut off at a canvas edge;
   - the visual mass sits on the assigned outer side.

   Reject, don't repair: automatic background removal damages gold
   edges, glows and fine details.
10. **Package deterministically.** Deliver a ZIP (never pasted
    previews) with fixed filenames
    `frame-<NNN>-<side>-<short-description>.png` and a manifest
    (Markdown plus JSON) giving the stop, side and starting placement.
    Record SHA-256 hashes on intake. All hashes must be distinct.
11. **Map each asset to its stop and side.** The filenames are the
    mapping. Verify it against the composites (orientation, subject)
    before implementing.
12. **Implement independent responsive placement.** Give each asset its
    own controls (custom properties): display height, inward-reach cap,
    natural ratio, bottom offset, outer-edge offset and horizontal
    nudge.
    - **Height is the primary size**, with `width: auto` and
      `object-fit: contain`.
    - Anchor each ornament to its bottom outer corner.
    - Never mirror, stretch, crop or edit the files.
    - Place and judge by **visible alpha bounds**, not by the PNG
      canvas.
13. **Animate Layer 3 only after Layer 2 settles.** The sequence is:
    land exactly, then Layer 2 fades in, then the Layer 3 pair
    fades and slides inward (left from the left, right from the right),
    then the pair comes to rest, and only then do the controls unlock.
14. **Clear Layer 3 before Layer 2 exits.** On leaving: lock input,
    then slide and fade Layer 3 outward, then fade Layer 2 out, and
    only then resume the journey. Nothing from Layers 2–3 may be
    visible during travel.
15. **Compare the browser against the approved composites.** Measure
    the visible-artwork top, the inward reach and the frame overlap per
    stop, at the reference viewport and at representative phones,
    tablets and desktops. If the browser result is visibly smaller or
    sparser than the composite, it is not done.
16. **Protect the final configuration with regression tests.**
    - A static lock covers file hashes, mapping, placement map, sizing
      rule, motion and layering.
    - A behavioural check covers sequencing, travel invisibility, the
      finale exclusion, placement from visible pixels, controls and
      reduced motion.
    - The machine-readable configuration must agree with the running
      implementation.
17. **Record Owner approval before wording.** Update the approval
    record and the method documents. Layer 4 (wording) starts only
    after Layer 3 is approved, and must then resolve any overlap
    between the foregrounds and the wording-safe region.

## Approved design principles

- **Substantial presence.** Foregrounds are large, painterly
  ceremonial compositions. In the Ivory Palace reference, the visible
  artwork starts about 57–60% from the top of a 9:16 invitation.
- **Coordinated, not mirrored.** Left and right share a palette,
  materials, lighting and ground plane, but differ in objects and
  silhouette.
- **Tall, moderately broad silhouettes.** A dense lower base with
  controlled upward movement. The tallest elements (a lamp, a draped
  textile, a lantern) sit near the **outer edges**. The composition
  tapers gradually toward the centre.
- **Intentional overlap with the Layer 2 frame.** The foreground
  stands in front of the frame's lower rail and pillars, as if placed
  on the palace floor.
- **A clear central wording area.** The centre stays open. Inward
  reach may pass behind the bottom control, which stays above the
  artwork.
- **Authentic cultural objects and believable physics.** Real vessels
  (kalash, urli, diya), real flowers (marigold, jasmine, lotus, rose)
  and textiles that drape and rest plausibly. Nothing floats.
- **A shared visual language.** One palette, one set of materials
  (brass, gold, ivory, silk) and one lighting direction, in painterly
  realism matching Layers 1–2.
- **Different storytelling per stop.** Each stop's pair tells its own
  chapter, and no composition is duplicated.
- **Never:** small sticker-like decorations; timid placement beneath
  the frame; mirrored copies; duplicated assets; objects cropped by the
  canvas.

## Non-goals and boundaries

- This method does not generate wording, alter Layers 1 or 2, or change
  the journey's timing.
- Artistic and cultural approval cannot be automated (see the
  automation contract). The Owner approves the composites and the final
  browser result.
