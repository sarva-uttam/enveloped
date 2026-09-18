import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const resolveReviewFeedbackItem = vi.fn();
vi.mock("@/lib/review-admin.server", () => ({
  resolveReviewFeedbackItem: (...args: unknown[]) => resolveReviewFeedbackItem(...args),
}));

import { POST } from "./route";

function req() {
  return {} as Request;
}
const params = Promise.resolve({ itemId: "item-1" });

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/reviews/feedback/[itemId]", () => {
  it("403s a non-admin caller", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req(), { params });
    expect(res.status).toBe(403);
    expect(resolveReviewFeedbackItem).not.toHaveBeenCalled();
  });

  it("resolves the item on success", async () => {
    resolveReviewFeedbackItem.mockResolvedValue({ ok: true });
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(resolveReviewFeedbackItem).toHaveBeenCalledWith("item-1");
  });

  it("404s when the item isn't found", async () => {
    resolveReviewFeedbackItem.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await POST(req(), { params });
    expect(res.status).toBe(404);
  });
});
