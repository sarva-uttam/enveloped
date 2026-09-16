import { execFileSync } from "node:child_process";

/**
 * A Playwright-safe re-implementation of
 * tests/integration/helpers/local-env.ts's `getLocalSupabaseEnv()` — same
 * "loopback-only, never production" guarantee, but without that file's
 * `import.meta.url` usage, which Playwright's own TypeScript loader
 * (CJS-based) can't evaluate. Uses `process.cwd()` instead (Playwright
 * always runs with cwd at the repo root, where supabase/config.toml
 * lives, since that's where `npx playwright test` is invoked from).
 */
export interface LocalSupabaseEnv {
  apiUrl: string;
  serviceRoleKey: string;
  anonKey: string;
}

function assertLoopback(label: string, rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Refusing to run browser tests: could not parse ${label} ("${rawUrl}") as a URL.`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLoopback || rawUrl.includes("supabase.co") || rawUrl.includes("supabase.com")) {
    throw new Error(`Refusing to run browser tests: ${label} ("${rawUrl}") is not a local, loopback Supabase stack.`);
  }
}

export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  const raw = execFileSync("supabase", ["status", "-o", "json"], { cwd: process.cwd(), encoding: "utf8" });
  const json = JSON.parse(raw) as { API_URL?: string; SERVICE_ROLE_KEY?: string; ANON_KEY?: string };
  if (!json.API_URL || !json.SERVICE_ROLE_KEY || !json.ANON_KEY) {
    throw new Error("Could not read local Supabase status — run `npm run db:start` first.");
  }
  assertLoopback("API_URL", json.API_URL);
  return { apiUrl: json.API_URL, serviceRoleKey: json.SERVICE_ROLE_KEY, anonKey: json.ANON_KEY };
}
