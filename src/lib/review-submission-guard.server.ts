import "server-only";
import { hashPreviewToken } from "@/lib/preview-tokens.server";

/**
 * CSRF/abuse hardening for the two anonymous, token-authenticated review
 * submission routes — Stage 9 Part F. A private preview link is a
 * BEARER credential (anyone holding the URL can act with it, unlike a
 * cookie-based session tied to a specific origin by the browser alone),
 * so these routes get extra scrutiny beyond "the DB function only
 * accepts a real token": same-origin checking, a bounded body size, and
 * a short per-token cooldown, all enforced here, in trusted server code,
 * never left to client-side button-disabling alone (Part F: "do not
 * rely on client-side disabling as the real protection").
 *
 * Deliberately NOT a CAPTCHA or a distributed rate limiter — Part F: "do
 * not introduce CAPTCHA unless a demonstrated threat... justifies it."
 * The in-memory cooldown map is process-local and resets on restart or
 * across multiple server instances — a known, documented limitation
 * (see PROJECT_STATUS.md's Stage 9 section), acceptable for this
 * stage's threat model (a single admin operator, not public sign-up
 * abuse) and explicitly not claimed to be more than that.
 */

const MAX_BODY_BYTES = 20_000; // generous for 10 feedback items at 2000 chars each
const COOLDOWN_MS = 2_000;

const lastAttemptByTokenHash = new Map<string, number>();

export type GuardResult = { ok: true } | { ok: false; status: number };

/**
 * Validates Origin (same-origin only, when the header is present — a
 * direct/non-CORS request that omits it is not itself treated as
 * suspicious, matching Part F's "where reliable" qualifier), Content-
 * Type, and body size, all BEFORE the request body is ever parsed as
 * JSON or handed to any database call.
 */
export function checkRequestOrigin(req: Request): GuardResult {
  const origin = req.headers.get("origin");
  if (origin) {
    // NOT `new URL(req.url).origin` — inside a Next.js Route Handler,
    // `req.url`'s host is normalized to a fixed internal value (observed
    // directly against this local stack: always "localhost", regardless
    // of whether the browser actually addressed 127.0.0.1, a LAN IP, or
    // the real deployed hostname), so comparing against it rejects every
    // genuine same-origin request whose Host isn't that exact string.
    // The `Host` header reflects what the client actually targeted;
    // reconstructing the expected origin from it (with req.url only for
    // the protocol, which Next.js does NOT rewrite) is the reliable
    // comparison.
    const requestUrl = new URL(req.url);
    const host = req.headers.get("host");
    if (!host) {
      return { ok: false, status: 403 };
    }
    const expectedOrigin = `${requestUrl.protocol}//${host}`;

    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return { ok: false, status: 403 };
    }
    if (originUrl.origin !== expectedOrigin) {
      return { ok: false, status: 403 };
    }
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, status: 415 };
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  return { ok: true };
}

/** Reads the request body as text, enforcing the same size bound even
 *  when Content-Length was absent or understated — returns null (never
 *  throws) for anything over the limit or unparsable as JSON. */
export async function readBoundedJsonBody(req: Request): Promise<unknown | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A short, per-token cooldown — never keyed by the raw token itself
 *  (only its hash lives in process memory, and only for the cooldown
 *  window, never persisted or logged). Returns false if the token
 *  attempted a submission within the cooldown window. */
export function checkCooldown(rawToken: string): boolean {
  const key = hashPreviewToken(rawToken);
  const now = Date.now();
  const last = lastAttemptByTokenHash.get(key);
  if (last && now - last < COOLDOWN_MS) {
    return false;
  }
  lastAttemptByTokenHash.set(key, now);
  // Opportunistic cleanup so this map never grows unbounded across a
  // long-running process — cheap relative to how rarely this path runs.
  if (lastAttemptByTokenHash.size > 10_000) {
    for (const [k, ts] of lastAttemptByTokenHash) {
      if (now - ts > COOLDOWN_MS * 10) lastAttemptByTokenHash.delete(k);
    }
  }
  return true;
}
