# HTML Invitation Studio — Architecture &amp; Visual Concepts

Status: **Draft for owner review — nothing implemented.** No templates, generator code, or assets exist yet.

Repository: `sarva-uttam/enveloped` · Branch: `generator/html-invitation-studio-v1` · Base: `d2c28e0` · Worktree: `/home/sarvauttam/projects/Enveloped-html-generator` (isolated from `/home/sarvauttam/projects/Enveloped`, which remains on its own branch, untouched).

---

## 1–2. Existing architecture — what's reusable, and why

### Composition is the trusted data core (keep entirely)

`invites.composition` (jsonb) is the single validated record of an invitation's content and visual choices. It is governed by a strict, versioned Zod schema (`src/lib/composition/schema.ts`): every free-text field is scrubbed by `safeText()`, every URL by `safeUrl()`/`safeAudioUrl()` (protocol allowlist), every visual/structural choice is a closed `z.enum()` drawn from trusted TypeScript registries — palette, motif, section type, cultural pack. `.strict()` rejects any unknown key outright. There is exactly one write path: `admin_save_invite_composition()`, a `SECURITY DEFINER` Postgres function, admin-gated via `is_admin()`, compare-and-swap on `composition_revision`, every write audit-logged. A database trigger (`reject_client_paid_update()`) blocks any other route from touching composition-related columns, including a client's own row.

Rendering today dispatches jsonb section-type strings through `SECTION_REGISTRY`, a static object literal mapping each type to a compile-time-imported React component — never a dynamic import, never `require()` on a database string. **This is the one architectural principle the HTML Studio must carry forward unchanged**: a stored string can only ever *select* from a set of things the app already trusts, never *become* code.

### Token-based access is reusable wholesale

Two systems already solve "let someone in without an account," and the Studio needs neither of them redesigned, only *served through*:

- **Preview** (`invite_previews`, `20260910120000_private_preview_links.sql`) — raw token is SHA-256-hashed before it ever reaches Postgres (`src/lib/preview-tokens.server.ts`); the table stores only `token_hash`, has RLS enabled with **zero policies for any role**, and is reachable exclusively via `get_invite_preview()`. Authorization is possession of the token alone (works pre-publish, by design). The preview route (`/preview/[token]`) never touches owner/admin session state and serves constant, generic metadata regardless of token validity — no information leaks even on an invalid token.
- **Guest links** (`invite_guest_links`, `20260914090000_guest_management.sql`) — identical hash-only pattern, but redemption (`get_guest_invite()`) *does* gate on `published_at`, unlike preview. RSVP submission goes through `submit_guest_rsvp()`, a narrow RPC writing directly onto `invite_guests`.

Both routes independently re-check their own authorization inside the RPC rather than trusting RLS alone — a discipline the codebase adopted after an earlier review found a raw `select("*")` had once leaked guest names pre-publication (`REVIEW_BRIEF.md`).

### Approval workflow is reusable wholesale

`review_rounds`/`review_feedback_items` (`20260913120000_client_review_workflow.sql`) already bind a review round to an exact `composition_revision`, with one active round per invite. This is exactly the sign-off loop a real-artwork HTML invitation needs before it goes live — it does not need to be reinvented, only pointed at a new artifact type (the rendered HTML) instead of only the composition JSON.

### Auth model (unchanged, load-bearing)

Three tiers — admin (`is_admin()`), owner (`auth.uid() = owner_id`, legacy self-service), guest/anonymous (token redemption only) — enforced almost entirely through narrow `SECURITY DEFINER` RPCs rather than generic row-level `UPDATE` policies, specifically so an admin who also happens to own a row can't bypass a function's guarantees via a raw `.update()`. Every RPC pins `search_path=''` against hijacking. None of this changes for the Studio; it's the floor everything else stands on.

---

## 3. Why the previous visual approach failed

Two separate but related failures, both instructive:

