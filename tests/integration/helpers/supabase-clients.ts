import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalSupabaseEnv } from "./local-env";

/**
 * Thin client factories for the LOCAL Supabase stack only — every
 * function here calls getLocalSupabaseEnv() first, which throws before
 * returning anything if the resolved URLs aren't loopback-only. There is
 * no code path in this file that can end up pointed at a real project.
 *
 * Node-side auth session options (persistSession/autoRefreshToken/
 * detectSessionInUrl: false) are set on every client — supabase-js
 * defaults assume a browser with localStorage/a URL bar, neither of
 * which exists here.
 */

export function createAnonClient(): SupabaseClient {
  const { apiUrl, anonKey } = getLocalSupabaseEnv();
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createServiceRoleClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = getLocalSupabaseEnv();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface TestUser {
  userId: string;
  email: string;
  /** A client whose every request carries this user's access token —
   *  exactly what a signed-in browser looks like to PostgREST/RLS
   *  (auth.uid() resolves to this user, auth.role() to 'authenticated'). */
  client: SupabaseClient;
}

/**
 * Signs up a brand-new throwaway user against the LOCAL GoTrue instance
 * and returns a client authenticated as them. Local auth.email
 * confirmations are disabled by default (supabase/config.toml,
 * [auth.email] enable_confirmations = false — verified during Stage 1
 * setup), so signUp() returns a live session immediately; no mailpit/SMTP
 * round trip needed.
 *
 * `label` becomes part of the email so failures are readable
 * (stage1-<runId>-<label>@example.test) — pair with a per-file/per-run
 * `runId` (see makeRunId()) for deterministic, collision-free identifiers
 * across parallel or repeated runs.
 */
export async function createTestUser(runId: string, label: string): Promise<TestUser> {
  const { apiUrl, anonKey } = getLocalSupabaseEnv();
  const email = `stage1-${runId}-${label}@example.test`;
  const password = `Stage1Test!${randomUUID()}`;

  const anon = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await anon.auth.signUp({ email, password });
  if (error || !data.user || !data.session) {
    throw new Error(`createTestUser(${label}) sign-up failed: ${error?.message ?? "no session returned"}`);
  }

  const authed = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  return { userId: data.user.id, email, client: authed };
}

/** A short, collision-resistant id to prefix every row an integration
 *  test file creates — see tests/integration/README.md's "isolated test
 *  records" note. Not cryptographically meaningful, just unique enough
 *  that two runs (or a leftover row from a failed run) never collide and
 *  cleanup queries can match on it unambiguously. */
export function makeRunId(): string {
  return randomUUID().slice(0, 8);
}
