# Ivory Palace — Haldi page content map

Status: Owner-approved wording alternatives. All 100 yellow introductions, 100 orange welcome lines, 12 selectable titles and the clarified host structures are approved for this content catalogue. Five original titles are rejected. Client-specific religious, linguistic and factual details still require review. Chapter stop: frame 160.

## Reference image and content boundaries

- Blue: Ganesha artwork is a separate design asset; the salutation `ॐ श्री गणेशाय नमः` and its readable Roman line `Om Shri Ganeshaya Namah` remain fixed text when the client enables the invocation. The Roman line is not a second invocation. Human cultural review remains required. Do not generate a new sacred verse or embed text in artwork. Artwork variants will be considered in a later visual task.
- Red: one selectable ceremony title; see `titles/TITLES.md`.
- Yellow: one short introductory sentence; see `introductions/INTRODUCTIONS.md`. Some variants mention music, turmeric application, marigolds or yellow; use those only if true of the actual event.
- Green: client data and host relationship. Collect hosts as people, honouree side and honouree name independently. Do not use a prejoined `Mr. X & Mrs. Y` token. See `host-structures/HOSTS.md`.
- Purple: client venue name and address segments. A venue may span separate lines. Do not assume one line is enough.
- Orange: one optional welcome or sign-off line; see `welcome-lines/WELCOME-LINES.md`. Any attire request is separately confirmed.

The source shows `Mr. Arvind & Mrs. Meera Rajan`, `Mihika`, Saturday 22 August 2026 at 6:30 PM, and Magnolia Hall, Greenview Gardens, Harmony Road, Vacoas. These are fictional demonstration details, never template constants. Use either 6:30 PM or 18:30, not mixed formats. There is no need for a literal `Venue:` prefix if the typographic structure already labels the location accessibly.

## Segmented page model

1. invocationPreference + invocation text + decorative Ganesha asset choice (if enabled);
2. `titleId`;
3. `introductionId`;
4. `hosts[]`, `hostRelation`, `honoureeSide` (`bride`, `groom`, `joint`, `couple`, `neutral`), `honoureeNames[]`, `hostSentenceId`;
5. `weekday`, `day`, `month`, `year`, `timeDisplay` as one semantic date/time group that may occupy multiple visual segments;
6. `venueName`, `addressLines[]` as one semantic place group;
7. `welcomeLineId` or omission; attire/colour preference recorded separately.

This list describes **one event instance**, not a single fixed invitation. An order may contain one or more invitations, and an invitation may have one or more distinct event instances where the product permits that structure. Each Haldi event has its own independently editable title, introduction, host people, inviting families, honouree(s), date/time, venue/address, welcome line and sacred preference. Bride-side and groom-side Haldi can be separate invitations with different guests and details; a joint Haldi can be another instance. Do not share or overwrite one event's hosts, details or choices when editing another. Stable wording IDs select defaults, never lock the client to stock sentences. Keep overrides as plain text attached to the specific invitation/event. The eventual interface and data schema are separate later work.

Use placeholders in braces as named data slots; client data remains plain untrusted text. If hosts, honouree relationship or invitation side is unknown, choose the neutral/couple structure, never invent a daughter or son. If sacred imagery is disabled, omit the invocation and Ganesha artwork together unless the client explicitly chooses otherwise. Text and graphics require independent approval. No wording is placed in the current HTML experiment in this phase.

## Sources and review

Hindi title glosses use the Hindwi dictionary entries for [utsav](https://www.hindwi.org/hindi-dictionary/meaning-of-utsav), [samaaroh](https://www.hindwi.org/hindi-dictionary/meaning-of-samaaroh), and [haldi](https://www.hindwi.org/hindi-dictionary/meaning-of-haldii). Compound title ideas are editorial creations, not quotations or claimed traditional ritual names. Have a fluent Hindi speaker and the family review every Hindi/Hinglish title and sacred placement before use.
