import { describe, it, expect } from "vitest";
import { sanitizeRedirectPath } from "./safe-redirect";

describe("sanitizeRedirectPath", () => {
  it("passes through legitimate internal paths unchanged", () => {
    expect(sanitizeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectPath("/survey")).toBe("/survey");
    expect(sanitizeRedirectPath("/invite/priya-devansh")).toBe("/invite/priya-devansh");
    expect(sanitizeRedirectPath("/invite/priya-devansh?guest=aria-1")).toBe(
      "/invite/priya-devansh?guest=aria-1"
    );
  });

  it("falls back for null, undefined, and empty input", () => {
    expect(sanitizeRedirectPath(null)).toBe("/dashboard");
    expect(sanitizeRedirectPath(undefined)).toBe("/dashboard");
    expect(sanitizeRedirectPath("")).toBe("/dashboard");
  });

  it("respects a custom fallback", () => {
    expect(sanitizeRedirectPath(null, "/survey")).toBe("/survey");
    expect(sanitizeRedirectPath("https://evil.com", "/survey")).toBe("/survey");
  });

  describe("malicious redirect values", () => {
    const malicious = [
      // Fully absolute URLs, various schemes
      "https://evil.com",
      "http://evil.com",
      "https://evil.com/dashboard",
      "javascript:alert(1)",
      "ftp://evil.com",
      // Protocol-relative — resolves to the current scheme + evil.com
      "//evil.com",
      "//evil.com/dashboard",
      "///evil.com", // triple-slash variants some parsers still treat as protocol-relative
      // Backslash tricks — some parsers normalize \ to / before routing,
      // turning these into protocol-relative or absolute URLs
      "/\\evil.com",
      "\\\\evil.com",
      "\\/evil.com",
      "/\\/evil.com",
      // Userinfo/host-confusion — the "${origin}${next}" concatenation
      // trick this module exists specifically to close
      "@evil.com",
      "/@evil.com",
      "user:pass@evil.com",
      // Embedded scheme deeper in the string
      "/redirect://evil.com",
      "/x/https://evil.com",
      // Malformed / control-character / whitespace tricks
      "/\n/evil.com",
      "/\t/evil.com",
      "/dashboard\r\nSet-Cookie: x=1",
      "not-a-path-at-all",
      "dashboard", // missing leading slash
      " /dashboard", // leading whitespace
    ];

    it.each(malicious)("rejects %j and falls back to the default", (value) => {
      expect(sanitizeRedirectPath(value)).toBe("/dashboard");
    });
  });
});
