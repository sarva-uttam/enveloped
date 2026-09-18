import { describe, it, expect, vi, beforeEach } from "vitest";

const submitGuestRsvp = vi.fn();
vi.mock("@/lib/guest-client.server", () => ({
  submitGuestRsvp: (...args: unknown[]) => submitGuestRsvp(...args),
}));

import { POST } from "./route";

function req(token: string, body: unknown, opts: { origin?: string; contentType?: string } = {}) {
  const headers = new Headers();
  headers.set("content-type", opts.contentType ?? "application/json");
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  return new Request(`https://example.test/api/guest/${token}/rsvp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let counter = 0;
function freshToken() {
  // A distinct token per test avoids the real in-process cooldown map
  // (guest-submission-guard.server.ts) rejecting a later test.
  counter += 1;
  return `test-token-${Date.now()}-${counter}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/guest/[token]/rsvp", () => {
  it("rejects a cross-origin request before calling submitGuestRsvp", async () => {
    const token = freshToken();
    const res = await POST(req(token, {}, { origin: "https://evil.test" }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(403);
    expect(submitGuestRsvp).not.toHaveBeenCalled();
  });

  it("submits an RSVP and returns ok", async () => {
    submitGuestRsvp.mockResolvedValue({ ok: true });
    const token = freshToken();
    const res = await POST(req(token, { status: "attending", attendeeCount: 2 }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(submitGuestRsvp).toHaveBeenCalledWith(token, { status: "attending", attendeeCount: 2 });
  });

  it("returns the SAME generic 409 for every submission failure reason", async () => {
    submitGuestRsvp.mockResolvedValue({ ok: false, reason: "unavailable" });
    const token = freshToken();
    const res = await POST(req(token, { status: "attending", attendeeCount: 1 }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("This invitation is not currently accepting responses.");
  });

  it("rejects a second submission within the cooldown window", async () => {
    submitGuestRsvp.mockResolvedValue({ ok: true });
    const token = freshToken();
    await POST(req(token, { status: "attending", attendeeCount: 1 }), { params: Promise.resolve({ token }) });
    const second = await POST(req(token, { status: "attending", attendeeCount: 1 }), { params: Promise.resolve({ token }) });
    expect(second.status).toBe(429);
  });

  it("400s an oversized body without calling submitGuestRsvp", async () => {
    const token = freshToken();
    const res = await POST(
      req(token, { status: "attending", attendeeCount: 1, dietaryNotes: "x".repeat(10_000) }),
      { params: Promise.resolve({ token }) }
    );
    expect(res.status).toBe(400);
    expect(submitGuestRsvp).not.toHaveBeenCalled();
  });
});
