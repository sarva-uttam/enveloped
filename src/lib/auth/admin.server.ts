import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The ONLY server-side authorization check any admin-gated route or
 * server action should use — see src/app/admin/layout.tsx for the one
 * place it's currently called, and PROJECT_STATUS.md's Stage 2 section
 * for the full design.
 *
 * Deliberately does NOT infer admin status from anything client-supplied
 * or otherwise weak: not a boolean the browser sends, not localStorage,
 * not an email address, not route visibility, not public user metadata.
 * The only source of truth is the real `is_admin()` database function
 * (supabase/migrations/20260909120000_admin_identity.sql) — SECURITY
 * DEFINER, reading `app_admins` (a table with no client-writable path at
 * all: RLS enabled, and no insert/update/delete policy exists for any
 * role, admin included — see that migration's own comments), called here
 * through the session-aware SERVER client (src/lib/supabase/server.ts,
 * reads the caller's real cookies, respects RLS) exactly the way any
 * other authenticated request would call it. There is no code path here
 * a client can influence beyond "is this browser's session cookie valid
 * for some real, signed-in user" — which is authentication, not
 * authorization; the is_admin() call below is what actually authorizes.
 *
 * Fails CLOSED, not open: a signed-out visitor, a Supabase
 * misconfiguration, and an errored RPC call all resolve to
 * `isAdmin: false` — never to a default of `true` under any condition.
 * See deriveAdminCheckResult() below and admin.server.test.ts for that
 * logic isolated and exhaustively unit-tested on its own, the same
 * pure-core/thin-I/O-wrapper pattern already used by
 * src/lib/ownership.ts and src/lib/paypal-verify.ts.
 */

export interface AdminCheckResult {
  user: User | null;
  isAdmin: boolean;
}

interface IsAdminRpcResult {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Pure decision logic, no I/O — given what the session lookup and the
 * is_admin() RPC call actually returned, decides the final result.
 * Exhaustively unit-tested in admin.server.test.ts; keep this function
 * dependency-free so it stays trivial to test in isolation.
 */
export function deriveAdminCheckResult(user: User | null, rpc: IsAdminRpcResult): AdminCheckResult {
  if (!user) return { user: null, isAdmin: false };
  if (rpc.error) return { user, isAdmin: false };
  // Boolean(...) rather than trusting `data` is already exactly `true`/
  // `false` — defensive against an unexpected RPC response shape ever
  // being treated as truthy-admin by accident (e.g. a non-boolean,
  // non-null value). A real `true` is the only thing that ever grants
  // isAdmin: true here.
  return { user, isAdmin: Boolean(rpc.data) };
}

export const checkAdmin = cache(async (): Promise<AdminCheckResult> => {
  const client = await createServerSupabaseClient();
  if (!client) return { user: null, isAdmin: false };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null, isAdmin: false };

  const rpc = await client.rpc("is_admin");
  if (rpc.error) {
    // Logged server-side only; never surfaced to the client beyond "you
    // don't have access." deriveAdminCheckResult() below still fails
    // closed even without this log line — this is observability, not
    // part of the security decision.
    console.error("checkAdmin: is_admin() RPC failed", rpc.error);
  }

  return deriveAdminCheckResult(user, rpc);
});
