import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const listInvitationGuests = vi.fn();
const createGuest = vi.fn();
const listHouseholds = vi.fn();
const getGuestDashboardSummary = vi.fn();
vi.mock("@/lib/guest-admin.server", () => ({
  listInvitationGuests: (...args: unknown[]) => listInvitationGuests(...args),
  createGuest: (...args: unknown[]) => createGuest(...args),
  listHouseholds: (...args: unknown[]) => listHouseholds(...args),
  getGuestDashboardSummary: (...args: unknown[]) => getGuestDashboardSummary(...args),
}));

import { GET, POST } from "./route";

const VALID_ID = "11111111-1111-1111-8111-111111111111";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
  listInvitationGuests.mockResolvedValue([]);
  listHouseholds.mockResolvedValue([]);
  getGuestDashboardSummary.mockResolvedValue(null);
});

describe("GET /api/admin/invitations/[id]/guests", () => {
  it("403s a non-admin caller before fetching anything", async () => {
    checkAdmin.mockResolvedValue({ user: null, isAdmin: false });
    const res = await GET(req({}), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(403);
    expect(listInvitationGuests).not.toHaveBeenCalled();
  });

  it("returns guests, households, and the dashboard summary together", async () => {
    listInvitationGuests.mockResolvedValue([{ id: "g1" }]);
    listHouseholds.mockResolvedValue([{ id: "h1" }]);
    getGuestDashboardSummary.mockResolvedValue({ totalInvited: 1 });

    const res = await GET(req({}), { params: Promise.resolve({ id: VALID_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ guests: [{ id: "g1" }], households: [{ id: "h1" }], dashboard: { totalInvited: 1 } });
  });
});

describe("POST /api/admin/invitations/[id]/guests", () => {
  it("403s a non-admin caller before validating the body", async () => {
    checkAdmin.mockResolvedValue({ user: null, isAdmin: false });
    const res = await POST(req({ name: "Jane" }), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(403);
    expect(createGuest).not.toHaveBeenCalled();
  });

  it("400s an empty name before calling createGuest", async () => {
    const res = await POST(req({ name: "" }), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(400);
    expect(createGuest).not.toHaveBeenCalled();
  });

  it("creates a guest and returns its id", async () => {
    createGuest.mockResolvedValue({ ok: true, guestId: "g1" });
    const res = await POST(req({ name: "Jane Doe", permittedAttendees: 2 }), { params: Promise.resolve({ id: VALID_ID }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, guestId: "g1" });
    expect(createGuest).toHaveBeenCalledWith(VALID_ID, expect.objectContaining({ name: "Jane Doe", permittedAttendees: 2 }));
  });

  it("maps a database error to a 500 with a generic message", async () => {
    createGuest.mockResolvedValue({ ok: false, reason: "database-error" });
    const res = await POST(req({ name: "Jane" }), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(500);
  });
});
