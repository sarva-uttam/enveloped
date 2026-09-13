import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const publishInvitation = vi.fn();
const unpublishInvitation = vi.fn();
vi.mock("@/lib/invitation-admin.server", () => ({
  publishInvitation: (...args: unknown[]) => publishInvitation(...args),
  unpublishInvitation: (...args: unknown[]) => unpublishInvitation(...args),
}));

import { POST } from "./route";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}
const params = Promise.resolve({ id: "invite-1" });

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/invitations/[id]/publish", () => {
  it("403s a non-admin caller before calling either function", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req({ action: "publish" }), { params });
    expect(res.status).toBe(403);
    expect(publishInvitation).not.toHaveBeenCalled();
    expect(unpublishInvitation).not.toHaveBeenCalled();
  });

  it("calls publishInvitation for action: publish", async () => {
    publishInvitation.mockResolvedValue({ ok: true });
    const res = await POST(req({ action: "publish" }), { params });
    expect(res.status).toBe(200);
    expect(publishInvitation).toHaveBeenCalledWith("invite-1");
    expect(unpublishInvitation).not.toHaveBeenCalled();
  });

  it("calls unpublishInvitation for action: unpublish", async () => {
    unpublishInvitation.mockResolvedValue({ ok: true });
    const res = await POST(req({ action: "unpublish" }), { params });
    expect(res.status).toBe(200);
    expect(unpublishInvitation).toHaveBeenCalledWith("invite-1");
    expect(publishInvitation).not.toHaveBeenCalled();
  });

  it("400s an invalid action", async () => {
    const res = await POST(req({ action: "delete" }), { params });
    expect(res.status).toBe(400);
  });
});
