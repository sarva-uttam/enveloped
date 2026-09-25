import { describe, it, expect } from "vitest";
import { checkGuestRequestOrigin, readBoundedGuestJsonBody, checkGuestCooldown } from "./guest-submission-guard.server";

/**
 * Stage 10 — CSRF/abuse hardening for the anonymous, token-authenticated
 * guest RSVP route. Mirrors review-submission-guard.server.test.ts
 * exactly, against the guest-specific guard module.
 */

function makeRequest(opts: { origin?: string; host?: string; noHost?: boolean; contentType?: string; contentLength?: string; url?: string; body?: string }) {
  const headers = new Headers();
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  const url = opts.url ?? "https://example.test/api/guest/abc/rsvp";
  if (!opts.noHost) headers.set("host", opts.host ?? new URL(url).host);
  if (opts.contentType !== undefined) headers.set("content-type", opts.contentType);
  if (opts.contentLength !== undefined) headers.set("content-length", opts.contentLength);
  return new Request(url, {
    method: "POST",
    headers,
    body: opts.body,
  });
}

describe("checkGuestRequestOrigin", () => {
  it("accepts a same-origin request", () => {
    const req = makeRequest({ origin: "https://example.test", contentType: "application/json", url: "https://example.test/api/x" });
    expect(checkGuestRequestOrigin(req)).toEqual({ ok: true });
  });

  it("accepts a request with no Origin header at all", () => {
    const req = makeRequest({ contentType: "application/json" });
    expect(checkGuestRequestOrigin(req).ok).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    const req = makeRequest({ origin: "https://evil.test", contentType: "application/json", url: "https://example.test/api/x" });
    const result = checkGuestRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a malformed Origin header", () => {
    const req = makeRequest({ origin: "not a url", contentType: "application/json" });
    expect(checkGuestRequestOrigin(req).ok).toBe(false);
  });

  it("compares Origin against the Host header, not req.url's own host", () => {
    const req = makeRequest({ origin: "http://127.0.0.1:3211", host: "127.0.0.1:3211", url: "http://localhost:3211/api/guest/abc/rsvp", contentType: "application/json" });
    expect(checkGuestRequestOrigin(req)).toEqual({ ok: true });
  });

  it("rejects when the Host header is missing entirely", () => {
    const req = makeRequest({ origin: "https://example.test", contentType: "application/json", url: "https://example.test/api/x", noHost: true });
    const result = checkGuestRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a non-JSON content type", () => {
    const req = makeRequest({ contentType: "text/plain" });
    const result = checkGuestRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects an oversized declared content-length", () => {
    const req = makeRequest({ contentType: "application/json", contentLength: "999999" });
    const result = checkGuestRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});

describe("readBoundedGuestJsonBody", () => {
  it("parses a small valid JSON body", async () => {
    const req = makeRequest({ contentType: "application/json", body: JSON.stringify({ a: 1 }) });
    expect(await readBoundedGuestJsonBody(req)).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON", async () => {
    const req = makeRequest({ contentType: "application/json", body: "{not json" });
    expect(await readBoundedGuestJsonBody(req)).toBeNull();
  });

  it("returns null for a body larger than the bound, even without a declared content-length", async () => {
    const req = makeRequest({ contentType: "application/json", body: JSON.stringify({ a: "x".repeat(10_000) }) });
    expect(await readBoundedGuestJsonBody(req)).toBeNull();
  });
});

describe("checkGuestCooldown", () => {
  it("allows the first attempt for a fresh token", () => {
    expect(checkGuestCooldown(`cooldown-token-${Date.now()}-a`)).toBe(true);
  });

  it("rejects a second attempt for the same token within the cooldown window", () => {
    const token = `cooldown-token-${Date.now()}-b`;
    expect(checkGuestCooldown(token)).toBe(true);
    expect(checkGuestCooldown(token)).toBe(false);
  });

  it("tracks different tokens independently", () => {
    const tokenA = `cooldown-token-${Date.now()}-c`;
    const tokenB = `cooldown-token-${Date.now()}-d`;
    expect(checkGuestCooldown(tokenA)).toBe(true);
    expect(checkGuestCooldown(tokenB)).toBe(true);
  });
});