**Stage 12** (`archive/stage12-coded-generator-experiment`, inspected read-only, not reused) layered *more* enum-driven knobs — envelope treatment, typography pairing, section "style" — onto the *same* trusted-registry-composited-React-components approach already in mainline. The owner's verdict, verbatim from the commit message: *"the CSS-drawn envelopes and box-based invitation mockups do not meet the bar for a premium invitation product."* This was a **visual-fidelity failure, not a security failure** — the schema validation, the RPC boundaries, and the registry-dispatch security model were all sound. What failed is the belief that compositing enum-selected div/border/box-shadow primitives can ever read as art-directed rather than templated. A rectangle with rounded corners and a drop shadow standing in for an envelope always looks like a rectangle with rounded corners and a drop shadow.

**The homepage teaser** (`3f1b485`, the commit immediately preceding this worktree's base) independently rejected the same failure mode a second time, in a different surface: a CSS-drawn fake WhatsApp chat skin (fabricated app chrome, a green header bar "that never existed in any real product," emoji standing in for real content) and flat palette-color rectangles standing in for template previews were both replaced with a plain typographic reveal on a textured paper surface. The lesson generalizes past envelopes specifically: **any illustration built from CSS boxes, gradients, and emoji to *represent* something premium (an envelope, a chat app, a template swatch) reads as a mockup of the thing, not the thing.** Only real typography, real imagery, and real texture read as real.

The instruction for this track — *"real artwork, typography, textures, photography, SVG ornamentation and controlled motion, not crude CSS illustrations"* — is a direct, deliberate correction of both failures. It is not asking for a third iteration of the same coded-primitives approach with nicer enum values; it is asking for standalone documents built from designer-authored assets, with code doing layout, personalization, and motion — never drawing.

---

## 4. Proposed HTML Invitation Studio architecture

### Design principle

A template is a **document**, not a *component composited from tokens*. Composition data still selects and personalizes a template (which section content goes where, whose names, which photos), but the template's *visual identity* — its ornamentation, its typographic pairing, its background art, its motion choreography — is authored once, by a human designer, as real HTML/CSS/SVG/image assets, and shipped as a reviewed, trusted package. The renderer's job is narrow: validate data, select a template by closed enum, substitute content into named slots, and never draw anything itself.

### Trust boundary (unchanged principle, restated for this content type)

| Layer | Trust status | What it may contain |
|---|---|---|
| Composition jsonb (DB) | Trusted only after Zod validation | Structured content only — names, dates, copy fields, closed-enum choices, asset URLs (validated, allowlisted domain) |
| Template package (repo, code-reviewed) | Fully trusted, developer/designer-authored | Real HTML shell, CSS, self-hosted fonts, SVG ornamentation, motion timing — **never sourced from the database** |
| Generated document (derived artifact) | Trusted *because* both inputs above are trusted and the substitution step is escaping-only | The final standalone HTML page served to guests |

The database **never** stores HTML, CSS, or JS to be executed. It stores structured facts. The template package **never** reads from the database at build time beyond the closed enum id used to select it. This is the same shape as `SECTION_REGISTRY` today, just applied to whole documents instead of sections.

### What "premium, not CSS-drawn" means operationally

- Backgrounds, borders, seals, dividers, and monograms are **SVG artwork** (vector, designer-drawn or licensed-and-cleared, self-hosted) — not `border-radius` + `box-shadow` standing in for an object.
- Photography and textured paper/fabric surfaces are **real image assets** (photographed or licensed, optimized, self-hosted) — not CSS gradients simulating texture.
- Typography is a **deliberate pairing** of a small number of premium, self-hosted display/serif/sans faces per template, not a system-font stack with a Google Fonts `<link>`.
- Motion is **choreographed and restrained** — CSS transitions/animations timed against a design brief, not a generic fade-in-on-scroll applied uniformly to every block.
- No section is a resizable "card" that could be re-skinned into a different template by swapping a color variable. Each template's layout is bespoke to its identity (see §6 — this is why "no identical layouts with different colours" is a hard rule, not a style note).

### Generation pipeline (unchanged shape from prior composition work, restated here for this track)

1. Composition (validated, admin-authored) selects `template_id` (closed enum → compiled template package) and supplies section content + asset URLs.
2. Server-side substitution walks the template's declared named slots, HTML-escapes every text value, validates every URL against the allowlist, and maps only the theme parameters the template explicitly exposes (e.g. an accent color chosen from *that template's own* validated palette, not an arbitrary hex from the database).
3. An independent static-output validator parses the result and asserts: no `<script>`, no inline event handlers, no `javascript:`/`data:` URLs, every media/font reference resolves to an allowlisted origin.
4. The result is persisted as a derived, content-hashed artifact tied to `template_id` + `template_version` + `composition_revision` — never hand-edited, always regeneratable.
5. Guest/preview-specific values (name, RSVP link) are filled into a copy of that artifact **at serve time only**, never written back to storage — so raw tokens and personal data never live in the stored HTML.

