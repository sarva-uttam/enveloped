# Ivory Palace — Signature Edition: modular wording system

**Status:** mixed, recorded per item. The catalogue contains 348 Owner-approved reusable wording alternatives. It also contains client-editable personal-information fields, approved wording that may be used only after the client confirms a fact, sacred, Sanskrit and Hindi wording that still needs culturally fluent human review, items still pending Owner review, rejected decisions, and older unapproved legacy drafts. None of these categories implies another. Owner approval of a wording choice is not approval of any client's facts, and it does not replace cultural review.

The catalogue is isolated at `experiments/ivory-palace-frame-journey/wording/catalogue.json`. It is data, not a renderer or production template. No wording is placed in frames or displayed by the current HTML experiment.

## Sources of truth and regeneration

The individual approved files under `experiments/ivory-palace-frame-journey/wording/` are authoritative:

| Collection | Authoritative file | Frame |
| --- | --- | --- |
| `welcome.romanticOpenings` | `welcome/romantic-openings/openings.json` (with `REVIEW-DRAFT.md`) | 80 |
| `haldi.titles` | `haldi/titles/titles.json` (with `TITLES.md`) | 160 |
| `haldi.introductions` | `haldi/introductions/introductions.json` (with `INTRODUCTIONS.md`) | 160 |
| `haldi.welcomeLines` | `haldi/welcome-lines/welcome-lines.json` (with `WELCOME-LINES.md`) | 160 |
| `haldi.hostStructures` | `haldi/host-structures/host-structures.json` (with `HOSTS.md`) | 160 |
| `wedding.titles` | `wedding/titles/TITLES.md` | 240 |
| `wedding.invitations` | `wedding/invitations/INVITATIONS.md` | 240 |
| `wedding.giftPreference` | `wedding/REVIEW-NOTES.md` (orange zone) | 240 |
| `wedding.joiningSymbols` | `wedding/symbols/README.md` | 240 |
| `wedding.elderBlessings` | `wedding/elders/ELDERS.md` | 240 |
| `finale.presenceLines`, `finale.complimentsSignOff` | `finale/presence-and-compliments/presence-and-compliments.json` (with `PRESENCE-AND-COMPLIMENTS.md`) | 300 |

`catalogue.json` is generated. Regenerate it with `python3 experiments/ivory-palace-frame-journey/wording/build_catalogue.py`. The builder reads every approved collection directly from these files and never restates approved sentences, so regeneration cannot erase or drift from them. Where an approved collection is Markdown only, the builder parses its table or its exact quoted phrase, and it exits with an error if the expected wording is missing. The builder also holds the older legacy drafts, which are kept only as labelled, unapproved material. To change approved wording, edit the individual file, regenerate, and run the tests.

Run `node --test experiments/ivory-palace-frame-journey/wording/validate.test.cjs`. The tests check the exact collection counts, verbatim preservation against both the JSON and Markdown sources, the required phrases, that rejected wording stays rejected, the status separation, placeholder safety, and that regeneration reproduces `catalogue.json` byte for byte.

## Status vocabulary

The catalogue defines each status in `statusVocabulary`. Every approved item also carries two independent flags: `clientFactConfirmationRequired` and `culturalReviewRequired`.

| Status / flag | Meaning |
| --- | --- |
| `owner-approved-reusable-wording` | Owner-approved alternative, reusable across invitations. Every selection remains editable per invitation or may be omitted. |
| `client-editable-personal-information` | Names, relationships, surnames, dates, times, venues and addresses. Always client data, never a catalogue constant. The fictional sample values are demonstration only. |
| `clientFactConfirmationRequired: true` | The wording asserts something about the event or family, such as music, turmeric application, marigolds, yellow attire, blessings, parent/child relationships, a specific rite, or a gift preference. Use it only after the client confirms. |
| `culturalReviewRequired: true` / `cultural-review-required` | Sacred, Sanskrit, Hindi or Hindi/Urdu wording. It needs a culturally and linguistically fluent reviewer and, where relevant, the family or officiant. This applies even to Owner-approved titles. |
| `pending-owner-review` | Recorded, but not approved. |
| `rejected` | Decision history only. Never selectable. |
| `legacy-editorial-candidate` | An earlier draft that was never Owner-approved. |

## Final wording totals

