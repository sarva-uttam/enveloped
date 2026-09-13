import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const createInvitationFromRequest = vi.fn();
vi.mock("@/lib/invitation-admin.server", () => ({
  createInvitationFromRequest: (...args: unknown[]) => createInvitationFromRequest(...args),
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

describe("POST /api/admin/requests/[id]/create-invitation", () => {
  it("403s a non-admin caller before calling createInvitationFromRequest", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req({ packId: "neutral-classic" }), { params });
    expect(res.status).toBe(403);
    expect(createInvitationFromRequest).not.toHaveBeenCalled();
  });

  it("400s a pack id outside the two implemented packs — never claims an unfinished pack is available", async () => {
    const res = await POST(req({ packId: "muslim-wedding" }), { params });
    expect(res.status).toBe(400);
    expect(createInvitationFromRequest).not.toHaveBeenCalled();
  });

  it("returns the new invitation id on success", async () => {
    createInvitationFromRequest.mockResolvedValue({ ok: true, invitationId: "new-id" });
    const res = await POST(req({ packId: "neutral-classic" }), { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ invitationId: "new-id" });
    expect(createInvitationFromRequest).toHaveBeenCalledWith({ requestId: "request-1", packId: "neutral-classic" });
  });

  it("409s with the existing invitation id when one already exists — never silently creates a duplicate", async () => {
    createInvitationFromRequest.mockResolvedValue({ ok: false, reason: "already-exists", existingInvitationId: "existing-id" });
    const res = await POST(req({ packId: "neutral-classic" }), { params });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.existingInvitationId).toBe("existing-id");
  });
});
