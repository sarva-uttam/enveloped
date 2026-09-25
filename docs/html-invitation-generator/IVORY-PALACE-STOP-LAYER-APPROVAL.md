# Ivory Palace — Stop-Layer Approval Record

**Status: Owner-approved baseline. Locked.**

The Owner reviewed and approved the complete stop-frame presentation
layer of the Ivory Palace frame-journey experiment at commit
`66236606542bd7701fb54f3fe0558fd623a2fbc2` on branch
`experiment/ivory-palace-frame-journey`. That state is the approved
baseline. Any change to the items below is a new design decision: it
needs the Owner's approval and an update to this record and to
`experiments/ivory-palace-frame-journey/baseline.test.cjs` together.

Scope: `experiments/ivory-palace-frame-journey/` only. This approval
does not cover wording integration, production routes, the survey or
any other template. No live wording is displayed yet. The technical
method is in
[`IVORY-PALACE-FRAME-JOURNEY-METHOD.md`](IVORY-PALACE-FRAME-JOURNEY-METHOD.md)
(§11 for the stop layer).

**Third layer, Owner-approved:** six ceremonial foregrounds from
`ivory-palace-final-third-layer.zip`, one left/right pair per stop at
80, 160 and 240, in `assets/ornaments/` (mapped by the package
manifest).

