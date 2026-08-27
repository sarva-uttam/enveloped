import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately minimal: these are focused unit tests for pure logic and
// mocked data-layer functions, not component/integration tests, so no
// jsdom/React plugin is needed — just the same @/* alias as tsconfig.json.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
