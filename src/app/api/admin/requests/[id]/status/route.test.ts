import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const updateRequestStatus = vi.fn();
vi.mock("@/lib/requests-admin.server", () => ({
  updateRequestStatus: (...args: unknown[]) => updateRequestStatus(...args),
}));

import { POST } from "./route";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}
const params = Promise.resolve({ id: "request-1" });

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/requests/[id]/status", () => {
  it("403s a non-admin caller before parsing the body or calling updateRequestStatus", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });

    const res = await POST(req({ status: "contacted" }), { params });

    expect(res.status).toBe(403);
    expect(updateRequestStatus).not.toHaveBeenCalled();
  });

  it("400s an unrecognized status value", async () => {
    const res = await POST(req({ status: "not-a-real-status" }), { params });
    expect(res.status).toBe(400);
    expect(updateRequestStatus).not.toHaveBeenCalled();
  });

  it("succeeds and calls updateRequestStatus with the path id and validated status", async () => {
    updateRequestStatus.mockResolvedValue({ ok: true });

    const res = await POST(req({ status: "contacted" }), { params });

    expect(res.status).toBe(200);
    expect(updateRequestStatus).toHaveBeenCalledWith("request-1", "contacted");
  });

  it("409s an invalid transition", async () => {
    updateRequestStatus.mockResolvedValue({ ok: false, reason: "invalid-transition" });
    const res = await POST(req({ status: "completed" }), { params });
    expect(res.status).toBe(409);
  });

  it("404s a missing request", async () => {
    updateRequestStatus.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await POST(req({ status: "contacted" }), { params });
    expect(res.status).toBe(404);
  });
});
