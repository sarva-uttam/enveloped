import { describe, it, expect, vi, beforeEach } from "vitest";

const submitApproval = vi.fn();
vi.mock("@/lib/review-client.server", () => ({
  submitApproval: (...args: unknown[]) => submitApproval(...args),
}));

import { POST } from "./route";

function req(token: string, body: unknown, opts: { origin?: string; contentType?: string } = {}) {
  const headers = new Headers();
  headers.set("content-type", opts.contentType ?? "application/json");
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  return new Request(`https://example.test/api/preview/${token}/review/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let counter = 0;
function freshToken() {
  // A distinct token per test avoids the real in-process cooldown map
  // (review-submission-guard.server.ts) rejecting a later test as a
  // duplicate submission within the same run.
  counter += 1;
  return `test-token-${Date.now()}-${counter}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/preview/[token]/review/approve", () => {
  it("rejects a cross-origin request before calling submitApproval", async () => {
    const token = freshToken();
    const res = await POST(req(token, {}, { origin: "https://evil.test" }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(403);
    expect(submitApproval).not.toHaveBeenCalled();
  });

  it("submits approval and returns ok", async () => {
    submitApproval.mockResolvedValue({ ok: true });
    const token = freshToken();
    const res = await POST(req(token, { displayName: "Priya" }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(submitApproval).toHaveBeenCalledWith(token, "Priya");
  });

  it("returns the SAME generic 409 for every submission failure reason", async () => {
    submitApproval.mockResolvedValue({ ok: false, reason: "unavailable" });
    const token = freshToken();
    const res = await POST(req(token, {}), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("This review is no longer available.");
  });

  it("400s a malformed body", async () => {
    const token = freshToken();
    const res = await POST(req(token, { displayName: 12345 }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(400);
    expect(submitApproval).not.toHaveBeenCalled();
  });
});
