# Flowers and foliage — Owner review

Status: **UNDER_REVIEW**. No candidate is production-selectable. No commit, push, merge, deployment or price/access change has been made.

Branch: `integration/hindu-wedding-registry-v1`. Starting/current commit: `5601ae05a2a1937efcfbf70f548809b52e7f3e43`. Safe fetch and fast-forward-only synchronisation found no upstream changes; existing work was preserved.

Execution, authenticated repository access and ChatGPT built-in image generation were available. Applicable governance, registry, schema, asset conventions and approved visual references were inspected.

Baseline: **831 tests passed in 70 files**, matching the reported baseline. Final application tests again passed 831/831. Registry validation, ESLint, TypeScript and Next.js build passed. The separate review validator passed schema, review isolation, commercial-rule preservation, image integrity and placement checks. All 266 image files decoded successfully. Database integration tests were not run; the reported 831-test suite is the Vitest application suite.

## Review inventory

19 registered entries; 23 retained candidates. Every entry retains its existing Bronze/Included access rules. Fuller Silver/Gold/Platinum versions are proposals only; no additional charge or tier restriction is active. Variants change composition or material/colour as described; they do not substitute unapproved species.

| Stable ID | Public family | Botanical description | Candidate variants / proposed tier |
|---|---|---|---|
| HW-FLORAL-001 | Ruby Rose | red roses | base — Bronze |
| HW-FLORAL-002 | Blush Reverie | blush roses | base — Bronze |
| HW-FLORAL-003 | Garden Romance | pink garden roses | base — Bronze |
| HW-FLORAL-004 | Ivory Rose | white roses | base — Bronze |
| HW-FLORAL-005 | Peony Grace | blush peonies | base — Bronze |
| HW-FLORAL-006 | Jasmine Whisper | white jasmine | base — Bronze |
| HW-FLORAL-007 | Marigold Radiance | marigolds | base — Bronze |
| HW-FLORAL-008 | Lotus Serenity | lotus | base — Bronze |
| HW-FLORAL-009 | Chrysanthemum Lace | white chrysanthemums | base — Bronze |
| HW-FLORAL-010 | Celebration Bloom | marigolds, white jasmine, red roses | base — Bronze, fuller-silver — Silver |
| HW-FLORAL-011 | Garden Corner | roses, jasmine, marigold accents | base — Bronze, layered-gold — Gold, right — Bronze |
| HW-FLORAL-012 | Crown of Blossoms | roses, jasmine, marigold accents | base — Bronze |
| HW-FLORAL-013 | Garden at Dawn | roses, jasmine, marigold accents | base — Bronze, luxury-platinum — Platinum |
| HW-FLORAL-015 | Garden Embrace | roses, jasmine, marigold accents | base — Bronze |
| HW-FOLIAGE-001 | Mango Grace | mango leaves | base — Bronze |
| HW-FOLIAGE-002 | Tropical Silk | banana leaves | base — Bronze |
| HW-FOLIAGE-005 | Sage Mist | sage-coloured eucalyptus-style decorative foliage | base — Bronze |
| HW-FOLIAGE-006 | Eucalyptus Air | eucalyptus-style foliage | base — Bronze |
| HW-FOLIAGE-007 | Gilded Eucalyptus | stylised metallic eucalyptus-style foliage | base — Bronze |

## Technical and cultural findings

All retained artwork was inspected at native resolution on pale/dark surfaces and in 360-pixel mobile previews. The illustrations have recognisable stylised flower/leaf forms and plausible botanical attachment; no obvious fused blossoms, floating leaves, accidental faces, text, unrelated objects or visible white cutout halos were observed. Native masters remain byte-identical to generator output. Alpha is genuine, production-candidate WebP alpha is preserved exactly, and each delivery file is below 750 KB. No identical master hashes were found. Mobile placement limits are recorded; native tool output was smaller than requested, so output dimensions have not been represented as the requested dimensions.

