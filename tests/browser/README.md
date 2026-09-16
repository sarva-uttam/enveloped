# Browser tests (Stage 12)

A small, focused Playwright suite covering interactions `vitest`/jsdom
cannot reach: the live-preview iframe's real `postMessage` handshake,
actual CSS breakpoints, and reduced-motion media-query behavior. Not a
full e2e or accessibility framework — see `src/**/*.test.tsx` for the
much larger unit/component suite these tests intentionally don't
duplicate.

## Prerequisites

1. Local Supabase running with every migration applied:
   ```bash
   npm run db:start
   npm run db:reset
   ```
2. Disposable visual-review fixtures seeded (a fictional admin user plus
   one invitation per design template):
   ```bash
   npm run seed:visual-review
   ```
   Safe to re-run — it deletes and recreates every `stage12review-*` row
   first.
3. The dev server running in another terminal:
   ```bash
   npm run dev
   ```

## Running

```bash
npm run test:browser
```

`playwright.config.ts`'s `globalSetup` signs in as the seeded fixture
admin via a real Supabase magic-link verification URL (generated
service-role-side, local stack only — see `global-setup.ts`) and saves
the resulting browser storage state for every spec to reuse. No password
auth is exposed anywhere in the app's own UI; this only exists so the
test suite gets a genuine, cookie-based admin session without a human
clicking through email.

## What's covered

- Template selection and apply (visual tokens change, content doesn't).
- The compact live preview updating from an in-progress, unsaved edit.
- The reduced-motion preview toggle.
- No horizontal overflow at seven representative viewport widths.
- The narrow-viewport "Show preview" editor/preview switch.
- Keyboard-only workspace tab navigation.
- The admin preview never exposing a submittable RSVP form.
