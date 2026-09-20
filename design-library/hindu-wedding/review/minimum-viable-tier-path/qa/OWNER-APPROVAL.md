# Owner Approval — Minimum Viable Tier Path

Decision: **APPROVED**  
Owner confirmation date: **2026-09-20**  
Source commit reviewed: `b13bd2c155a9bb41ae87f6713524eeceb6199026`  
Branch: `integration/hindu-wedding-registry-v1`

The Owner explicitly confirmed that the generated Minimum Viable Tier Path assets had been checked and approved. This record converts the accepted trial assets from `UNDER_REVIEW` to `APPROVED`.

## Approved Silver assets

- `HW-CANOPY-001-V2` — supported Mango Leaf Toran
- `HW-CEREM-002-V1` — combined brass standing-lamp pair
- `HW-CEREM-002-V1-LEFT` — independently authored left lamp
- `HW-CEREM-002-V1-RIGHT` — independently authored right lamp
- `HW-LIGHT-007-V1` — CSS central text glow

## Approved Gold assets

- `HW-ANIMAL-002-V2` — combined inward-facing peacock pair
- `HW-ANIMAL-002-V2-LEFT` — independently authored left peacock
- `HW-ANIMAL-002-V2-RIGHT` — independently authored right peacock
- `HW-EFFECT-004-V1` — sparse gold sparkles
- `HW-EFFECT-002-V2` — six rose-petal sprites
- `TRIAL-FALLING-PETALS-V1` — deterministic falling-petal motion and static/reduced-motion fallback

## Approved Platinum assets

- `HW-PEOPLE-005-V2` — rear-facing cinematic couple
- `HW-EFFECT-008-V1` — deterministic soft floral reveal implementation
- `TRIAL-CINEMATIC-LIGHT-V1` — cinematic lighting treatment and static/reduced-motion fallback

## Approval boundary

- The approval covers the assets and code-native treatments listed above.
- Combined lamp and peacock pairs and their independent LEFT/RIGHT children are all approved; no automatic mirroring is authorised.
- Rejected v1 candidates remain rejected and non-selectable.
- `HW-FLORAL-010-V1-BASE` remains a separate `UNDER_REVIEW_TRIAL_DEPENDENCY`. The approved floral-reveal implementation must not be activated with that botanical asset until the botanical asset receives separate approval.
- The complete trial package therefore remains package-level non-selectable for now, even though its accepted component records are approved.
- This record does not approve H01–H08 templates, a merge to master, deployment or publication.
- Pricing and the agreed commercial model are unchanged.
