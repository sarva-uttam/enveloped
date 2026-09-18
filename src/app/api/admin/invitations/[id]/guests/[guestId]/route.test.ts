import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const updateGuest = vi.fn();
const deleteGuest = vi.fn();
const setGuestActive = vi.fn();
const createGuestLink = vi.fn();
const rotateGuestLink = vi.fn();
const revokeGuestLink = vi.fn();
vi.mock("@/lib/guest-admin.server", () => ({
  updateGuest: (...args: unknown[]) => updateGuest(...args),
  deleteGuest: (...args: unknown[]) => deleteGuest(...args),
  setGuestActive: (...args: unknown[]) => setGuestActive(...args),
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  rotateGuestLink: (...args: unknown[]) => rotateGuestLink(...args),
  revokeGuestLink: (...args: unknown[]) => revokeGuestLink(...args),
}));

import { PATCH, DELETE, POST } from "./route";

const GUEST_ID = "guest-1";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("PATCH /api/admin/invitations/[id]/guests/[guestId]", () => {
  it("403s a non-admin caller", async () => {
    checkAdmin.mockResolvedValue({ user: null, isAdmin: false });
    const res = await PATCH(req({ name: "Jane" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(403);
    expect(updateGuest).not.toHaveBeenCalled();
  });

  it("404s when the guest doesn't exist", async () => {
    updateGuest.mockResolvedValue({ ok: false, reason: "not-found" });
    const res = await PATCH(req({ name: "Jane" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(404);
  });

  it("updates successfully", async () => {
    updateGuest.mockResolvedValue({ ok: true });
    const res = await PATCH(req({ name: "Jane" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/invitations/[id]/guests/[guestId]", () => {
  it("409s with a specific message when the guest is not eligible for hard delete", async () => {
    deleteGuest.mockResolvedValue({ ok: false, reason: "not-eligible" });
    const res = await DELETE(req({}), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("deactivate");
  });

  it("deletes successfully", async () => {
    deleteGuest.mockResolvedValue({ ok: true });
    const res = await DELETE(req({}), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/invitations/[id]/guests/[guestId] — link/active actions", () => {
  it("400s an unknown action", async () => {
    const res = await POST(req({ action: "explode" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(res.status).toBe(400);
  });

  it("create-link returns the raw token exactly once", async () => {
    createGuestLink.mockResolvedValue({ ok: true, token: "RAW-TOKEN" });
    const res = await POST(req({ action: "create-link" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    const body = await res.json();
    expect(body).toEqual({ ok: true, token: "RAW-TOKEN" });
  });

  it("revoke-link never calls the link-generation functions", async () => {
    revokeGuestLink.mockResolvedValue({ ok: true });
    await POST(req({ action: "revoke-link" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(createGuestLink).not.toHaveBeenCalled();
    expect(rotateGuestLink).not.toHaveBeenCalled();
  });

  it("deactivate calls setGuestActive with false", async () => {
    setGuestActive.mockResolvedValue({ ok: true });
    await POST(req({ action: "deactivate" }), { params: Promise.resolve({ guestId: GUEST_ID }) });
    expect(setGuestActive).toHaveBeenCalledWith(GUEST_ID, false);
  });
});
