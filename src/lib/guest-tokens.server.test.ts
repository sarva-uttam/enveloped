import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { generateGuestToken, hashGuestToken, isValidGuestTokenFormat, GUEST_TOKEN_LENGTH } from "./guest-tokens.server";

/**
 * Unit tests for the pure guest-token crypto primitives — Stage 10.
 * Mirrors preview-tokens.server.test.ts exactly (same shape, same
 * guarantees) for a deliberately SEPARATE token module — see
 * guest-tokens.server.ts's own comment for why guest and preview tokens
 * must never be interchangeable.
 */

describe("generateGuestToken", () => {
  it("produces a base64url string of exactly GUEST_TOKEN_LENGTH characters", () => {
    const token = generateGuestToken();
    expect(token).toHaveLength(GUEST_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("every generated token passes isValidGuestTokenFormat()", () => {
    for (let i = 0; i < 20; i++) {
      expect(isValidGuestTokenFormat(generateGuestToken())).toBe(true);
    }
  });

  it("carries at least 256 bits of entropy", () => {
    const impliedBytes = Math.floor((GUEST_TOKEN_LENGTH * 3) / 4);
    expect(impliedBytes).toBeGreaterThanOrEqual(32);
  });

  it("never repeats across many calls", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateGuestToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashGuestToken", () => {
  it("is deterministic", () => {
    const token = generateGuestToken();
    expect(hashGuestToken(token)).toBe(hashGuestToken(token));
  });

  it("is exactly sha256, hex-encoded, lowercase — matching Postgres's digest(p_token, 'sha256') + encode(..., 'hex')", () => {
    const token = "a-known-example-token-value";
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    expect(hashGuestToken(token)).toBe(expected);
    expect(hashGuestToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the raw token itself, or any substring of it", () => {
    const token = generateGuestToken();
    const hash = hashGuestToken(token);
    expect(hash).not.toBe(token);
    expect(hash.includes(token)).toBe(false);
  });
});

describe("isValidGuestTokenFormat", () => {
  it("rejects empty, null, undefined", () => {
    expect(isValidGuestTokenFormat("")).toBe(false);
    expect(isValidGuestTokenFormat(null)).toBe(false);
    expect(isValidGuestTokenFormat(undefined)).toBe(false);
  });

  it("rejects the wrong length in either direction", () => {
    const real = generateGuestToken();
    expect(isValidGuestTokenFormat(real.slice(0, -1))).toBe(false);
    expect(isValidGuestTokenFormat(real + "a")).toBe(false);
  });

  it("rejects plain-base64 characters base64url never produces", () => {
    const real = generateGuestToken();
    expect(isValidGuestTokenFormat(real.slice(0, -1) + "+")).toBe(false);
    expect(isValidGuestTokenFormat(real.slice(0, -1) + "/")).toBe(false);
    expect(isValidGuestTokenFormat(real.slice(0, -1) + "=")).toBe(false);
  });

  it("rejects whitespace and injection attempts of the right length", () => {
    const filler = "a".repeat(GUEST_TOKEN_LENGTH - 1);
    expect(isValidGuestTokenFormat(filler + " ")).toBe(false);
    expect(isValidGuestTokenFormat("<script>".padEnd(GUEST_TOKEN_LENGTH, "a"))).toBe(false);
  });

  it("a well-formed preview-shaped token still validates as a guest token FORMAT — the distinction is enforced by separate tables/functions, not by shape", () => {
    // Deliberate: guest and preview tokens are the same length/alphabet
    // by construction (identical crypto primitive). This is exactly why
    // "preview tokens must never function as guest tokens" is proven at
    // the database/table level (tests/integration/guest-management.test.ts),
    // never by format alone.
    expect(isValidGuestTokenFormat("a".repeat(GUEST_TOKEN_LENGTH))).toBe(true);
  });
});
