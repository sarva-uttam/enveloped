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
