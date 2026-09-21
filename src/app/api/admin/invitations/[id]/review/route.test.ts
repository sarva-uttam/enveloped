import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const createReviewRound = vi.fn();
vi.mock("@/lib/review-admin.server", () => ({
  createReviewRound: (...args: unknown[]) => createReviewRound(...args),
}));

import { POST } from "./route";

function req() {
  return {} as Request;
}
const params = Promise.resolve({ id: "invite-1" });

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/invitations/[id]/review", () => {
  it("403s a non-admin caller before calling createReviewRound", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req(), { params });
    expect(res.status).toBe(403);
    expect(createReviewRound).not.toHaveBeenCalled();
  });

  it("returns the new reviewRoundId on success", async () => {
    createReviewRound.mockResolvedValue({ ok: true, reviewRoundId: "round-1" });
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reviewRoundId: "round-1" });
    expect(createReviewRound).toHaveBeenCalledWith("invite-1");
  });

  it("409s when an active round already exists", async () => {
    createReviewRound.mockResolvedValue({ ok: false, reason: "already-active" });
    const res = await POST(req(), { params });
    expect(res.status).toBe(409);
  });

  it("404s when the invitation doesn't exist", async () => {
    createReviewRound.mockResolvedValue({ ok: false, reason: "invite-not-found" });
    const res = await POST(req(), { params });
    expect(res.status).toBe(404);
  });
});
