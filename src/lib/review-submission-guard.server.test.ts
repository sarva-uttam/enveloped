import { describe, it, expect } from "vitest";
import { checkRequestOrigin, readBoundedJsonBody, checkCooldown } from "./review-submission-guard.server";

/**
 * Stage 9 Part F — CSRF/abuse hardening for the two anonymous,
 * token-authenticated review submission routes. Pure request-shape
 * checks, no Supabase/network mocking needed.
 */

function makeRequest(opts: { origin?: string; host?: string; noHost?: boolean; contentType?: string; contentLength?: string; url?: string; body?: string }) {
  const headers = new Headers();
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  const url = opts.url ?? "https://example.test/api/preview/abc/review/approve";
  // A real HTTP request always carries a Host header matching the
  // address the client actually connected to — set it here by default
  // (derived from `url`, the same way a real same-origin browser request
  // would line up) so most tests don't need to think about it; `noHost`
  // opts out, for the one test that must exercise its absence.
  if (!opts.noHost) headers.set("host", opts.host ?? new URL(url).host);
  if (opts.contentType !== undefined) headers.set("content-type", opts.contentType);
  if (opts.contentLength !== undefined) headers.set("content-length", opts.contentLength);
  return new Request(url, {
    method: "POST",
    headers,
    body: opts.body,
  });
}

describe("checkRequestOrigin", () => {
  it("accepts a same-origin request", () => {
    const req = makeRequest({ origin: "https://example.test", contentType: "application/json", url: "https://example.test/api/x" });
    expect(checkRequestOrigin(req)).toEqual({ ok: true });
  });

  it("accepts a request with no Origin header at all (Part F: 'where reliable' — a direct request isn't itself suspicious)", () => {
    const req = makeRequest({ contentType: "application/json" });
    expect(checkRequestOrigin(req).ok).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    const req = makeRequest({ origin: "https://evil.test", contentType: "application/json", url: "https://example.test/api/x" });
    const result = checkRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a malformed Origin header", () => {
    const req = makeRequest({ origin: "not a url", contentType: "application/json" });
    expect(checkRequestOrigin(req).ok).toBe(false);
  });

  it("compares Origin against the Host header, NOT req.url's own host (Next.js Route Handlers normalize req.url's host internally, observed directly against a real local build)", () => {
    // Simulates exactly what was observed: req.url reports one host
    // ("localhost", Next.js's internal representation) while the real
    // client-facing Host header says another (what the browser actually
    // addressed) — these must be treated as the SAME request, not a
    // cross-origin one, whenever Origin matches Host.
    const req = makeRequest({ origin: "http://127.0.0.1:3211", host: "127.0.0.1:3211", url: "http://localhost:3211/api/preview/abc/review/approve", contentType: "application/json" });
    expect(checkRequestOrigin(req)).toEqual({ ok: true });
  });

  it("rejects when the Host header is missing entirely", () => {
    const req = makeRequest({ origin: "https://example.test", contentType: "application/json", url: "https://example.test/api/x", noHost: true });
    const result = checkRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a non-JSON content type", () => {
    const req = makeRequest({ contentType: "text/plain" });
    const result = checkRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects an oversized declared content-length", () => {
    const req = makeRequest({ contentType: "application/json", contentLength: "999999" });
    const result = checkRequestOrigin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});

describe("readBoundedJsonBody", () => {
  it("parses a small valid JSON body", async () => {
    const req = makeRequest({ contentType: "application/json", body: JSON.stringify({ a: 1 }) });
    expect(await readBoundedJsonBody(req)).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON", async () => {
    const req = makeRequest({ contentType: "application/json", body: "{not json" });
    expect(await readBoundedJsonBody(req)).toBeNull();
  });

  it("returns null for a body larger than the bound, even without a declared content-length", async () => {
    const req = makeRequest({ contentType: "application/json", body: JSON.stringify({ a: "x".repeat(30_000) }) });
    expect(await readBoundedJsonBody(req)).toBeNull();
  });
});

describe("checkCooldown", () => {
  it("allows the first attempt for a fresh token", () => {
    expect(checkCooldown(`cooldown-token-${Date.now()}-a`)).toBe(true);
  });

  it("rejects a second attempt for the same token within the cooldown window", () => {
    const token = `cooldown-token-${Date.now()}-b`;
    expect(checkCooldown(token)).toBe(true);
    expect(checkCooldown(token)).toBe(false);
  });

  it("tracks different tokens independently", () => {
    const tokenA = `cooldown-token-${Date.now()}-c`;
    const tokenB = `cooldown-token-${Date.now()}-d`;
    expect(checkCooldown(tokenA)).toBe(true);
    expect(checkCooldown(tokenB)).toBe(true);
  });
});
