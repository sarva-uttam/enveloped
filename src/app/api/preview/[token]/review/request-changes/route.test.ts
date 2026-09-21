import { randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getInvitePreviewServer = vi.fn();
vi.mock("@/lib/storage.server", () => ({
  getInvitePreviewServer: (...args: unknown[]) => getInvitePreviewServer(...args),
}));

const submitChangeRequest = vi.fn();
vi.mock("@/lib/review-client.server", () => ({
  submitChangeRequest: (...args: unknown[]) => submitChangeRequest(...args),
}));

import { POST } from "./route";

function freshToken() {
  return randomBytes(32).toString("base64url");
}

function req(token: string, body: unknown, opts: { origin?: string; contentType?: string } = {}) {
  const headers = new Headers();
  headers.set("content-type", opts.contentType ?? "application/json");
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  return new Request(`https://example.test/api/preview/${token}/review/request-changes`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { items: [{ message: "Please fix the headline." }] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/preview/[token]/review/request-changes", () => {
  it("rejects a cross-origin request before touching the database", async () => {
    const token = freshToken();
    const res = await POST(req(token, VALID_BODY, { origin: "https://evil.test" }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(403);
    expect(getInvitePreviewServer).not.toHaveBeenCalled();
  });

  it("400s a malformed body (empty items array) before touching the database", async () => {
    const token = freshToken();
    const res = await POST(req(token, { items: [] }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(400);
    expect(getInvitePreviewServer).not.toHaveBeenCalled();
  });

  it("409s generically when the token doesn't resolve to a preview at all", async () => {
    getInvitePreviewServer.mockResolvedValue(null);
    const token = freshToken();
    const res = await POST(req(token, VALID_BODY), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(409);
    expect(submitChangeRequest).not.toHaveBeenCalled();
  });

  it("submits successfully, passing the fetched composition through for section-id validation", async () => {
    const composition = { sections: [{ id: "opening" }] };
    getInvitePreviewServer.mockResolvedValue({ composition });
    submitChangeRequest.mockResolvedValue({ ok: true });
    const token = freshToken();
    const res = await POST(req(token, VALID_BODY), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(submitChangeRequest).toHaveBeenCalledWith(token, { items: VALID_BODY.items, displayName: null }, composition);
  });

  it("returns the same generic 409 when submitChangeRequest itself fails", async () => {
    getInvitePreviewServer.mockResolvedValue({ composition: { sections: [] } });
    submitChangeRequest.mockResolvedValue({ ok: false, reason: "unavailable" });
    const token = freshToken();
    const res = await POST(req(token, VALID_BODY), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(409);
  });
});
