import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const saveInviteComposition = vi.fn();
vi.mock("@/lib/composition-admin.server", () => ({
  saveInviteComposition: (...args: unknown[]) => saveInviteComposition(...args),
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

describe("POST /api/admin/invitations/[id]/composition", () => {
  it("403s a non-admin caller before calling saveInviteComposition", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });
    const res = await POST(req({ composition: {}, expectedRevision: 0 }), { params });
    expect(res.status).toBe(403);
    expect(saveInviteComposition).not.toHaveBeenCalled();
  });

  it("400s a malformed body (missing expectedRevision)", async () => {
    const res = await POST(req({ composition: {} }), { params });
    expect(res.status).toBe(400);
    expect(saveInviteComposition).not.toHaveBeenCalled();
  });

  it("saves successfully and returns the new revision", async () => {
    saveInviteComposition.mockResolvedValue({ ok: true, revision: 5 });
    const res = await POST(req({ composition: { schemaVersion: 1 }, expectedRevision: 4 }), { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, revision: 5 });
    expect(saveInviteComposition).toHaveBeenCalledWith(
      expect.objectContaining({ inviteId: "invite-1", expectedRevision: 4 })
    );
  });

  it("409s a stale-revision conflict, never silently overwriting", async () => {
    saveInviteComposition.mockResolvedValue({ ok: false, reason: "stale-revision" });
    const res = await POST(req({ composition: {}, expectedRevision: 0 }), { params });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.reason).toBe("stale-revision");
  });

  it("422s an invalid composition", async () => {
    saveInviteComposition.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(req({ composition: {}, expectedRevision: 0 }), { params });
    expect(res.status).toBe(422);
  });
});
