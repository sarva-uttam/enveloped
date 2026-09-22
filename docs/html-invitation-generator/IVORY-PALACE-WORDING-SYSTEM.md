# Ivory Palace — Signature Edition: modular wording system

**Status:** editorial candidate for Owner and culturally fluent human review. No copy is approved for guests. The catalogue is isolated at `experiments/ivory-palace-frame-journey/wording/catalogue.json`. It is data, not a renderer or production template. Run `node --test experiments/ivory-palace-frame-journey/wording/validate.test.cjs` for focused checks. `build_catalogue.py` is the editable editorial source that reproduces the JSON.

## Content philosophy and boundary

Keep identity, sacred language, ceremony, hosts, schedule, guest instructions and actions independent. A client selects a tone, edits every field, and omits whole optional lines. The four approved stops are Welcome 80, Haldi 160, Wedding 240 and Finale 300. No content is placed in frames or displayed by the current HTML experiment. The catalogue is not connected to the survey, routes, payments or authentication. Treat client copy as untrusted text: validate bounds, escape for the eventual output context, and allowlist action URLs in the future renderer. Never interpret catalogue values as HTML.

## Source analysis and corrections

| Source | Candidate treatment | Meaning to confirm |
| --- | --- | --- |
| “Destiny brought them together … seal their bond forever” | Romantic option: “Destiny brought them together; love invites us to celebrate what comes next.” | Retain the stronger original metaphor only if the couple likes it. |
| “A pinch of Haldi, dance and music” | “Join our families for Haldi, turmeric, music and heartfelt blessings.” | Confirm whether music is actually planned. |
| “Rang De Haldi” | Playful Hindi/Hinglish title, optionally paired with “Haldi Ceremony.” | Not a Sanskrit invocation or a formal ritual label. |
| “Vivaah Vidhi” | Ritual-specific title only when the family means the wedding rites; otherwise “Wedding Ceremony.” | *Vivāha* means marriage; *vidhi* means procedure or prescribed rite. This title can imply the ritual proceedings rather than the whole celebration. |
| “With the blessings of the grandparents” | Name the confirmed elders as a separate blessing line, then introduce hosts. | Which side each elder belongs to and whether Shanta Devi is living must be confirmed. |
| “Late Mr. Harish & Mrs. Shanta Devi” | “Remembering Harish Rajan with love” on its own line; list Shanta Devi separately only after her relationship is confirmed. | Never imply Shanta Devi is deceased or married to Harish without confirmation. |
| “13:15 PM” | “1:15 PM” (or “13:15” in a fully 24-hour invitation). | Use one format consistently. |
| “No gift box please” | Select separately: no gifts, no boxed gifts, blessings only, charitable giving, gifts optional, or silence. | Ambiguous original cannot determine preference. |
| “Your presence will be highly appreciated” | “We would be honoured by your presence.” | Warmer, still formal. |
| “Best Compliments From” | “With warm regards, the Rajan and Narayan families.” | “Best compliments” is locally familiar but may sound unusual internationally. |

The dates in the fictional sample are Saturday 22 August 2026 and Sunday 23 August 2026; times are 6:30 PM and 1:15 PM. Never mix 13:15 with PM. Render dates with a locale-aware formatter only after verifying the calendar date and the event timezone (Mauritius, UTC+4). Preserve the client’s chosen spelling and capitalization of names.

## Language and cultural notes

The sole sacred invocation candidate is **ॐ श्री गणेशाय नमः**. Its consistent plain Roman form is **Om Shri Ganeshaya Namah**, and an academic IAST representation is **Oṃ Śrī Gaṇeśāya Namaḥ**. Its plain meaning is “Reverent salutations to Lord Ganesha.” This is a short Sanskrit salutation, not a composed verse. It can appear as a legible standalone opening before welcome or wedding material if the family wants it. It should not be repeated as ornament, embedded in a button, or assumed appropriate for every Hindu family. Spelling and grammatical sense have been editorially checked; a fluent Sanskrit reader and the family or officiant must confirm exact presentation and religious suitability before release.

