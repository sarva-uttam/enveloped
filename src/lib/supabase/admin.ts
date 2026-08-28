import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdminConfigured = Boolean(url && serviceRoleKey);

/**
 * Service-role client — BYPASSES Row Level Security entirely. Server-only
 * by construction: the `server-only` import above makes any accidental
 * client-side import of this file fail the build, so the service role key
 * can never end up in browser JS.
 *
 * Scope this narrowly. Right now the only caller is markInvitePaid()
 * (src/lib/storage.server.ts), which preserves its exact pre-existing
 * behavior — "the server can mark any invite paid after a successful
 * PayPal capture" — now correctly routed through a real service-role
 * client instead of the (now owner-locked) public anon-key client that
 * every other read/write goes through. This is a client-separation change
 * only: it does not add or change any verification of *who* is allowed to
 * trigger a capture — that's explicitly out of scope for this batch (see
 * PROJECT_STATUS.md / REVIEW_BRIEF.md, "PayPal integrity").
 */
export const supabaseAdmin = supabaseAdminConfigured ? createClient(url!, serviceRoleKey!) : null;
