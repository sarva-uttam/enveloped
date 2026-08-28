/**
 * Validates a `next` redirect target from an untrusted source — a URL
 * query parameter anyone can craft (/login?next=..., /auth/callback?next=...)
 * — before it's ever used to build a redirect. Without this, both routes
 * are a classic open-redirect vector.
 *
 * The concrete attack that motivated this: auth/callback builds the
 * redirect as `${origin}${next}`. Prepending origin looks like it forces
 * same-origin, but it doesn't for every input — next = "@evil.com" turns
 * that into "https://our-site.com@evil.com", which is a syntactically
 * valid URL whose actual HOST is evil.com ("our-site.com" becomes
 * userinfo, silently dropped by the browser). Similarly next = "//evil.com"
 * (protocol-relative) or next = "https://evil.com" (fully absolute) can
 * redirect off-site depending on exactly how/where the value is used.
 *
 * Only a same-origin, absolute-path internal route is accepted. Returns
 * the fallback (default "/dashboard") for anything else — never throws,
 * never partially sanitizes; the result is always either the exact,
 * verbatim safe input or the fallback, nothing in between.
 */
export function sanitizeRedirectPath(input: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof input !== "string" || input.length === 0) return fallback;

  // Backslashes are inconsistently normalized to forward slashes by
  // different browsers/parsers — "/\evil.com" can become the
  // protocol-relative "//evil.com" depending on where it's interpreted.
  // Reject outright rather than try to predict every parser's behavior.
  if (input.includes("\\")) return fallback;

  // Must start with exactly ONE "/" — rejects protocol-relative URLs
  // ("//evil.com", resolved as same-scheme absolute to evil.com) and
  // anything that isn't already an absolute internal path.
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;

  // Reject anything that embeds a scheme delimiter anywhere — belt and
  // braces against constructions like "/x://evil.com".
  if (input.includes("://")) return fallback;

  // Strict allowlist for the rest of the string: safe path/query
  // characters only. Deliberately excludes "@" and ":" — "@" is exactly
  // what makes "our-site.com@evil.com" parse as userinfo+host, and
  // neither character has any legitimate use in this app's internal
  // `next` values (dashboard/survey paths, optionally with a query
  // string). This also rejects control characters, whitespace, and
  // anything outside plain ASCII.
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=%?/]*$/.test(input)) return fallback;

  return input;
}
