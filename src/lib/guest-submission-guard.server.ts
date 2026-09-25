import "server-only";
import { hashGuestToken } from "@/lib/guest-tokens.server";

/**
 * CSRF/abuse hardening for the anonymous, token-authenticated guest RSVP
 * route — Stage 10, mirroring review-submission-guard.server.ts (Stage 9)
 * exactly. A guest link is a BEARER credential like a preview link, so it
 * gets the same scrutiny: same-origin checking, a bounded body size, and
 * a short per-token cooldown, all in trusted server code.
 *
 * A separate module (not a shared one with review-submission-guard.server.ts)
 * for the same reason guest-tokens.server.ts is separate from
 * preview-tokens.server.ts: independent, per-primitive cooldown state so a
 * burst of preview-review activity can never affect guest RSVP cooldowns
 * or vice versa.
 */

const MAX_BODY_BYTES = 5_000; // generous for an RSVP: status, count, plus-one name, dietary notes, event attendance
const COOLDOWN_MS = 2_000;

const lastAttemptByTokenHash = new Map<string, number>();

export type GuardResult = { ok: true } | { ok: false; status: number };

/** Validates Origin (via the Host header — req.url's host is normalized
 *  by Next.js Route Handlers, see review-submission-guard.server.ts's own
 *  comment for the full rationale), Content-Type, and body size, all
 *  BEFORE the request body is ever parsed. */
export function checkGuestRequestOrigin(req: Request): GuardResult {
  const origin = req.headers.get("origin");
  if (origin) {
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
 *  when Content-Length was absent or understated. */
export async function readBoundedGuestJsonBody(req: Request): Promise<unknown | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A short, per-token cooldown — keyed only by the token's hash, never
 *  the raw token, and only for the cooldown window. */
export function checkGuestCooldown(rawToken: string): boolean {
  const key = hashGuestToken(rawToken);
  const now = Date.now();
  const last = lastAttemptByTokenHash.get(key);
  if (last && now - last < COOLDOWN_MS) {
    return false;
  }
  lastAttemptByTokenHash.set(key, now);
  if (lastAttemptByTokenHash.size > 10_000) {
    for (const [k, ts] of lastAttemptByTokenHash) {
      if (now - ts > COOLDOWN_MS * 10) lastAttemptByTokenHash.delete(k);
    }
  }
  return true;
}