This is identical in spirit to the architecture proposed in the prior `feature/html-invitation-generator-v1` session's document; this track's job is to make sure the *visual* side of that pipeline — the actual template packages — is held to the premium, real-asset bar the owner is asking for here, and to produce the first concrete visual briefs.

---

## 5. Integration contract — template ↔ Enveloped

Every template package must satisfy this contract before it can be registered. Nothing outside this contract is available to a template; nothing inside it may be supplied by anything other than validated composition data.

**A template package declares, at compile time:**

- `id`, `version`, `displayName`, `premiumTier` (which subscription tiers may select it).
- The **section slots** it supports and their order (subset of the existing `SECTION_TYPES` vocabulary — opening, greeting, story, schedule, venue, gallery, RSVP CTA, closing, etc.) — a template need not support every type; unsupported content from composition is simply not rendered by that template, never dropped-in as raw markup.
- The **theme parameters** it exposes and each one's validated value space (e.g. `accentColor: one of 4 template-specific swatches`, never an open hex field) — most visual identity is fixed per template, not parameterized; parameterization is deliberately narrow.
- The **asset slots** it exposes (hero photo, couple portrait, gallery images, venue map thumbnail) with constraints (aspect ratio, minimum resolution, max file size) — actual files are admin-uploaded to Supabase Storage, validated, and referenced by URL in composition; the template never embeds a database-sourced URL it hasn't declared a slot for.
- Its **personalization slots** (guest name, RSVP link, guest-specific teaser line) as named markers resolved only at serve time — never present in the stored generated document with real values.
- A **document contract compliance statement**, enforced automatically by the output validator: zero `<script>`, zero inline handlers, zero off-allowlist network references, self-hosted fonts only, no embedded RSVP form (RSVP is always a CTA linking to the existing `/guest/[token]` flow — that flow's `submit_guest_rsvp()` RPC and validation are unchanged).

**A template package must NOT:**

- Read anything from the database directly, or accept raw HTML/CSS from any composition field.
- Reference third-party fonts, analytics, embeds, or any network origin outside the project's own asset domain.
- Contain any wording that isn't explicitly supplied as data or written by the template's own static UI chrome (button labels, etc.) — no invented ritual/sacred text is ever templated in as a default (see §6 rules).
- Bake real text into rasterized artwork — any text a guest reads must be real, selectable/accessible HTML text laid over artwork, never text-shaped pixels in an image.

**Enveloped provides to every template, and only this:**

- Validated, escaped section content matching the slots the template declared support for.
- Validated asset URLs for the slots the template declared.
- The theme parameter values the admin chose, restricted to that template's own declared value space.
- Serve-time personalization values (guest name, RSVP link), injected outside the stored artifact.

This mirrors, at the document level, exactly the boundary `SECTION_REGISTRY` already enforces at the component level today — a template is selected, never synthesized, and it only ever receives pre-validated facts, never markup.

---

## 6. Visual briefs — three concepts

All three are full invitation *experiences*, not skinned variants of one layout. Each has its own structural rhythm, its own opening mechanic, and its own artwork requirements — satisfying the "no identical layouts with different colours" rule by construction, not by promise. Assets described below are **not generated in this session** — these are creative briefs for what must be commissioned/produced before implementation.

### 6.1 Timeless Editorial Wedding

**Visual identity.** A wedding invitation that reads like a page torn from a fine printed stationery suite — restrained, letterpress-adjacent, built on negative space and a single confident serif. The feeling is *quiet luxury*: no gold-foil excess, no dense ornament. Think a hand-set invitation card photographed on cotton paper, not a website.

**Layout.** Single-column, generous vertical rhythm, wide margins that shrink deliberately (not uniformly) as the page moves from opening to logistics. Section breaks are marked by a single hairline rule and a centered ornament mark (a small custom-drawn monogram or botanical sprig SVG), never a full-width color block.

**Typography.** One high-contrast serif display face for names and headline moments (large, italic for emphasis words), paired with one humanist sans at small size for body/logistics. No third face. Letterspacing is the primary rhythm device on eyebrow labels (uppercase, wide tracking) rather than color.

**Palette.** Ink-on-ecru: a warm off-white/cotton paper ground, near-black ink for type, a single muted accent (dusty rose or sage, chosen per couple within a narrow validated range) used only on the ornament mark and one divider — never as a background fill.

**Original artwork required.** A custom monogram/sprig SVG mark (2–3 variants), a subtle paper-grain texture image (photographed, not a CSS noise filter), one full-bleed editorial photograph slot (couple portrait, art-directed, admin-uploaded) with a fixed crop/treatment (duotone-adjacent, not a raw snapshot look).

**Opening experience.** No envelope skeuomorph. The page loads with the paper texture and a single centered line ("The wedding of—") that resolves, via a slow cross-fade/rise (600–800ms, no bounce), into the couple's names in the display face. This is a *typographic reveal*, not a click-to-unseal animation.

**Section flow.** Opening line → names + date → a short editorial intro line (one sentence, admin-authored) → the couple's portrait (full-bleed) → schedule (set as a simple vertical list, not a card grid) → venue + map link → dress code (if present) → gallery (a restrained 2–3 image strip, not a masonry grid) → RSVP CTA (a single understated button, not a form) → closing line.

**Motion.** Restrained scroll-triggered opacity/translate-Y on section entry only (no parallax, no continuous ambient motion), one deliberate cross-fade at open. Every animation respects `prefers-reduced-motion` by collapsing to an instant, fully-visible state.

**Desktop composition.** Centered column capped at ~680px, framed by asymmetric negative space left/right; the portrait section breaks to a wider, near-full-bleed treatment as the one deliberate width change in the page.

**Mobile composition.** Same column logic at full width with tighter but still generous margins; the portrait section keeps its full-bleed treatment (this is the one place mobile and desktop are visually closest, since a full-bleed photo works at any width).

**Cultural/accessibility considerations.** Culturally neutral by design (no ritual-specific content) — this template is the "safe default" for weddings without a specific cultural program. Text contrast on the ecru ground is checked against WCAG AA at the chosen ink color; all interactive elements (RSVP CTA, map link) are real focusable anchors, not divs; motion fully degrades under reduced-motion.

### 6.2 Majestic Hindu Wedding

**Visual identity.** Rich, ceremonial, and specific — drawing on real Indian wedding stationery conventions (layered borders, floral/paisley motifs, warm jewel tones) without becoming a costume-party cliché or a stock-clipart pastiche. The bar is: a guest's grandmother should recognize the visual language as genuinely respectful and specific, not a generic "ethnic" reskin of the editorial template.

**Layout.** A bordered, layered composition — an outer ornamental frame (SVG, hand-drawn/vector, not a repeating clip-art tile) containing distinct nested panels per section, echoing real multi-panel Indian invitation card structures. More visually dense than the Editorial concept by design, but still with clear reading order, not a collage.

**Typography.** A display face with genuine calligraphic warmth for names (a face with real Devanagari-adjacent character if the couple's language content requires it — to be sourced, not faked with a Latin script styled to "look Indian"), paired with a clean sans for logistics. If any regional-language text is supplied by the client (composition data), it renders in a properly licensed font for that script — never transliterated into a Latin font styled to approximate it.

**Palette.** Deep jewel-tone ground (options within a validated set: maroon, deep teal, or ivory-and-gold) with genuine metallic-gold accents used sparingly and specifically (border linework, a central motif) — gold as line and ornament, not as a background wash.

**Original artwork required.** A full ornamental border/frame system (SVG, several coordinated pieces: corner motifs, edge repeats, a central crest), a paisley/floral motif set distinct from the border, a genuinely licensed regional-script font if needed, real photography for any couple-photo slots. All motifs must be commissioned or properly licensed original work — explicitly not copied from existing invitation platforms or stock "ethnic pattern" packs, per the "no copied Greenvelope code or artwork" rule.

**Opening experience.** A slow reveal of the outer frame first (the border SVG draws/fades in), then the central panel content resolves inside it — evoking the moment of unfolding a physical card, achieved through layered opacity/scale on real vector artwork, never a CSS-drawn "envelope flap."

**Section flow.** Framed opening (deity/auspicious-symbol motif if the client's tradition calls for it — see cultural note below — otherwise a floral crest) → couple names + family names (a real convention in Hindu wedding cards — both families named, structured as its own panel) → ceremony sequence (a template only supports listing ceremonies the client actually supplies — haldi/sangeet/wedding/reception as separate cards within the frame, not assumed) → venue(s) panel (multiple venues are common; layout must support 1–4 without breaking) → RSVP CTA panel → closing blessing line (client-authored only — see rules).

**Motion.** Border-draw-in on open, gentle panel-by-panel reveal on scroll (each panel settles into place, no bounce/spring exaggeration), a restrained shimmer-on-gold-linework micro-interaction on the central crest (CSS-only, subtle, not glittery).

**Desktop composition.** Wide framed canvas (the border system needs room to read as a frame, not a squeezed strip); ceremony-sequence panels lay out as a horizontal sequence if 2+ ceremonies are present.

**Mobile composition.** The border system must be redesigned as a genuinely mobile-native treatment (a top-and-bottom ornament band plus side hairlines, not a shrunk desktop frame that loses detail) — ceremony panels stack vertically. This template has the highest mobile-adaptation risk of the three and needs its own mobile-specific artwork pass, not a responsive scale-down of the desktop frame.

**Cultural/accessibility considerations.** This is the highest-stakes template for cultural specificity and must not ship without review by someone with direct cultural fluency (the owner or a designer they designate) before any real client uses it. **No sacred/ritual wording is ever invented by the template** — any mantra, blessing, or ceremony-specific text is either supplied verbatim by the client through composition data or omitted entirely; the template provides layout and ornament, never scripture or invented "traditional-sounding" copy. Script fonts must be genuinely licensed for the language rendered. Motif choices (which deity/symbol, if any) must be admin-selectable per client, not hardcoded to one tradition, since "Hindu wedding" spans significant regional and denominational variation.

### 6.3 Royal Evening Celebration

**Visual identity.** Dark, formal, event-invitation energy — closer to a black-tie gala or milestone celebration than a wedding stationery suite. Deep ink/charcoal ground, precise linework, a sense of occasion built through typographic scale and restraint rather than density. This concept is intentionally the most different from the other two structurally, to prove the system isn't producing "one layout, three palettes."

**Layout.** Asymmetric, poster-like composition — large-scale type as the primary visual anchor (a name or event title set very large, off-center), with logistics set in a compact, precisely-aligned block elsewhere on the page rather than a stacked vertical list. More editorial-poster than card.

**Typography.** A high-contrast display serif or modern didone at dramatic scale for the headline moment, paired with a monospaced or wide-tracked sans for logistics (time, date, dress code) — the mono/technical pairing is what gives this concept its "formal program" feel, distinct from both other templates' warmer serif/sans pairings.

**Palette.** Near-black charcoal ground, warm metallic-gold or champagne linework and type accents, a single deep accent (burgundy or midnight blue) reserved for one graphic element only (a rule, a small crest). High contrast throughout for a formal, engraved-invitation feel.

**Original artwork required.** A precisely-drawn line-art crest or monogram (thin, engraved-linework style — genuinely fine linework, not a bold clipart badge), a subtle dark textured ground (brushed-metal or deep-fabric texture, photographed/rendered, not a CSS gradient), one full-bleed dramatic photo slot (venue or portrait, treated dark/high-contrast to match the palette).

**Opening experience.** The page opens on the textured dark ground alone; the headline name/event title animates in at large scale via a precise, slow type-scale-and-tracking resolve (letters settle from slightly expanded tracking to final tracking, evoking an engraved plate coming into focus) — no envelope or card metaphor at all for this concept; it opens like a formal program cover.

**Section flow.** Full-bleed dark opening with large-scale title → date/time set as a precise typographic block (not a card) → venue (name + address as fine print, map link as a discreet text link, not a button) → dress code (given real prominence — this concept is the one where dress code is a first-class section, set with the same typographic care as the date) → RSVP CTA (styled as an engraved-button treatment, still a real anchor) → closing line, set small, bottom-aligned like a program's closing credit line.

**Motion.** The most minimal motion of the three — one slow type-resolve on open, otherwise near-static (a formal program doesn't bounce). Any scroll-triggered motion is a simple, slow opacity settle, nothing kinetic.

**Desktop composition.** True poster asymmetry — large type genuinely off-center, generous dark negative space doing real compositional work, logistics block positioned deliberately (e.g., lower-right) rather than centered.

**Mobile composition.** The asymmetric poster logic must simplify to a centered, top-aligned title treatment at mobile widths (off-center poster composition doesn't survive narrow viewports without becoming cramped) — this is a deliberate, planned divergence between desktop and mobile layout logic, not a naive reflow, and needs its own mobile composition pass in the design phase.

**Cultural/accessibility considerations.** Culturally neutral, suited to milestone/anniversary/formal-event use beyond weddings specifically. The dark ground requires careful contrast validation (gold-on-charcoal must clear WCAG AA for body text sizes, which constrains how dark the gold can go); large display type must not be the only carrier of critical information (date/time/venue) — those always also exist in the smaller, high-contrast logistics block for screen-reader and low-vision legibility.

---

## Compliance with this session's rules

- No CSS-box envelopes in any brief — each opening mechanic is either a typographic reveal, a vector-frame reveal, or a scale/tracking resolve; none simulate a physical envelope with divs and box-shadows.
- No generic card grids — each template's section flow is bespoke (vertical editorial list, nested ornamental panels, asymmetric poster blocks), not a repeated card component reflowed with different content.
- No identical layouts with different colours — the three briefs differ in column logic, section structure, opening mechanic, and motion philosophy, not just palette.
- No invented sacred wording — the Majestic Hindu Wedding brief explicitly requires all ritual/blessing text to come from client-supplied composition data or be omitted; the template supplies layout and ornament only.
- No text baked into generated artwork — every brief specifies that guest-readable text is real HTML text over artwork, never rasterized into an image.
- No copied Greenvelope (or any other platform's) code or artwork — all ornamental assets described are to be commissioned/licensed originals; none were sourced or referenced from any competitor product during this session.
- No assets generated and no templates implemented this session — this document is a brief for future design/build phases only.
- No production, commit, or merge activity — see status below.

---

## Branch and workspace status

```
Main workspace:      /home/sarvauttam/projects/Enveloped              (untouched this session)
New worktree:        /home/sarvauttam/projects/Enveloped-html-generator
Branch:               generator/html-invitation-studio-v1
Base:                 d2c28e0 (Stage 11 — confirmed via diff to differ from 3f1b485
                       only in homepage/site components; no composition, renderer,
                       database, auth, RSVP, or admin code differs between the two)
Commits made:          none
Pushes made:           none
Merges made:           none
Production changes:    none
```

Stopping here for owner review, as instructed. No architecture code, templates, or assets have been implemented.
