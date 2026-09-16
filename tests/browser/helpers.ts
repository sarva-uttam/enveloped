import { createClient } from "@supabase/supabase-js";
import { getLocalSupabaseEnv } from "./local-env";

/** Looks up a disposable fixture invitation's id by slug — LOCAL stack
 *  only (getLocalSupabaseEnv() enforces loopback). Fixtures are seeded
 *  by scripts/seed-visual-review.mjs; see tests/browser/README.md. */
export async function getInvitationId(slug: string): Promise<string> {
  const { apiUrl, serviceRoleKey } = getLocalSupabaseEnv();
  const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin.from("invites").select("id").eq("slug", slug).single();
  if (error || !data) {
    throw new Error(`Fixture invitation "${slug}" not found — run scripts/seed-visual-review.mjs first (${error?.message})`);
  }
  return data.id as string;
}