- **Size:** visible height is 42/43/42% of the invitation (the Owner's
  correction of the manifest's 32–34%), with a 66% inward-reach cap.
  Each rises from its bottom outer corner to about 57–60% on 9:16
  screens, matching the approved composites, and may pass behind the
  down control.
- **Motion:** each pair enters after the panel settles (a 1.4s glide
  from each side) and leaves before the panel (0.9s).
- **Layering:** the controls stay above the ornaments.

See METHOD §12. The third layer is locked by `baseline.test.cjs`
alongside the items below. All earlier ornament sets are superseded
and remain only in Git history.

**Layer 3 baseline recorded:** commit
`3892648600f5b63a11a00d67cffacd7a24a2d9c8` is the authoritative
Owner-approved Layer 3 state. The workflow is codified in
[`LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md`](LAYER-3-CEREMONIAL-FOREGROUND-METHOD.md),
with the asset catalogue, prompts, decision log and machine-readable
config under [`ivory-palace/`](ivory-palace/). The regression checks
are listed in
[`LAYER-3-AUTOMATION-CONTRACT.md`](LAYER-3-AUTOMATION-CONTRACT.md).

**Background, updated:** the 300 frames were replaced in place with a
re-export from the same source video (same names, format and size), and
the palace canvas now carries a restrained CSS grade: `sepia(0.06)
saturate(1.1) contrast(1.04)`, canvas only. See METHOD §13. The approved
layers, placements, timings and finale are unchanged, and the new frame
hash and grade are locked by `baseline.test.cjs`.

**Interface controls and event countdowns, Owner-approved (2026-09-25):**
the Music, Gallery and Share utilities; the middle-right navigation; the
Haldi and Wedding countdown strips with Location and Calendar; and the
reusable control architecture. These were approved as implemented. See
[`INVITATION-INTERFACE-CONTROLS.md`](INVITATION-INTERFACE-CONTROLS.md)
for the approval record, test results, the accepted small-screen finial
overlap and the outstanding production configuration.

The same checkpoint superseded two earlier approvals:

- the 85% translucent panel, now fully opaque textured paper;
- the centred navigation buttons, now the right-side rail.

`baseline.test.cjs` locks both new states.

## Approved configuration

| Item | Approved value | Where it lives |
|---|---|---|
| Stop frames | 80 (Welcome), 160 (Haldi), 240 (Wedding), 300 (Finale) | `script.js` `CHAPTERS` |
| Framed panel stops | 80, 160 and 240 | `script.js` `enterSurface` |
| Frame artwork | Indian ivory-and-gold arch frame: cusped arch, jaali corner spandrels, lotus geometry | `assets/ivory-palace-arch-frame.png` (941 × 1672 RGBA) |
| Inner panel | Warm ivory `rgba(253, 249, 241, 0.85)`, 85% opacity, masked to the frame's own opening | `styles.css` `.stop-panel__fill`, `assets/ivory-palace-arch-frame-opening.png` |
| Size | ~90%, responsive: the framed panel keeps the artwork's ratio and is as large as fits within 90% × 90% of the invitation area (`min(90cqw, 90cqh × 941/1672)`), centred | `styles.css` `.stop-panel` |
| Panel fade-in | 1.4s, `cubic-bezier(0.22, 0.61, 0.36, 1)` ease-out, after landing exactly on the stop | `--panel-enter-ms`, `--ease-settle` |
| Panel fade-out | 1.0s, `cubic-bezier(0.42, 0, 1, 1)` ease-in; background moves only after it completes | `--panel-exit-ms`, `--ease-dissolve` |
| Background journey | Real-time `frames / 30fps` pace with `gentleEase`: about 3.5s per 80-frame segment (about 2.7s for the 60-frame finale leg). The opening (1→80) plays at linear video pace. | `script.js` `realTimeDuration`, `gentleEase` |
| Playback ceiling | 30 fps. Every frame is shown exactly once, with no skips. | `FLOOR_GAP_MS = 1000 / 30` |
| Input | Locked (wheel, touch, keyboard, buttons) during fades and journeys. Controls reappear once a panel has settled. | `isAnimating`, `arriveAtStop` |
| Landings | Exact destination frame, forward and reverse | frame-stepping engine |
| Finale | Frame 300: full-box warm-white light (1.2s in, 0.8s out). There is no framed panel at 300. | `styles.css` `.finale-light` |
| Cache | Sliding decoded-frame window, 36-frame cap; **116 MB verified peak** (33 frames) | `script.js` cache constants |
| Wording | None displayed. `#stopContent` is empty, hidden and inert. | `index.html` |
| Reduced motion | Same states, with 220 / 180 / 260 / 180ms crossfades | `styles.css` media query |

A note on "90%": the percentage is of the invitation area. On desktop,
tablet and 9:16 phones, the framed panel is 90% × 90%. On taller phones
(e.g. 390×844), keeping the artwork's ratio makes it 90% wide and about
72–74% tall. This is the approved responsive behaviour. The artwork is
never stretched.

Verified at approval (`verify.js`):

- panel fades measured at about 1.32s to full opacity;
- movement starts about 1.08s after a departure;
- 80-frame journeys take about 3.5s;
- minimum frame gap about 33ms (30 fps);
- zero skipped frames and exact landings both ways;
- 0 flash frames;
- 116 MB cache peak.

## Development path

The table separates rejected experiments from the approved
implementation. All commits remain in Git history.

| # | Step | Outcome | Commit |
|---|---|---|---|
| 1 | Unrestricted mist layer with smoky, irregular edges | **Rejected.** The edges looked rough and inconsistent. | `530dc18` |
| 2 | Smooth oval mist | **Rejected.** It resembled a bright portal and reduced usable wording space. | `f2b5dff` |
| 3 | Decorative frame approach | **Selected.** It preserves the palace while creating a clear wording area. | — |
| 4 | First ornate floral (lotus-vine) frame | **Rejected.** Visually heavy, and it collided with the navigation controls. | `6954105` |
| 5 | Lighter Indian architectural outline: cusped arch, jaali details, lotus geometry | **Selected.** | `eecb207` |
| 6 | Frame artwork separated from the warm-white HTML/CSS panel | **Approved.** Opacity and transitions stay controllable in code. | `6954105`, `eecb207` |
| 7 | Slower panel fades (1.4s in / 1.0s out) with input locked through the fade-in | **Accepted.** | `b40d5a4` |
| 8 | Extended cinematic acceleration/deceleration journeys (5.2s legs, 1.8s / 1.4s fades) | **Rejected and reverted.** It introduced lag. | `a7aaee6`, reverted by `6623660` |
| 9 | Restored ~3.5s journey with 1.4s entrance and 1.0s exit | **Owner-approved baseline.** | `6623660` |

Rejected implementations are not present in the approved tree. The
regression checks fail if the removed floral frame asset or the reverted
cinematic journey code returns.

## Regression protection

Two layers guard the baseline. Both must pass before any change to the
experiment is accepted.

**Static lock** (`node --test experiments/ivory-palace-frame-journey/baseline.test.cjs`,
no browser, well under a second):

| Protected property | Check |
|---|---|
| Stop-frame numbers | `CHAPTERS` is exactly 80/160/240/300 with their labels |
| Background frames | 300 files, combined SHA-256 unchanged |
| Approved frame asset | Path and dimensions in `index.html`; PNG SHA-256, 941 × 1672, RGBA; opening mask SHA-256; the rejected floral asset absent |
| 85% panel opacity | `.stop-panel__fill` background `rgba(253, 249, 241, 0.85)`, masked to the approved opening |
| Responsive ~90% sizing | `.stop-panel` `min(90cqw, 90cqh × 941/1672)`, ratio 941/1672, centred (no fixed viewport pixels) |
| 1.4s fade-in / 1.0s fade-out | `--panel-enter-ms: 1400ms`, `--panel-exit-ms: 1000ms`, the approved easings, and wiring to the panel transitions |
| Frame-300 finale | `.finale-light` rule text and timings unchanged; finale surface at `FINALE_INDEX`; grain texture SHA-256 |
| Journey pace and 30 fps ceiling | `SOURCE_FPS = 30`, `FLOOR_GAP_MS = 1000 / 30`, `realTimeDuration` + `gentleEase` for chapters, linear opening, one-frame stepping; reverted `cinematicEase`/`journeyDuration` absent |
| Input locking | `goToChapter` busy guard; lock before the exit fade; `arriveAtStop` lock until the fade-in settles; wheel and touch guards; travel waits for the exit fade |
| Overlay visibility / layering | DOM order canvas → fill → frame → reserved wording → finale → loader → controls; wording layer empty, hidden and inert |
| Cache | Frame-size estimate, 36-frame cap and window constants unchanged |

**Behavioural verification** (`node experiments/ivory-palace-frame-journey/verify.js`,
Playwright + Chromium):

- exact landings, zero skips and the 30 fps ceiling on every leg, both
  directions;
- approved journey pace (80-frame legs 3.0–4.2s, finale leg 2.2–3.3s);
- panel fade-in about 1.4s and travel only after the about 1.0s fade-out;
- no surface visible during travel (per-animation-frame sampling), and
  no opacity jumps;
- rapid input ignored during fades and journeys;
- framed panel geometry, 85% fill and clear exterior at seven viewports;
- full-box warm-white finale and the reverse from 300;
- reduced motion;
- the page loads the approved asset;
- cache peak and 36-frame cap;
- no catalogue wording in the page.
