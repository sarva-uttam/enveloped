import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.ts on purpose: these tests need a running
// local Supabase stack (Docker) and are comparatively slow (real network
// round trips to Postgres/PostgREST/GoTrue) — they must never run as
// part of the default `npm test`, which stays fast and dependency-free.
// See tests/integration/README.md for how to run these.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // One file at a time — a handful of files, each doing a modest
    // number of real network round trips; not worth the complexity of
    // parallel workers contending over the same disposable database.
    fileParallelism: false,
  },
});
