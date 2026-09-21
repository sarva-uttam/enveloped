import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const markReviewRoundReady = vi.fn();
const sendReviewRound = vi.fn();
const cancelReviewRound = vi.fn();
const resolveReviewRound = vi.fn();
vi.mock("@/lib/review-admin.server", () => ({
  markReviewRoundReady: (...args: unknown[]) => markReviewRoundReady(...args),
  sendReviewRound: (...args: unknown[]) => sendReviewRound(...args),
  cancelReviewRound: (...args: unknown[]) => cancelReviewRound(...args),
  resolveReviewRound: (...args: unknown[]) => resolveReviewRound(...args),
}));

import { POST } from "./route";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}
const params = Promise.resolve({ roundId: "round-1" });

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/reviews/[roundId]", () => {
  it("403s a non-admin caller before calling any action", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req({ action: "ready" }), { params });
    expect(res.status).toBe(403);
    expect(markReviewRoundReady).not.toHaveBeenCalled();
  });

  it("400s an invalid action", async () => {
    const res = await POST(req({ action: "delete" }), { params });
    expect(res.status).toBe(400);
  });

  it.each([
    ["ready", markReviewRoundReady],
    ["send", sendReviewRound],
    ["cancel", cancelReviewRound],
    ["resolve", resolveReviewRound],
  ] as const)("dispatches action '%s' to the correct function", async (action, fn) => {
    fn.mockResolvedValue({ ok: true });
    const res = await POST(req({ action }), { params });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledWith("round-1");
  });

  it("404s when the round isn't found", async () => {
    markReviewRoundReady.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await POST(req({ action: "ready" }), { params });
    expect(res.status).toBe(404);
  });
});