Hindi labels are distinct from that Sanskrit invocation. **हल्दी समारोह** means “Haldi ceremony” in ordinary Hindi; **शुभ विवाह** means “auspicious wedding”; **सप्रेम निमंत्रण** is a warm invitation heading; **सादर धन्यवाद** is a respectful expression of thanks. The Roman titles “Haldi Utsav” (celebration/festival of Haldi) and “Rang De Haldi” (a playful colour-themed phrase) have different registers. **Vivaah Vidhi** is a ritual-focused Sanskrit-derived Hindi expression. These editorial labels and all Devanagari copy require fluent Hindi review for naturalness, community register and punctuation. No English poem has been translated word for word into Hindi. Roman transliteration of labels is a convenience, not an assertion that colloquial Hindi is Sanskrit.

Mauritian Hindu families vary by linguistic heritage, sampradaya, household, officiant, event order, invitation custom and views on sacred imagery. Confirm whether Haldi is hosted for one partner or both, whether its turmeric application is part of the event, whether yellow attire is requested, whether blessings are invoked, and which relatives are named. Do not claim all guests participate in rites. Ask which family members are living and their exact relationships before pairing names, honorifics or “late.” Sacred imagery off and invocation off are independent preferences; a neutral line must remain available even if the visual world contains mandap imagery. Human cultural review remains required for every client-specific religious claim.

## Field matrix

The machine-readable `fields` map is the authoritative per-field matrix. Every entry carries `required`, `maxRecommendedCharacters`, `mobileLines`, `longNameBehaviour`, `language`, `culturalReviewStatus` and `fallback`. The complete keys are:

| Group | Fields |
| --- | --- |
| Identity | invitationLanguage, brideName, groomName, brideFamilyName, groomFamilyName, brideParents, groomParents, brideGrandparents, groomGrandparents, rememberedRelatives, invitingFamilies, guestName, sacredImageryPreference, sacredInvocationPreference |
| Welcome | sacredInvocation, decorativeHeading, romanticOpening, formalWelcome, coupleNames, hostIntroduction, transitionLine |
| Haldi | ceremonyTitle, optionalHindiTitle, ceremonyDescription, hostWording, honouree, date, time, venue, address, attireGuidance, colourGuidance, guestInstruction, closingLine |
| Wedding | sacredHeading, ceremonyTitle, grandparentBlessingLine, rememberedRelativeLine, parentHostLine, formalInvitation, brideName, groomName, parentageLine, date, time, venue, address, dressGuidance, giftPreference, ceremonyInstruction |
| Finale | gratitudeLine, blessingRequest, attendanceSentiment, familySignature, quotation, directionsLabel, rsvpHeading, rsvpDeadline, responseLabel |

Required values are identity and minimum event identity; all other lines can be omitted as complete units. Never leave dangling conjunctions, commas or honorifics. A future renderer must independently validate full populated output; catalogue length guidance is not a security boundary.

## Wording-family matrix

| Family ID | Voice | Language | Review |
| --- | --- | --- | --- |
| `formal-en` | Cordial invitation and respectful close | English | Editorial |
| `romantic-en` | New story and shared affection | English | Editorial |
| `traditional-en` | Elders and ceremonial blessing | English | Family review |
| `family-en` | Families as hosts | English | Editorial |
| `mobile-en` | Short direct invitation | English | Editorial |
| `modern-hi-en` | Contemporary bilingual headings | Hindi and English | Fluent review |
| `traditional-hi-en` | Respectful bilingual invitation | Hindi and English | Fluent review |
| `sanskrit-en` | Sanskrit salutation with English | Sanskrit and English | Fluent and family review |
| `neutral-en` | Secular phrasing with imagery disabled | English | Editorial |
| `international-en` | Explains Haldi to unfamiliar guests | English | Editorial |

Each family contains four independently editable chapters in four lengths: `micro`, `conciseMobile`, `standard`, `formalExtended`. These are 160 candidate strings. The catalogue also contains 45 labelled alternatives across romantic openings, Haldi titles and descriptions, wedding titles, host structures, gift meanings and closings. These are candidate alternatives rather than approved final wording; tone and cultural register are recorded with each label. Select one coherent family as a starting point and replace individual lines only after checking the resulting voice.

