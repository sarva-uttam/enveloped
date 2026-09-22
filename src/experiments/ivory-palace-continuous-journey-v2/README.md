# EXPERIMENTAL — NOT PRODUCTION READY

Ivory Palace — Continuous Journey V2 scrollymation motion-feasibility prototype.

This is disposable, isolated experiment code. It is **not** the production
Ivory Palace template (`src/lib/html-templates/packages/ivory-palace-signature/`),
is not wired into any route, database, composition schema, or template
registry, and can be deleted without affecting production code. See
`FEASIBILITY-REPORT.md` for the full write-up.

## Local preview

```sh
npm test -- src/experiments/ivory-palace-continuous-journey-v2
```

This writes the rendered prototype (default fixture, a long-name stress
variant, and a no-assets variant for the blocked-media fallback) to
`generator-output/ivory-palace-continuous-journey-v2/` (gitignored). Then
serve and open it, e.g.:

```sh
cd generator-output/ivory-palace-continuous-journey-v2
python3 -m http.server 8744
# open http://127.0.0.1:8744/default/index.html
```

Add `?t04=B` or `?t04=C` to the URL (or use the on-page "Finale treatment"
panel, bottom-right) to compare the three finale-transition treatments.
Toggle "Emulate CSS prefers-reduced-motion: reduce" in your browser's
DevTools to see the complete static fallback.

## Files

- `motion.ts` / `motion.test.ts` — pure, DOM-free motion math (scale
  budgets, timing curve, text-phase opacity, T04 concealment frames),
  unit-tested directly.
- `render.ts` — generates the static HTML document (markup, inline CSS,
  and an inlined runtime `<script>` that mirrors `motion.ts`'s math in
  plain JS, since a static HTML file has no build step to import a TS
  module at request time).
- `fixture.ts` — fictional content for Sarvesh & Shakshina, plus a
  long-name stress variant.
- `scripts/derive-assets.cjs` — one-off dev script producing AVIF/WebP
  runtime derivatives from the source review package (masters are
  never modified).
- `assets/` — the runtime derivatives + the reused self-hosted Alex
  Brush font (see `FEASIBILITY-REPORT.md` for what's deferred).
