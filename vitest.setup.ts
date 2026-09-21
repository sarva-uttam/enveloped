import { vi } from "vitest";

// server-only's default export throws unconditionally when imported
// outside Next.js's RSC-aware bundler — it relies on a "react-server"
// package.json export condition that only Next.js's build sets, resolving
// to a no-op (empty.js) there instead of the throwing index.js. Plain
// Node (Vitest) doesn't set that condition, so without this mock, any
// test importing storage.server.ts / supabase/server.ts / supabase/
// admin.ts would throw immediately on import. See node_modules/server-only
// /index.js and package.json's "exports" field.
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------
// jsdom polyfills — Stage 7 (see PROJECT_STATUS.md's Stage 7 section).
// Only the `.test.tsx` files that opt into `// @vitest-environment jsdom`
// have a `window`; the default `environment: "node"` files never enter
// this block. jsdom deliberately does NOT implement matchMedia or
// IntersectionObserver, and the experience components (useReducedMotion,
// AnimateIn's whileInView, AtmosphericEffect) depend on both — a
// minimal, honest polyfill (not a mock that erases the behavior under
// test) is what lets the component tests exercise the real code paths.
// ---------------------------------------------------------------------
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;

  if (typeof w.matchMedia !== "function") {
    w.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  if (typeof w.IntersectionObserver !== "function") {
    class NoopIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: number[] = [];
    }
    w.IntersectionObserver = NoopIntersectionObserver;
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = NoopIntersectionObserver;
  }
}
