import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately minimal: mostly focused unit tests for pure logic and
// mocked data-layer functions, still `environment: "node"` (no jsdom).
// Stage 4 (2026-09-09, see PROJECT_STATUS.md) added `.tsx` to `include`
// for src/app/invite/[id]/page.test.tsx — server-rendering tests that
// call the async Server Component function directly and render its
// returned JSX with react-dom/server's renderToStaticMarkup. That
// approach needs no simulated DOM (no window/document access happens
// during a plain render pass), so plain Node stays sufficient — no
// jsdom/@testing-library dependency was added for this. See that test
// file's own header comment for the full reasoning.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
