import { defineConfig, devices } from "@playwright/test";

/**
 * Stage 12 — a small, focused real-browser suite for interactions unit
 * tests (jsdom) can't reach: actual CSS breakpoints, the preview
 * iframe's postMessage handshake, and reduced-motion media-query
 * behavior. NOT a full e2e/a11y framework — see tests/browser/README.md.
 *
 * Runs against the developer's own already-running `npm run dev` (no
 * `webServer` auto-start here, since these tests also need a seeded
 * local Supabase database — see tests/browser/README.md for the exact
 * setup sequence) at http://localhost:3000.
 */
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/browser/global-setup.ts",
  use: {
    // 127.0.0.1, not "localhost" — must byte-match supabase/config.toml's
    // [auth] site_url exactly, or GoTrue's magic-link redirect (see
    // global-setup.ts) silently falls back to site_url's bare root
    // instead of our /auth/callback, and the session never gets set.
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    storageState: "tests/browser/.auth/admin.json",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
