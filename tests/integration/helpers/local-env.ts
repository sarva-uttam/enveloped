import { execFileSync } from "node:child_process";

/**
 * Resolves connection details for the LOCAL Supabase stack only, and
 * refuses to hand them out if anything about the target looks like it
 * could be the live project. This is the one module every integration
 * test file imports before doing anything else — see
 * tests/integration/README.md ("How these tests are guaranteed not to
 * target production") for the full reasoning.
 *
 * Deliberately does NOT read `.env.local` or any `NEXT_PUBLIC_SUPABASE_*`
 * variable — those are the app's LIVE project credentials, and this
 * module's whole job is to never go anywhere near them. Connection info
 * comes from exactly one place: `supabase status -o json`, the local CLI
 * asking the local Docker daemon what it started. If the local stack
 * isn't running, this throws instead of falling back to anything else.
 */

export interface LocalSupabaseEnv {
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface SupabaseStatusJson {
  API_URL?: string;
  DB_URL?: string;
  ANON_KEY?: string;
  SERVICE_ROLE_KEY?: string;
}

/**
 * A URL is accepted ONLY if its hostname is a loopback address. Every
 * live Supabase project is reachable at `https://<ref>.supabase.co` (or a
 * custom domain) — never `127.0.0.1`/`localhost`/`::1` — so this single
 * check is already sufficient on its own. The `.supabase.co` substring
 * check below is pure belt-and-braces: even if some future local setup
 * ever legitimately used a non-loopback hostname, a URL containing the
 * live platform's own domain must still be rejected unconditionally.
 */
function assertLocalUrl(label: string, rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Refusing to run integration tests: could not parse ${label} ("${rawUrl}") as a URL.`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";

  if (!isLoopback) {
    throw new Error(
      `Refusing to run integration tests: ${label} ("${rawUrl}") is not a loopback address. ` +
        `These tests only ever run against a local, disposable Supabase stack (127.0.0.1/localhost) ` +
        `— never a remote or production project, under any configuration.`
    );
  }

  if (rawUrl.includes("supabase.co") || rawUrl.includes("supabase.com")) {
    throw new Error(
      `Refusing to run integration tests: ${label} ("${rawUrl}") contains a Supabase platform domain. ` +
        `This must never point at a real hosted project.`
    );
  }
}

function assertLocalDbUrl(rawUrl: string): void {
  // postgresql://user:pass@host:port/db — reuse the same loopback check on
  // the host component. new URL() parses postgresql:// URLs fine (it only
  // cares about the scheme being followed by "://").
  assertLocalUrl("DB_URL", rawUrl);
}

let cached: LocalSupabaseEnv | null = null;

/**
 * Returns the local stack's connection details, having verified every one
 * of them is loopback-only. Throws (does not skip, does not fall back)
 * if `supabase status` fails — e.g. the local stack isn't running — or if
 * anything about the resolved URLs looks non-local. Cached per process
 * since `supabase status` shells out to Docker and is not free to call
 * from every test file.
 */
export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  if (cached) return cached;

  let raw: string;
  try {
    // execFileSync (not exec/execSync with a shell string) — no shell
    // interpolation risk, and this never touches user-supplied input
    // anyway. cwd is this file's own repo (tests/integration/helpers ->
    // ../../.. is the repo root, where supabase/config.toml lives).
    raw = execFileSync("supabase", ["status", "-o", "json"], {
      cwd: new URL("../../..", import.meta.url).pathname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      "Could not read local Supabase status — is the local stack running? " +
        "Run `npm run db:start` first (see tests/integration/README.md). " +
        `Underlying error: ${detail}`
    );
  }

  let parsed: SupabaseStatusJson;
  try {
    parsed = JSON.parse(raw) as SupabaseStatusJson;
  } catch {
    throw new Error("Could not parse `supabase status -o json` output as JSON.");
  }

  const { API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY } = parsed;
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      "`supabase status -o json` did not return API_URL/DB_URL/ANON_KEY/SERVICE_ROLE_KEY — " +
        "is the local stack fully started? Run `npm run db:start` and wait for it to finish."
    );
  }

  assertLocalUrl("API_URL", API_URL);
  assertLocalDbUrl(DB_URL);

  cached = { apiUrl: API_URL, dbUrl: DB_URL, anonKey: ANON_KEY, serviceRoleKey: SERVICE_ROLE_KEY };
  return cached;
}