| Collection | Approved | Needing client fact confirmation | Needing cultural review |
| --- | --- | --- | --- |
| Welcome romantic openings | 100 | 0 | 0 |
| Haldi titles | 12 | 2 (HT-03 blessings, HT-16 ritual focus) | 10 Hindi/Hindustani titles |
| Haldi introductions | 100 | 30 (music, yellow attire, marigolds/turmeric application) | 0 |
| Haldi welcome lines | 100 | 20 (blessings, yellow attire) | 0 |
| Haldi host structures | 10 | 10 (hosts, honouree and relationship) | 0 |
| Wedding titles (WT-01, WT-06, WT-10, WT-11 “Vivah Vidhi”) | 4 | 4 (ceremonial suitability) | 4 |
| Wedding parent invitation leads | 10 | 10 (confirmed bride's-parent hosts) | 0 |
| Wedding gift sentence | 1 | 1 (client chooses it) | 0 |
| Finale guest-presence lines | 10 | 0 | 0 |
| Finale fixed “Best Compliments From:” label | 1 | 0 (label); the family display line is client data | 0 |
| **Total** | **348** | **77** | **14** |

The catalogue also holds:

- **Pending Owner review (14):** the seven unapproved Sanskrit title candidates (WT-02, WT-03, WT-04, WT-05, WT-07, WT-08, WT-09), six elder-blessing cases and the “In loving memory of” line.
- **Rejected (10):** five Haldi titles (HT-02 The Haldi Celebration, HT-04 A Golden Beginning, HT-05 The Golden Haldi, HT-07 Haldi Utsav, HT-12 हल्दी उत्सव · Haldi Celebration) and all five joining-symbol studies. The joining mark between the names is undecided.
- **Legacy editorial candidates (175 strings):** unapproved drafts, covered in the last section.

## Fixed and exact decisions

- **Gift:** the only gift sentence is exactly `No gift boxes please`. It is optional, included only if the client chooses it, and no alternatives are offered. The older six-way gift menu has been removed.
- **Wedding titles:** only WT-01 `विवाहः`, WT-06 `विवाहकर्म`, WT-10 `विवाहयज्ञः` and WT-11 `Vivah Vidhi` (Devanagari `विवाह विधि`) are approved. WT-10 is highly ritual-specific. All four still need fluent Sanskrit/Hindi review and family or officiant confirmation of suitability. The older unapproved spellings and labels (“Vivaah Vidhi”, “Shubh Vivaah”, “Sacred Wedding Ceremony”) are no longer offered.
- **Finale sign-off:** the label `Best Compliments From:` is fixed and shown exactly as written. The next line is client data, `{brideFamilySurname} & {groomFamilySurname} Family` (fictional example `Rajan & Narayan Family`). Confirm the preferred display when a surname is shared, absent or insufficient. Legacy closings such as “With warm regards, the {families}” never replace this label.
- **Guest presence:** FP-01 `Your presence will be highly appreciated.` preserves the reference wording. FP-02 to FP-10 are approved variations. Select one.
- **Joining symbols:** all five studies are rejected and must not appear as selectable symbols.
- **Invocation:** `ॐ श्री गणेशाय नमः` / `Om Shri Ganeshaya Namah` is optional sacred text with status `cultural-review-required`. The Roman line is an accessible reading, not a second invocation.

## Content philosophy and boundary

Keep identity, sacred language, ceremony, hosts, schedule, guest instructions and actions independent. A client selects wording, edits every field, and omits whole optional lines. The four approved stops are Welcome 80, Haldi 160, Wedding 240 and Finale 300. The catalogue is not connected to the survey, routes, payments or authentication. Treat client copy as untrusted text: validate bounds, escape for the eventual output context, and allowlist action URLs in the future renderer. Never interpret catalogue values as HTML.

Each invitation, and each event within it, holds its own selections and overrides. Bride-side, groom-side and joint Haldi events can each have different hosts, honourees, venues and wording. Editing one never changes another. Stable wording IDs select defaults; they never lock the client to stock sentences.

## Reference-source reconciliation

| Source | Current treatment |
| --- | --- |
| “Destiny brought them together … seal their bond forever” | Superseded by the 100 approved romantic openings. |
| “A pinch of Haldi, dance and music” | Superseded by the 100 approved Haldi introductions. Music, turmeric application, marigolds and yellow attire lines are flagged for client confirmation. |
| “Rang De Haldi” | Approved as HT-06, a playful Hindi/Hinglish title. It needs fluent review and is not a Sanskrit invocation. |
| “Vivaah Vidhi” | Approved as WT-11, spelled `Vivah Vidhi`. Treat it as a modern invitation heading: Monier-Williams glosses *vivāhavidhi* as “law of marriage”. Confirm spelling and suitability locally. |
| “Haldi Utsav” | Rejected (HT-07). |
| “With the blessings of the grandparents” | The elder-blessing leads are pending Owner review. Names, relationships and living status are client facts. |
| “Late Mr. Harish & Mrs. Shanta Devi” | A separate optional “In loving memory of” line, only after the client confirms the death (pending Owner review). Never imply Shanta Devi is deceased or married to Harish. |
| “13:15 PM” | Use “1:15 PM”, or “13:15” in a fully 24-hour invitation. |
| “No gift box please” | Approved as exactly `No gift boxes please`, optional, with no alternatives. |
| “Your presence will be highly appreciated” | Approved as FP-01 and preserved verbatim. |
| “Best Compliments From” | Approved as the fixed label `Best Compliments From:`. |

The dates in the fictional sample are Saturday 22 August 2026 and Sunday 23 August 2026; the times are 6:30 PM and 1:15 PM. Never mix 13:15 with PM. Render dates with a locale-aware formatter only after verifying the calendar date and the event timezone (Mauritius, UTC+4). Preserve the client's chosen spelling and capitalization of names.

## Language and cultural notes

The sole sacred invocation is **ॐ श्री गणेशाय नमः**. Its plain Roman form is **Om Shri Ganeshaya Namah**, and its IAST form is **Oṃ Śrī Gaṇeśāya Namaḥ**. It means “Reverent salutations to Lord Ganesha.” It is a short Sanskrit salutation, not a composed verse. Use it as a legible standalone line only when the family enables it. Never repeat it as ornament, embed it in a button, or assume it suits every Hindu family. A fluent Sanskrit reader and the family or officiant must confirm its presentation and religious suitability.

Hindi and Hindustani titles are distinct from Sanskrit. Approved Haldi titles such as **हल्दी समारोह**, “Haldi Ki Rasam” or “Khushiyon Ki Haldi” carry `culturalReviewRequired`. Their Owner approval does not settle naturalness, idiom or local register. The Sanskrit wedding titles need review of spelling, inflection and pronunciation. Ritual-specific titles must match the ceremony actually performed. Roman transliteration is a convenience, not a claim that colloquial Hindi is Sanskrit.

Mauritian Hindu families vary by linguistic heritage, sampradaya, household, officiant, event order, invitation custom and views on sacred imagery. Confirm whether Haldi is hosted for one partner or both, whether turmeric application happens, whether yellow attire is requested, whether blessings are invoked, and which relatives are named, living, and related how. Sacred imagery and the invocation are independent preferences.

## Field matrix

The machine-readable `fields` map is the per-field matrix. Every entry carries:

- `required`, `maxRecommendedCharacters`, `mobileLines`, `longNameBehaviour`, `language` and `fallback`;
- `contentClass`: `client-editable-personal-information`, `client-preference`, `sacred-optional`, `owner-approved-reusable-wording`, `pending-owner-review` or `legacy-editorial-candidate`;
- `clientFactConfirmationRequired` and `culturalReviewStatus`;
- where one applies, the `collection` that supplies its wording.

`finale.familySignature` also records its `fixedLabel`.

| Group | Fields |
| --- | --- |
| Identity | invitationLanguage, brideName, groomName, brideFamilyName, groomFamilyName, brideParents, groomParents, brideGrandparents, groomGrandparents, rememberedRelatives, invitingFamilies, guestName, sacredImageryPreference, sacredInvocationPreference |
| Welcome | sacredInvocation, decorativeHeading, romanticOpening, formalWelcome, coupleNames, hostIntroduction, transitionLine |
| Haldi | ceremonyTitle, optionalHindiTitle, ceremonyDescription, hostWording, honouree, date, time, venue, address, attireGuidance, colourGuidance, guestInstruction, closingLine |
| Wedding | sacredHeading, ceremonyTitle, grandparentBlessingLine, rememberedRelativeLine, parentHostLine, formalInvitation, brideName, groomName, parentageLine, date, time, venue, address, dressGuidance, giftPreference, ceremonyInstruction |
| Finale | gratitudeLine, blessingRequest, attendanceSentiment, familySignature, quotation, directionsLabel, rsvpHeading, rsvpDeadline, responseLabel |

Required values are identity and minimum event identity. Every other line can be omitted as a complete unit. Never leave dangling conjunctions, commas or honorifics. A future renderer must independently validate the fully populated output; catalogue length guidance is not a security boundary.

### Length and layout guidance

Preserve full names, allow wrapping at words, and move optional lines into a secondary phase or an accessible detail view. Never shrink Devanagari into illegibility or truncate a name with an ellipsis. For bilingual copy, set each span's language for assistive technology (`lang="hi"`, `lang="sa"`, `lang="en"` in the eventual trusted renderer). Use a font tested for Devanagari conjuncts, and never transliterate a family name without the family's approval.

## Editorial rules

Use “and” in sentences. An ampersand may be used in a short paired-name display, such as the finale family line. Never attach “Mr.” or “Mrs.” to a combined ampersand phrase that obscures individual names.

Hosts and relationships follow confirmed client data. “Their daughter” and “their son” are used only for that person's confirmed parents. The approved wedding invitation leads are bride-side parent wording; other host arrangements need their own wording. “Son of” and “daughter of” are optional family choices, never inferred from surnames. “In loving memory of” is reserved for a confirmed deceased person and must never propagate automatically to a spouse or adjacent elder.

Keep RSVP optional. When it is disabled, omit the heading, deadline and action together. For accessibility, do not rely on yellow alone to express dress guidance, keep actual text selectable outside images, and follow the four chapters in screen-reader order. Do not bake any wording into frame artwork.

## Fictional four-stop stress layout

The sample is demonstration data and asserts no complete genealogy. Each line below is a separate editable field. Every selection shown is Owner-approved but still subject to its flags.

| Stop | Selected wording |
| --- | --- |
| 80 Welcome | Optional `ॐ श्री गणेशाय नमः` (cultural review); opening 039 “Two stories meet, and a new one begins.”; “Mihika Rajan and Tanish Narayan” (client data) |
| 160 Haldi | HT-01 “Haldi Ceremony”; HI-001 “Join us as the warmth of Haldi begins the wedding celebrations.”; HS-01 host line “Arvind and Meera Rajan” / “warmly invite you to the Haldi ceremony of their daughter” / “Mihika Rajan” (relationship confirmed); “Saturday, 22 August 2026 · 6:30 PM”; “Magnolia Hall”; HW-001 “We cannot wait to welcome you.” |
| 240 Wedding | WT-11 “Vivah Vidhi” (cultural and officiant review); “Arvind and Meera Rajan” / WI-01 “warmly invite you to the wedding of their daughter” / “Mihika Rajan”; joining mark pending design; “Tanish Narayan”; “Sunday · 23 · August · 2026 · 1:15 PM”; “Magnolia Hall”, “Greenview Gardens”, “Harmony Road, Vacoas”; optional “No gift boxes please” |
| 300 Finale | FP-01 “Your presence will be highly appreciated.”; “Best Compliments From:”; “Rajan & Narayan Family” (client data) |

Other prototype values: the groom's parents are Rajesh and Kavita Narayan; the grandparents are Mahendra and Kamini Rajan; Harish Rajan is remembered separately. Shanta Devi's relationship and status are unconfirmed, so she is omitted. The elder lines stay unpublished until they are Owner-approved and the client confirms the facts. Stress cases should also try long names, four hosts, multiple grandparents, remembrance, bilingual wrapping, long hall and street names, both RSVP states and both sacred states.

## Legacy editorial candidates

`legacyEditorialCandidates` keeps the ten earlier wording families (`formal-en`, `romantic-en`, `traditional-en`, `family-en`, `mobile-en`, `modern-hi-en`, `traditional-hi-en`, `sanskrit-en`, `neutral-en`, `international-en`). Each has four chapters in four lengths, for 160 strings. It also keeps 15 legacy `familyInvitation` and `closing` alternatives. All 175 strings are `legacy-editorial-candidate`. They were never Owner-approved and must not be presented as approved. The superseded legacy categories are removed rather than kept alongside the approved collections: romantic openings, Haldi titles (including the rejected “Haldi Utsav”), Haldi descriptions, wedding titles and gift preference. `supersededCategories` maps each one to its replacement. The legacy `modern-hi-en` finale heading remains corrected to **सादर धन्यवाद**. All legacy Devanagari still requires fluent review.
