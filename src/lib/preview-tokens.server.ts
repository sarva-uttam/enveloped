import "server-only";
import { randomBytes, createHash } from "crypto";

/**
 * Raw preview-token generation, hashing, and format validation — Stage 5
 * (2026-09-10, see PROJECT_STATUS.md's Stage 5 section). Pure crypto, no
 * Supabase, no network — kept separate from src/lib/preview-admin.server.ts
 * (which orchestrates the actual admin-authorized create/rotate/revoke
 * operations, including the checkAdmin() gate) so the one genuinely
 * security-critical primitive — how a token is generated and hashed —
 * lives in one small, easy-to-audit place with its own focused unit
 * tests (preview-tokens.server.test.ts).
 *
 * `server-only` (matching payments.server.ts's use of the same Node
 * `crypto` module): `randomBytes` wouldn't bundle for a browser anyway,
 * but this makes "never reachable from client code" an explicit,
 * enforced fact rather than an accident of what happens to fail to
 * bundle.
 */

const TOKEN_BYTES = 32; // 256 bits — meets the "at least 256 bits of
// entropy" requirement exactly, from node:crypto's randomBytes, backed
// by the OS CSPRNG (never Math.random() or any other non-cryptographic
// source).

/** base64url encodes every 3 raw bytes as 4 characters, with no padding
 *  (Node's "base64url" target strips the trailing "=" a plain "base64"
 *  encoding would add) — the unpadded length for n bytes is ceil(n*4/3);
 *  for 32 bytes that's ceil(128/3) = 43, confirmed empirically against
 *  Node's own output while writing this. Derived here, not hardcoded, so
 *  PREVIEW_TOKEN_LENGTH can never silently drift out of sync with
 *  TOKEN_BYTES. */
export const PREVIEW_TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 4) / 3);

/**
 * Generates one fresh, unguessable preview token. Called ONLY from
 * src/lib/preview-admin.server.ts's create/rotate operations, themselves
 * only reachable after checkAdmin() confirms the caller is a real,
 * signed-in administrator — this function itself has no authorization
 * logic of its own, by design (single responsibility: generate
 * randomness, nothing else).
 *
 * base64url output (alphabet: A-Z a-z 0-9 - _) is directly usable as a
 * /preview/[token] URL path segment with no further escaping — no "+",
 * "/", or "=" the way plain base64 would produce, any of which would
 * need percent-encoding or could be misread as a path separator.
 */
export function generatePreviewToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256, hex-encoded (lowercase) — the one-way hash stored in
 * invite_previews.token_hash instead of the raw token. Deliberately the
 * exact same algorithm and encoding the database's own
 * get_invite_preview() function computes internally
 * (`encode(digest(p_token, 'sha256'), 'hex')`) — both must independently
 * arrive at byte-identical output for the same raw token, or every
 * preview link would be unusable; verified directly by
 * tests/integration/private-preview.test.ts ("a token hashed by this
 * function is exactly what get_invite_preview() accepts").
 *
 * Called here, in trusted Node server code, at CREATE/ROTATE time only —
 * see preview-admin.server.ts: only the resulting hash ever crosses into
 * a Postgres RPC call, never the raw token itself, not even as a
 * transient argument. Verification (an incoming preview request) instead
 * hashes INSIDE get_invite_preview() itself, from the raw token supplied
 * in the URL — see that function's own SQL comment (in the migration)
 * for why creation and verification are deliberately structured
 * differently.
 */
export function hashPreviewToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${PREVIEW_TOKEN_LENGTH}}$`);

/**
 * High-confidence format validation for a `/preview/[token]` route
 * param, BEFORE it ever reaches a database call — the same "reject
 * outright, don't rely solely on the database to say no" principle as
 * isValidSlug() in src/lib/invite-view-model.ts. Every real token this
 * app ever generates is exactly PREVIEW_TOKEN_LENGTH base64url
 * characters; anything else (wrong length, or containing a character
 * outside base64url's alphabet — including "+", "/", "=" from ordinary
 * base64 rather than base64url) is rejected before it ever touches
 * Postgres, the same way a malformed value would be rejected even if it
 * happened to be the right length but the wrong alphabet.
 */
export function isValidPreviewTokenFormat(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
