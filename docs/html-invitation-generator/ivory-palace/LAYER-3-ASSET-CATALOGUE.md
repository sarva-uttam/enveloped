# Ivory Palace — Layer 3 asset catalogue

**Status: Owner-approved.** Baseline commit
`3892648600f5b63a11a00d67cffacd7a24a2d9c8`. These six assets and their
placement are locked by
`experiments/ivory-palace-frame-journey/baseline.test.cjs`. The same data
is machine-readable in
[`layer-3-foreground.config.json`](layer-3-foreground.config.json).

- **Source:** the Owner's `ivory-palace-final-third-layer.zip`. The files
  are byte-identical to it, with their supplied filenames.
- **Repository path:** `experiments/ivory-palace-frame-journey/assets/ornaments/`.
- **Alpha:** every file is RGBA with genuine transparency and no opaque
  background, and the six hashes are distinct.

## Shared placement and motion

| Property | Value |
|---|---|
| Anchor | Bottom outer corner (`left: 0; bottom: 0` or `right: 0; bottom: 0`) |
| Size rule | `height: min(--orn-h × 1cqh, --orn-reach × 1cqw / --orn-ratio, 44cqh)`, `width: auto`, `object-fit: contain` |
| Inward reach cap | 66% of the invitation width (the ornament may pass behind the down control) |
| Offsets | `--orn-bottom`, `--orn-edge`, `--orn-dx`, all 0 |
| Measured on 9:16 | Visible artwork starts about 57–60% from the top; inward reach about 60–65% |
| Entrance | 1400ms `cubic-bezier(0.33, 1, 0.68, 1)`, from −9cqw (left) or +9cqw (right), after Layer 2 settles |
| Exit | 900ms `cubic-bezier(0.42, 0, 1, 1)`, outward, before Layer 2 exits |
| Reduced motion | 240ms / 180ms opacity-only crossfade, same order |
| Never shown | During travel, and at frame 300 (the finale) |

## Frame 80 — Introductory celebration

### Left: `frame-080-left-intro-drape-urli.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-080-left-intro-drape-urli.png` |
| Stop frame / side | 80 / left (`data-stop="0"`) |
| Dimensions | 1168 × 1346 px (ratio 0.8678) |
| SHA-256 | `09f4bdb22bf9cb07c564b1b1a73021a3f719a17d37ac7dbeee57aa9072cb9c83` |
| Alpha | RGBA; 54.7% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Saffron ceremonial textile, jasmine and floral urli |
| Intended orientation | Mass and tallest element on the left (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 42` (% height), `--orn-reach: 66` (% width), anchor bottom-left |
| Animation direction | Enters from the left; exits to the left |
| Approval | Owner-approved |

### Right: `frame-080-right-intro-diya-kalash.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-080-right-intro-diya-kalash.png` |
| Stop frame / side | 80 / right (`data-stop="0"`) |
| Dimensions | 1158 × 1358 px (ratio 0.8527) |
| SHA-256 | `a10f93a2ed3a4ebb319bc88030aa874face6c1ef619de311c20d0958b0217a5d` |
| Alpha | RGBA; 55.6% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Lotus, decorated kalash, flowers and tall brass diya |
| Intended orientation | Mass and tallest element on the right (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 42` (% height), `--orn-reach: 66` (% width), anchor bottom-right |
| Animation direction | Enters from the right; exits to the right |
| Approval | Owner-approved |

## Frame 160 — Haldi

### Left: `frame-160-left-haldi-kalash-textile.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-160-left-haldi-kalash-textile.png` |
| Stop frame / side | 160 / left (`data-stop="1"`) |
| Dimensions | 1145 × 1374 px (ratio 0.8333) |
| SHA-256 | `42b547389cdc51ebe13c893049c3092805182619232b795394b9e81d963092d6` |
| Alpha | RGBA; 48.9% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Embroidered turmeric textile, coconut kalash, mango leaves, turmeric/kumkum bowls and marigolds |
| Intended orientation | Mass and tallest element on the left (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 43` (% height), `--orn-reach: 66` (% width), anchor bottom-left |
| Animation direction | Enters from the left; exits to the left |
| Approval | Owner-approved |

### Right: `frame-160-right-haldi-floral-kalash.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-160-right-haldi-floral-kalash.png` |
| Stop frame / side | 160 / right (`data-stop="1"`) |
| Dimensions | 1152 × 1365 px (ratio 0.8440) |
| SHA-256 | `8d4af05bc731e5464c09f1940d036712219190484980e14ceda1b4f64996ca88` |
| Alpha | RGBA; 51.4% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Floral kalash, lotus, Haldi/kumkum vessels, diya, jasmine and marigolds |
| Intended orientation | Mass and tallest element on the right (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 43` (% height), `--orn-reach: 66` (% width), anchor bottom-right |
| Animation direction | Enters from the right; exits to the right |
| Approval | Owner-approved |

## Frame 240 — Wedding

### Left: `frame-240-left-wedding-lanterns.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-240-left-wedding-lanterns.png` |
| Stop frame / side | 240 / left (`data-stop="2"`) |
| Dimensions | 1131 × 1391 px (ratio 0.8131) |
| SHA-256 | `8d408cdfa328f1551aea1dc6314a6c70c359b5e5b5bccc23221a37c7e55b410d` |
| Alpha | RGBA; 47.9% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Paired Ivory Palace lanterns, jasmine, marigolds and restrained burgundy flowers |
| Intended orientation | Mass and tallest element on the left (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 42` (% height), `--orn-reach: 66` (% width), anchor bottom-left |
| Animation direction | Enters from the left; exits to the left |
| Approval | Owner-approved |

### Right: `frame-240-right-wedding-lotus-urli.png`

| Field | Value |
|---|---|
| Repository path | `experiments/ivory-palace-frame-journey/assets/ornaments/frame-240-right-wedding-lotus-urli.png` |
| Stop frame / side | 240 / right (`data-stop="2"`) |
| Dimensions | 1145 × 1374 px (ratio 0.8333) |
| SHA-256 | `c72e46b66d9d953ebb522f454d9b0430c0128766150c72dcd0c664caf18aa5b8` |
| Alpha | RGBA; 55.7% fully transparent; no opaque background; no solid artwork at the canvas edges |
| Visual description | Vertical lotus urli, ceremonial kalash, tall brass diya and wedding flowers |
| Intended orientation | Mass and tallest element on the right (outer) side; tapers toward the centre |
| Responsive placement | `--orn-h: 42` (% height), `--orn-reach: 66` (% width), anchor bottom-right |
| Animation direction | Enters from the right; exits to the right |
| Approval | Owner-approved |

## Approved placement composites

The Owner approved three complete 9:16 placement composites, one per
stop. They are the visual source of truth for scale (visible artwork
from about 57–60%), frame overlap and balance.

They were supplied during the review conversation and **are not
committed to this repository**, so no repository path exists for them.
If they are archived later, add their paths here and in the config's
`approval.notes`.
