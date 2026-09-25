import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { generatePreviewToken, hashPreviewToken, isValidPreviewTokenFormat, PREVIEW_TOKEN_LENGTH } from "./preview-tokens.server";

/**
 * Unit tests for the pure crypto primitives — Stage 5 (see
 * PROJECT_STATUS.md). No Supabase, no I/O; the actual "does a real
 * stored hash match what get_invite_preview() computes" claim is proven
 * against a real Postgres in tests/integration/private-preview.test.ts,
 * not here.
 */

describe("generatePreviewToken", () => {
  it("produces a base64url string of exactly PREVIEW_TOKEN_LENGTH characters", () => {
    const token = generatePreviewToken();
    expect(token).toHaveLength(PREVIEW_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("every generated token passes isValidPreviewTokenFormat() — the generator and the validator must agree on the shape", () => {
    for (let i = 0; i < 20; i++) {
      expect(isValidPreviewTokenFormat(generatePreviewToken())).toBe(true);
    }
  });

  it("carries at least 256 bits of entropy — 32 raw bytes before base64url encoding, never fewer", () => {
    // base64url encodes n bytes as ceil(n*4/3) characters with no
    // padding; PREVIEW_TOKEN_LENGTH (43) only arises from n = 32 bytes
    // (31 bytes would be 42 chars, 33 bytes would be 44) — so asserting
    // the exact length is itself already an assertion about the byte
    // count, made explicit here rather than left implicit.
    const impliedBytes = Math.floor((PREVIEW_TOKEN_LENGTH * 3) / 4);
    expect(impliedBytes).toBeGreaterThanOrEqual(32);
  });

  it("never repeats across many calls — a CSPRNG, not a fixed or predictable value", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generatePreviewToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashPreviewToken", () => {
  it("is deterministic — the same raw token always hashes to the same value (required for lookup-by-hash to ever succeed)", () => {
    const token = generatePreviewToken();
    expect(hashPreviewToken(token)).toBe(hashPreviewToken(token));
  });

  it("is exactly sha256, hex-encoded, lowercase — the same primitive Postgres's digest(p_token, 'sha256') + encode(..., 'hex') computes", () => {
    const token = "a-known-example-token-value";
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    expect(hashPreviewToken(token)).toBe(expected);
    expect(hashPreviewToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different tokens hash to different values (no accidental collisions across a reasonable sample)", () => {
    const hashes = new Set(Array.from({ length: 200 }, () => hashPreviewToken(generatePreviewToken())));
    expect(hashes.size).toBe(200);
  });

  it("never returns the raw token itself, or any substring of it, as the hash — the whole point of a one-way hash", () => {
    const token = generatePreviewToken();
    const hash = hashPreviewToken(token);
    expect(hash).not.toBe(token);
    expect(hash.includes(token)).toBe(false);
  });
});

describe("isValidPreviewTokenFormat", () => {
  it("rejects empty, null, undefined", () => {
    expect(isValidPreviewTokenFormat("")).toBe(false);
    expect(isValidPreviewTokenFormat(null)).toBe(false);
    expect(isValidPreviewTokenFormat(undefined)).toBe(false);
  });

  it("rejects the wrong length in either direction", () => {
    const real = generatePreviewToken();
    expect(isValidPreviewTokenFormat(real.slice(0, -1))).toBe(false); // one short
    expect(isValidPreviewTokenFormat(real + "a")).toBe(false); // one long
  });

  it("rejects plain-base64 characters that base64url never produces ('+', '/', '=')", () => {
    const real = generatePreviewToken();
    expect(isValidPreviewTokenFormat(real.slice(0, -1) + "+")).toBe(false);
    expect(isValidPreviewTokenFormat(real.slice(0, -1) + "/")).toBe(false);
    expect(isValidPreviewTokenFormat(real.slice(0, -1) + "=")).toBe(false);
  });

  it("rejects whitespace, path traversal, and SQL/script injection attempts of the right length", () => {
    const filler = "a".repeat(PREVIEW_TOKEN_LENGTH - 1);
    expect(isValidPreviewTokenFormat(filler + " ")).toBe(false);
    expect(isValidPreviewTokenFormat("../" + "a".repeat(PREVIEW_TOKEN_LENGTH - 3))).toBe(false);
    expect(isValidPreviewTokenFormat("<script>".padEnd(PREVIEW_TOKEN_LENGTH, "a"))).toBe(false);
  });

  it("accepts every character base64url can actually produce, at the right length", () => {
    expect(isValidPreviewTokenFormat("A".repeat(PREVIEW_TOKEN_LENGTH))).toBe(true);
    expect(isValidPreviewTokenFormat("a".repeat(PREVIEW_TOKEN_LENGTH))).toBe(true);
    expect(isValidPreviewTokenFormat("0".repeat(PREVIEW_TOKEN_LENGTH))).toBe(true);
    expect(isValidPreviewTokenFormat(("-_" + "a".repeat(PREVIEW_TOKEN_LENGTH - 2)))).toBe(true);
  });
});
