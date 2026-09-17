# Claude Code handoff — Timeless Editorial HTML invitation prototype

Continue the HTML invitation studio on the existing generator branch and worktree. First inspect the current branch, HEAD, working tree, architecture document, and concept-board document. Preserve every existing change. Do not copy code from the archived Stage 12 coded-generator experiment.

Use the supplied `Timeless Editorial Wedding — Test Package V2` as the only visual asset package for this slice.

## Objective

Implement one complete, visually extravagant **Timeless Editorial Wedding** invitation as a trusted standalone HTML template. This is a proof of the HTML-generation architecture, not the start of the full template library.

## Visual requirements

- Warm ivory, dusty blush, muted sage, champagne gold, and restrained burgundy.
- Rich botanical edge framing, gold filigree, pearls, roses, petals, and delicate sparkles.
- Desktop and mobile must use their separately composed frame assets.
- Real semantic HTML for all names, dates, wording, schedule, venue, links, and accessibility text.
- Bounded petal drift and occasional diagonal wind paths; bounded soft sparkle pulses.
- No couple portrait, fake app interface, coded envelope boxes, Hindu-specific objects, arbitrary CSS from stored data, or client-provided executable HTML.

## Architecture and security

Follow the approved architecture document: trusted checked-in template package, strict substitutions, independent generated-output validation, no script or inline event handlers in stored/generated HTML, no external network references outside the explicit allowlist, and no embedded RSVP form. Keep RSVP on the existing hardened guest route. Raw guest/preview tokens must never enter stored generated HTML.

If motion requires JavaScript, keep it in the trusted application shell rather than the stored invitation document. The invitation must remain complete and readable without JavaScript.

## Accessibility and performance

- Decorative layers: `aria-hidden`, non-interactive, pointer-events disabled.
- Reduced motion: static frame, no falling/drifting/twinkling.
- Pause motion when hidden and clean up all listeners/timers.
- Preserve semantic heading order, keyboard access, focus visibility, contrast, and responsive readability.
- Load only the correct breakpoint frame; avoid fetching both frame assets.
- Bound simultaneous particles per the package README.

## Work sequence

1. Verify repo/branch/tree and review the architecture/concept docs.
2. Copy the V2 package into a clearly named trusted template asset directory without modifying source files.
3. Implement the smallest template contract and renderer required for this single concept.
4. Add strict substitution and output-validation tests.
5. Add the trusted shell motion enhancement separately from stored HTML.
6. Create representative fictional fixtures.
7. Capture desktop, mobile, reduced-motion, and no-JavaScript screenshots for owner review.
8. Run typecheck, lint, tests, build, audit, and diff checks.

Do not commit, push, merge, deploy, add database migrations, build the full template library, implement AI portraits, or begin the Hindu template. Stop with the working tree uncommitted and provide screenshots plus a concise implementation/security/validation report for owner approval.
