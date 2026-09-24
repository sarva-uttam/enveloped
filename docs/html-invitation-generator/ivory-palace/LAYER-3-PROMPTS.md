# Layer 3 — Canonicalized production prompts

**These are the canonicalized successful production prompts. They are
not verbatim historical prompts.** The original image-generation prompts
used for the Ivory Palace Layer 3 artwork are not recorded in Git. The
wording below was reconstructed from:

- the Owner's implementation briefs;
- the approved package manifest;
- the approved composites;
- the lessons in [`LAYER-3-DECISION-LOG.md`](LAYER-3-DECISION-LOG.md).

The prompts encode what produced the approved result. Treat them as the
maintained starting point, and revise them as later templates teach new
lessons.

Structure:

- **§A** Template-neutral prompts, with `{{VARIABLES}}`.
- **§B** Ivory Palace variable values.
- **§C** Ivory Palace per-stop object briefs.

Method: [`../LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md`](../LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md).

## Variables

| Variable | Meaning |
|---|---|
| `{{TEMPLATE_NAME}}` | Template display name |
| `{{CULTURAL_TRADITION}}` | The tradition the objects must authentically represent |
| `{{STOP_ID}}` | Stop frame identifier, e.g. `080` |
| `{{EVENT_TYPE}}` | Event this stop represents |
| `{{PALETTE}}` | Shared colour palette |
| `{{MATERIALS}}` | Shared materials (metals, textiles, flowers) |
| `{{LEFT_COMPOSITION}}` | Object brief for the left composition |
| `{{RIGHT_COMPOSITION}}` | Object brief for the right composition |
| `{{WORDING_SAFE_AREA}}` | Region that must stay clear, as % of the 9:16 frame |
| `{{NAVIGATION_SAFE_AREA}}` | Control positions and sizes |
| `{{TARGET_HEIGHT}}` | Visible-artwork top as % from the top, plus the display height |
| `{{ENTRANCE_DIRECTION}}` | Per side: left enters from the left, right from the right |
| `{{APPROVED_REFERENCE_COMPOSITE}}` | The approved composite for this stop (used after approval) |
| `{{REFERENCE_PLATE}}` | A 9:16 screenshot of the locked Layers 1–2 at this stop |

## §A. Template-neutral prompts

### A1. Complete 9:16 placement composite (one per stop)

```text
Using the attached 9:16 reference plate {{REFERENCE_PLATE}} exactly as the
background (do not alter the background, panel or frame), paint a matched
pair of {{CULTURAL_TRADITION}} ceremonial foreground compositions for the
{{EVENT_TYPE}} chapter of the {{TEMPLATE_NAME}} invitation.

LEFT (lower-left corner): {{LEFT_COMPOSITION}}
RIGHT (lower-right corner): {{RIGHT_COMPOSITION}}

Placement and scale:
- Each composition rises from its bottom outer corner; the visible artwork
  begins around {{TARGET_HEIGHT}} and continues to the bottom edge.
- Tallest elements sit near the outer edges; each composition tapers
  gradually toward the centre.
- Both compositions stand in front of the lower frame rail and pillars and
  overlap them naturally, as if resting on the palace floor.
- Keep {{WORDING_SAFE_AREA}} clear for text. Artwork may pass behind the
  bottom navigation control at {{NAVIGATION_SAFE_AREA}}, but the centre must
  read as open.

Style: substantial, rich and dense at the base; painterly realism matching
the background; shared palette {{PALETTE}}; materials {{MATERIALS}};
consistent lighting direction. Left and right are coordinated but NOT
mirrored. Authentic objects, believable physics, nothing floating.

Do not: add text, logos or watermarks; draw small sticker-like
decorations; tuck the artwork timidly beneath the frame; duplicate objects
between the two sides.
```

### A2. Left-side transparent production asset

```text
Recreate ONLY the LEFT foreground composition from the approved composite
{{APPROVED_REFERENCE_COMPOSITE}} as a standalone production asset.

- Output: PNG, RGBA, genuinely transparent background (alpha 0), no black
  or white matte, no shadow plate, no floor texture.
- Same objects, arrangement, silhouette, palette and lighting as the
  approved composite: {{LEFT_COMPOSITION}}.
- Orientation: visual mass and tallest element on the LEFT (outer) side,
  tapering toward the right (centre).
- Portrait-leaning canvas (about 0.8–0.9 width/height). Keep the whole
  composition inside the canvas with a small transparent margin: no
  objects cut off at any edge.
- Crisp, anti-aliased edges on gold, petals and leaves; keep fine details
  and glows; no halo.
```

### A3. Right-side transparent production asset

Same as A2 with `RIGHT`, `{{RIGHT_COMPOSITION}}`, and the visual mass
and tallest element on the **right (outer)** side, tapering toward the
left (centre).

### A4. Alpha-correction regeneration