22 candidates can meet the 2× native-detail requirement at their recorded display limits. HW-FLORAL-015 Garden Embrace is **art-direction review only**: its 941×1672 master is insufficient for a 1000×1778 full-page border at 2× detail, and demonstrated border placement intersects registered text rectangles. It requires higher-resolution re-authoring and safer slot/text geometry before production. Approval of its appearance must not remove these blocks.

The first Garden Embrace generation was rejected for clipping/edge crowding and regenerated. Its rejected master and exact prompt are retained only in the isolated audit folder. Three incomplete option-card exports were repaired and verified; they were export faults, not rejected artwork.

Corner and top-edge cluster roles differ from their current foreground registry slot. Proposed placements remain inactive pending Owner review. The right corner was separately generated and inspected; it is not a mirrored image. Demonstrations use approved Ivory + Palace Whisper and Ruby + Champagne Colonnade pairings. Other individual background/frame/header combinations remain pending placement review. No full-page architecture pairing is proposed for the border.

Cultural compatibility is **PENDING_CULTURAL_REVIEW**. These are Owner-authorised decorative botanical choices, with no claim of universal Mauritian Hindu ceremonial suitability or religious/family meanings. Sage Mist uses sage-coloured eucalyptus-style leaves, not a sage-plant identification. Gilded Eucalyptus is stylised metallic foliage, not naturally gold leaves. Lotus, peonies and chrysanthemums remain separate choices. No hanging strings, torans, garlands, sacred imagery, ceremonial objects, particles or templates were generated.

HW-FOLIAGE-003 and HW-FOLIAGE-004 remain deferred pending botanical specification. HW-FLORAL-014 is excluded from this batch. Existing registry records for all three remain unchanged.

## Files and provenance

`masters/`: 23 transparent native PNGs. `delivery/`: 23 optimised alpha WebPs. `option-cards/`: 46 labelled 540×960 cards (two approved demonstration surfaces per candidate). `thumbnails/`: 23 270×480 thumbnails. `family-comparisons/`: 19 family sheets. `tier-contact-sheets/`: four tier sheets. `complete-contact-sheet.png`: complete Ivory review sheet. `qa/ruby-option-contact-sheet.png`: complete Ruby sheet. `detail-crops/`: 23 native-detail crops. `qa/`: native-resolution and mobile QA composites.

`review-manifest.json` records IDs, prompts, botanical descriptions, tiers, generation date/method, paths, dimensions, bounding boxes, alpha, anchors, safe rectangles, native scale limits, compatibility, alt text and findings. `visual-qa-ledger.json` records actual inspection outcomes. The tool did not expose a model identifier, so it is null. No third-party reference pixels or invented provenance are claimed. Generation prompt/reference basis and rights-evidence limitations are recorded.

Registry changes are review-only metadata and status records in `components.json` and `asset-generation-status.json`, generated from `scripts/build-design-library.mjs`. Production source/delivery paths remain null and eligibility false. Pricing, placement, compatibility and survey mapping files are byte-unchanged. `scripts/build-flora-review.py` reproduces review exports; `scripts/validate-flora-review.py` checks isolation and preservation. Python export tools require Pillow and jsonschema.

## Exact Owner decisions required

1. Approve, reject or request edits for each of the 23 candidate IDs in the manifest. Approval of appearance is not automatic production activation.
2. Review the three richer-tier composition proposals: Celebration Bloom Silver, Garden Corner Gold and Garden at Dawn Platinum. Existing Bronze/Included options remain intact; no charges or access restrictions are introduced by this review.
3. Approve or revise the inactive corner/top-edge placement proposals and independently generated right-corner counterpart.
4. For Garden Embrace, approve or reject the art direction only; keep full-page production blocked until higher-resolution artwork and safe text geometry are verified.
5. Resolve decorative tradition compatibility where relevant before asserting cultural suitability.

Work stops here for explicit Owner approval. No next batch will begin.
