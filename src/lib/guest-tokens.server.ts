import "server-only";
import { randomBytes, createHash } from "crypto";

/**
 * Raw guest-token generation, hashing, and format validation — Stage 10.
 * Deliberately its own module, not a re-export of preview-tokens.server.ts,
 * even though the underlying crypto is identical: "private preview tokens
 * must never function as guest tokens" is enforced structurally by
 * keeping generation, hashing, and redemption entirely separate code
 * paths against entirely separate tables (invite_guest_links, never
 * invite_previews) — see supabase/migrations/20260914090000_guest_management.sql.
 * Mirrors preview-tokens.server.ts's own single-responsibility rationale.
 */

const TOKEN_BYTES = 32; // 256 bits, from node:crypto's CSPRNG.

export const GUEST_TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 4) / 3);

/** Generates one fresh, unguessable guest token. Called ONLY from
 *  src/lib/guest-admin.server.ts's create/rotate operations, themselves
 *  only reachable after checkAdmin() confirms the caller is a real,
 *  signed-in administrator. */
export function generateGuestToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256, hex-encoded (lowercase) — the one-way hash stored in
 *  invite_guest_links.token_hash instead of the raw token. Must match
 *  get_guest_invite()/submit_guest_rsvp()'s internal
 *  `encode(extensions.digest(p_token, 'sha256'), 'hex')` byte-for-byte. */
export function hashGuestToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${GUEST_TOKEN_LENGTH}}$`);

/** High-confidence format validation for a `/guest/[token]` route param,
 *  BEFORE it ever reaches a database call — same principle as
 *  isValidPreviewTokenFormat(). */
export function isValidGuestTokenFormat(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