Use this when the validation reports an opaque background, a black
matte, a cropped edge or a duplicate.

```text
The supplied file {{FILE}} failed production validation: {{FAILURE}}
(e.g. "0% transparent pixels — background is opaque black", "artwork
touches the right canvas edge", "identical to {{OTHER_FILE}}").
Regenerate the SAME composition, unchanged in content, scale and
orientation, as a PNG with a genuinely transparent (alpha 0) background.
Do not flatten, do not add a matte, do not crop. Deliver the file inside a
ZIP; do not paste it as an image preview (previews lose transparency).
```

Never "fix" a failed file by automatic black-background removal. It
damages gold edges, shadows and fine details.

### A5. Responsive HTML/CSS implementation

```text
Implement Layer 3 for {{TEMPLATE_NAME}} from the package manifest and the
approved composites.
- Use the supplied files byte-for-byte; filenames define stop and side.
  Verify RGBA, transparency, distinct SHA-256, orientation and no edge
  contact first; reject failures.
- One left/right pair per stop inside the stop layer, above the frame and
  below the wording layer; controls above everything (z-index).
- Per-asset controls: display height (primary), inward-reach cap, natural
  ratio, bottom offset, outer-edge offset, horizontal nudge. width: auto;
  object-fit: contain; anchor left:0/right:0; bottom:0. No mirroring,
  stretching, cropping or file edits.
- Sequence: land -> Layer 2 in -> Layer 3 pair glides in
  ({{ENTRANCE_DIRECTION}}) -> controls unlock. Leave: lock input -> Layer 3
  out -> Layer 2 out -> journey. Never visible during travel or at the
  finale. Reduced motion: same order, opacity only.
- Judge placement from visible alpha bounds, not the PNG canvas.
```

### A6. Visual-comparison review

```text
Capture the running prototype at each stop at the reference viewport and
at narrow mobile, tall mobile, tablet, desktop-portrait and desktop-landscape
sizes. For each stop, compare against {{APPROVED_REFERENCE_COMPOSITE}}:
visible-artwork top (% from top), inward reach (% width), frame overlap,
left/right balance, richness, wording-area openness, control visibility.
Report measured numbers from isolated visible-alpha bounds. If the browser
result is visibly smaller or sparser than the composite, it is not complete.
```

### A7. Owner approval and lock-in

```text
Present the per-stop screenshots next to the approved composites with the
measured numbers. On Owner approval: record the approved state and commit in
the approval record, update the asset catalogue and machine-readable config,
extend the static lock (hashes, mapping, placement map, sizing rule, motion,
layering) and behavioural verification, then stop before wording.
```

## §B. Ivory Palace variable values

| Variable | Ivory Palace value |
|---|---|
| `{{TEMPLATE_NAME}}` | Ivory Palace — Signature Edition |
| `{{CULTURAL_TRADITION}}` | Hindu (North/West Indian and Mauritian) wedding ceremony |
| `{{PALETTE}}` | Warm ivory, antique and polished gold, marigold orange/yellow, jasmine white, lotus pink, restrained burgundy, deep leaf green |
| `{{MATERIALS}}` | Engraved brass and gold vessels (kalash, urli, diya, lanterns), ivory-glazed kalash, embroidered silk, marigold, jasmine, lotus, rose, mango and betel leaves, coconut |
| `{{WORDING_SAFE_AREA}}` | The panel's central opening above the foregrounds (roughly 18–57% from the top on 9:16) |
| `{{NAVIGATION_SAFE_AREA}}` | Up and down controls: 50px circles centred horizontally, 5% from the top and bottom (z-index 6) |
| `{{TARGET_HEIGHT}}` | Visible artwork from about 57–60% from the top; display height 42–43% of the invitation height |
| `{{ENTRANCE_DIRECTION}}` | Left enters from the left, right from the right (9cqw slide) |

## §C. Ivory Palace per-stop object briefs

| Stop | Event | `{{LEFT_COMPOSITION}}` | `{{RIGHT_COMPOSITION}}` |
|---|---|---|---|
| 080 | Introductory celebration | Saffron embroidered ceremonial textile draped tall at the outer edge, jasmine garlands, brass floral urli and small offering bowls, marigolds | Pink lotus, ivory-and-gold decorated kalash with coconut, flowers, tall multi-wick brass diya at the outer edge |
| 160 | Haldi | Embroidered turmeric-yellow textile, coconut kalash with mango leaves, turmeric and kumkum bowls, marigolds, jasmine | A distinct floral kalash with lotus, Haldi and kumkum vessels, a lit diya, jasmine, marigolds, tall lamp at the outer edge |
| 240 | Wedding | Paired Ivory Palace lanterns (tall one at the outer edge), jasmine strands, marigolds, restrained burgundy roses, offering tray | Vertical lotus urli with rose petals, ceremonial kalash, tall brass diya at the outer edge, wedding flowers |
