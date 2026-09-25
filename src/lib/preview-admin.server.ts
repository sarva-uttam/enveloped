import "server-only";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePreviewToken, hashPreviewToken } from "./preview-tokens.server";

/**
 * Server-only, administrator-only orchestration for private preview
 * links — Stage 5 (2026-09-10, see PROJECT_STATUS.md's Stage 5 section).
 * The ONLY module in this project that ever generates a raw preview
 * token; every caller (currently just the minimal admin control on
 * /admin — see src/app/api/admin/invite-previews/route.ts) gets the raw
 * token back exactly once, from the return value of the function that
 * created or rotated it, and never again — nothing here persists it
 * (not to a variable that outlives the call, not to a log line, not to
 * any table; only its hash reaches Postgres, via
 * admin_create_invite_preview()/admin_rotate_invite_preview()).
 *
 * Every function below re-verifies admin status itself via checkAdmin()
 * — the same real, database-backed is_admin() check used everywhere else
 * in this project (src/app/admin/layout.tsx, publish_invite() callers,
 * etc.) — and the underlying SQL functions ALSO re-check is_admin()
 * internally (see the migration). This is deliberate defense-in-depth,
 * not redundancy to trim: an ordinary authenticated caller is rejected
 * at the TypeScript layer before any RPC is even attempted, AND would
 * still be rejected by the database itself if this layer were ever
 * bypassed or had a bug.
 *
 * Fails CLOSED throughout: any missing session, any RPC error, any
 * "no client configured" condition resolves to an explicit `ok: false`
 * result with a specific reason — never a default of success, never a
 * silently-empty token.
 *
 * Never uses the service-role client (src/lib/supabase/admin.ts) — every
 * RPC call here goes through the session-aware SERVER client, so the
 * actual authorization decision is made by is_admin() reading the
 * caller's own real session, not by an elevated credential this module
 * would otherwise need to guard even more carefully. The service-role
 * key is never referenced by this file at all, let alone sent to a
 * client.
 */

export type PreviewLinkResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not-admin" | "invite-not-found" | "already-exists" | "database-error" };

export type PreviewRevokeResult = { ok: true } | { ok: false; reason: "not-admin" | "not-found" | "database-error" };

/**
 * Creates the FIRST preview link for an invitation. Deliberately does
 * NOT silently rotate if one already exists — admin_create_invite_preview()
 * raises an exception for that (invite_id is the table's PRIMARY KEY),
 * surfaced here as `reason: "already-exists"` so a caller can decide
 * whether to call rotatePreviewLink() instead, rather than this function
 * guessing that's what was intended.
 */
export async function createPreviewLink(inviteId: string): Promise<PreviewLinkResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const token = generatePreviewToken();
  const tokenHash = hashPreviewToken(token);

  const { error } = await client.rpc("admin_create_invite_preview", {
    p_invite_id: inviteId,
    p_token_hash: tokenHash,
  });

  if (error) {
    if (error.message.includes("already exists")) return { ok: false, reason: "already-exists" };
    // Logged server-side only, and NEVER the raw token — only the
    // database's own error message, which by construction (see the
    // migration) can never itself contain token material; `token`/
    // `tokenHash` are deliberately not interpolated into this line.
    console.error("createPreviewLink: admin_create_invite_preview RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }

  return { ok: true, token };
}

/**
 * Replaces the current preview token (active or previously revoked)
 * with a fresh one — the only sanctioned way an existing preview link's
 * credential ever changes. `reason: "invite-not-found"` covers both "no
 * invitation with this id" and "no preview link exists yet for it"
 * (admin_rotate_invite_preview() returns `false`, not an exception, for
 * either — see the migration) — createPreviewLink() is what a caller
 * should use for the latter case instead.
 */
export async function rotatePreviewLink(inviteId: string): Promise<PreviewLinkResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const token = generatePreviewToken();
  const tokenHash = hashPreviewToken(token);

  const { data, error } = await client.rpc("admin_rotate_invite_preview", {
    p_invite_id: inviteId,
    p_token_hash: tokenHash,
  });

  if (error) {
    console.error("rotatePreviewLink: admin_rotate_invite_preview RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "invite-not-found" };

  return { ok: true, token };
}

/**
 * Revokes the current preview link, if one exists and is still active.
 * Idempotent from the caller's point of view: revoking an already-
 * revoked (or never-created) link returns `reason: "not-found"` rather
 * than an error — a normal, expected outcome, not a failure.
 */
export async function revokePreviewLink(inviteId: string): Promise<PreviewRevokeResult> {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return { ok: false, reason: "not-admin" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "database-error" };

  const { data, error } = await client.rpc("admin_revoke_invite_preview", { p_invite_id: inviteId });

  if (error) {
    console.error("revokePreviewLink: admin_revoke_invite_preview RPC failed", error.message);
    return { ok: false, reason: "database-error" };
  }
  if (!data) return { ok: false, reason: "not-found" };

  return { ok: true };
}