### Length and layout guidance

Micro aims for 48 characters and two mobile lines; concise mobile 100 and three; standard 180 and five; formal extended 300 and seven. These are per wording item, before personalisation. Actual names can exceed them. At each stop, prefer a title, names and one brief message; show schedule and address as separate live fields. Preserve full names, allow wrapping at words, and shift optional lines into a secondary phase or accessible detail view. Never shrink Devanagari into illegibility or truncate a name with an ellipsis. For bilingual copy use one short Devanagari heading followed by a separate English explanation; set each span’s language for assistive technology (`lang="hi"`, `lang="sa"`, `lang="en"` in the eventual trusted renderer). Use a font tested for Devanagari conjuncts, and never transliterate a family name without their approval.

## Editorial rules

Use “and” in sentences. An ampersand may be used in a short paired-name display if the couple approves; never attach “Mr.” or “Mrs.” to a combined ampersand phrase that obscures individual names. Parents are hosts only if confirmed. “Son of” and “daughter of” are optional family choices, never mandatory or inferred from surnames. Offer both-family, couple-led and gender-neutral hosts. Grandparents can be named in an independent blessing line; list sides and relationships only after confirmation. “In loving memory of” is reserved for a confirmed deceased person and must never automatically propagate to a spouse or adjacent elder. Do not infer whether remembrance implies religious blessing.

Gift options have distinct semantics. “No gifts” excludes all gifts; “no boxed gifts” excludes only boxed items and may imply other gifts are welcome; “blessings only” pairs affection with no gifts; charitable donations require a real recipient and a confirmed preference; “gifts optional” permits gifts; omission says nothing. Do not infer one from the source’s “No gift box please.” Keep RSVP optional; when disabled, omit heading, deadline and action together. Directions and RSVP labels are interface text only and never carry an invocation. Use descriptive action labels such as “Get directions” and “Respond by 15 August” once the actual destination and deadline exist.

For accessibility, do not rely on yellow alone to express dress guidance, read dates in an unambiguous form, keep actual text selectable outside images, and supply screen-reader order that follows the four chapters. Actions need their own accessible names and valid URLs; no guest-specific URL belongs in the shared catalogue. Do not bake any wording into frame artwork.

## Fictional four-stop stress layout

The sample is demonstration data; it asserts no complete genealogy. Lines below are separate editable fields, not one paragraph.

| Stop | Visible phase | Candidate wording |
| --- | --- | --- |
| 80 Welcome | Optional sacred line, opening, names | “ॐ श्री गणेशाय नमः” (only if selected); “Two paths meet, and a new story begins.”; “Mihika Rajan and Tanish Narayan”; “Our families warmly welcome you.” |
| 160 Haldi | Title, short meaning, schedule | “Haldi Ceremony”; “Join us for turmeric, blessings and music.”; “Saturday, 22 August 2026 · 6:30 PM”; “Magnolia Hall”; optional “Wear a touch of yellow if you wish.” |
| 240 Wedding, phase 1 | Invitation and names | “Wedding Ceremony”; “The Rajan and Narayan families invite you to celebrate the wedding of”; “Mihika Rajan and Tanish Narayan.” |
| 240 Wedding, phase 2 | Schedule | “Sunday, 23 August 2026 · 1:15 PM”; “Magnolia Hall”; “Greenview Gardens, Harmony Road, Vacoas.” |
| 300 Finale | Thanks, families, actions | “Thank you for celebrating with us.”; “The Rajan and Narayan families”; “Get directions”; optional “RSVP” and its deadline; gift guidance only after meaning is confirmed. |

Prototype values: bride’s parents Arvind and Meera Rajan; groom’s parents Rajesh and Kavita Narayan; grandparents Mahendra and Kamini Rajan; Harish Rajan remembered separately; Shanta Devi is an additional elder with an unconfirmed relationship. Do not publish those lines until confirmed. No gift preference is selected; RSVP is disabled in the sample. Stress cases should also try long first and surnames, four hosts, multiple grandparents, remembrance, bilingual wrapping, long hall and street names, both RSVP states and both sacred states. The focused test exercises structural combinations but cannot replace visual mobile review or fluent language review.
