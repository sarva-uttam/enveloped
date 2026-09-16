import type { FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getLocalSupabaseEnv } from "./local-env";

/**
 * Stage 12 — establishes a REAL admin session before any spec runs, the
 * same session shape a signed-in administrator's browser actually has:
 * a genuine `signInWithPassword()` call against the LOCAL GoTrue
 * instance (service-role sets a throwaway password on the disposable
 * fixture admin first — see tests/browser/README.md for how that
 * user/its invitations are seeded), then the resulting session is
 * written into the exact cookie `@supabase/ssr` reads on both sides —
 * `sb-<host>-auth-token`, value `base64-` + base64url(JSON of the
 * session) — the documented format `createBrowserClient`/
 * `createServerClient` both use when no custom `cookieOptions.name` is
 * given (this app sets none — see src/lib/supabase/client.ts and
 * server.ts).
 *
 * Why not a magic link? `auth.admin.generateLink()` always produces an
 * IMPLICIT-flow link (`#access_token=...` in a URL fragment); this
 * app's `@supabase/ssr` client is hardcoded to `flowType: "pkce"`
 * (see node_modules/@supabase/ssr's createBrowserClient.js), so it
 * never looks at the fragment at all — there is no supported client-side
 * path from an admin-generated link to a real session in this app.
 * Writing the session cookie directly is the reliable alternative,
 * still driving through GoTrue's own real password-grant endpoint for
 * the session itself (only the cookie WRITE is manual, not the auth
 * decision).
 */
export default async function globalSetup(config: FullConfig) {
  const { apiUrl, serviceRoleKey, anonKey } = getLocalSupabaseEnv();
  const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });

  const email = process.env.STAGE12_ADMIN_EMAIL ?? "stage12review-owner@example.test";
  const password = `Stage12BrowserTests!${Date.now()}`;

  const { data: users, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw new Error(`Stage 12 browser tests: could not list users (${listError.message})`);
  const user = users.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`Stage 12 browser tests: fixture admin "${email}" not found — run \`npm run seed:visual-review\` first.`);
  }

  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, { password });
  if (pwError) throw new Error(`Stage 12 browser tests: could not set a throwaway password (${pwError.message})`);

  const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) {
    throw new Error(`Stage 12 browser tests: sign-in failed (${signInError?.message})`);
  }

  const storageKey = `sb-${new URL(apiUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue = "base64-" + base64url(JSON.stringify(signIn.session));

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3000";
  const domain = new URL(baseURL).hostname;

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    { name: storageKey, value: cookieValue, domain, path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
  ]);
  await context.storageState({ path: "tests/browser/.auth/admin.json" });
  await browser.close();
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
