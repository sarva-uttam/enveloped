import { describe, it, expect, vi, beforeEach } from "vitest";

const mockServerClient = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }));
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const getInviteServer = vi.fn();
vi.mock("@/lib/storage.server", () => ({
  getInviteServer: (...args: unknown[]) => getInviteServer(...args),
}));

const createPayPalOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({
  createPayPalOrder: (...args: unknown[]) => createPayPalOrder(...args),
  paypalConfigured: true,
}));

const findPendingPayment = vi.fn();
const createPaymentRecord = vi.fn();
vi.mock("@/lib/payments.server", () => ({
  findPendingPayment: (...args: unknown[]) => findPendingPayment(...args),
  createPaymentRecord: (...args: unknown[]) => createPaymentRecord(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
  mockServerClient.auth.getUser.mockResolvedValue({ data: { user: { id: "host-1" } } });
  findPendingPayment.mockResolvedValue(null);
});

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

const invite = {
  id: "priya-devansh-abc123",
  internalId: "invite-uuid-1",
  answers: { category: "wedding-hindu", tier: "gold" },
  content: {},
  guestList: [],
  createdAt: "2026-01-01",
  paid: false,
  ownerId: "host-1",
};

describe("orders route — requires the authenticated owner to initiate checkout", () => {
  it("401s when signed out, and never calls PayPal", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(req({ inviteId: "priya-devansh-abc123" }));

    expect(res.status).toBe(401);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("403s when the signed-in caller doesn't own the invite", async () => {
    getInviteServer.mockResolvedValue({ ...invite, ownerId: "someone-else" });

    const res = await POST(req({ inviteId: "priya-devansh-abc123" }));

    expect(res.status).toBe(403);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("404s when the invite doesn't exist (or isn't visible under RLS)", async () => {
    getInviteServer.mockResolvedValue(null);

    const res = await POST(req({ inviteId: "does-not-exist" }));

    expect(res.status).toBe(404);
  });

  it("409s when the invite is already paid", async () => {
    getInviteServer.mockResolvedValue({ ...invite, paid: true });

    const res = await POST(req({ inviteId: "priya-devansh-abc123" }));

    expect(res.status).toBe(409);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });
});

describe("orders route — input validation", () => {
  it("400s on a malformed inviteId instead of reaching the database", async () => {
    const res = await POST(req({ inviteId: "../../etc/passwd" }));

    expect(res.status).toBe(400);
    expect(getInviteServer).not.toHaveBeenCalled();
  });

  it("400s when inviteId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});

describe("orders route — server-authoritative pricing and binding", () => {
  it("uses the tier price from the invite's own stored answers, not anything the client sends, and binds the order to the invite's internal uuid", async () => {
    getInviteServer.mockResolvedValue(invite); // tier: gold => $79
    createPayPalOrder.mockResolvedValue("ORDER-1");
    createPaymentRecord.mockResolvedValue({ id: "payment-1", providerOrderId: "ORDER-1" });

    // Even if the client tried to smuggle a price/tier in, the schema
    // only accepts inviteId — there is nowhere for it to go.
    const res = await POST(req({ inviteId: "priya-devansh-abc123", priceUsd: "1.00", tier: "platinum" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ orderId: "ORDER-1" });
    expect(createPayPalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ priceUsd: "79.00", customId: "invite-uuid-1" })
    );
    expect(createPaymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: "invite-uuid-1", ownerId: "host-1", providerOrderId: "ORDER-1", tier: "gold", expectedAmount: "79.00" })
    );
  });

  it("reuses an existing pending order instead of creating a second one on a retried click", async () => {
    getInviteServer.mockResolvedValue(invite);
    findPendingPayment.mockResolvedValue({ id: "payment-1", providerOrderId: "EXISTING-ORDER" });

    const res = await POST(req({ inviteId: "priya-devansh-abc123" }));
    const json = await res.json();

    expect(json).toEqual({ orderId: "EXISTING-ORDER" });
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("502s with a generic error when the order is created on PayPal but the local payments insert fails", async () => {
    getInviteServer.mockResolvedValue(invite);
    createPayPalOrder.mockResolvedValue("ORDER-1");
    createPaymentRecord.mockResolvedValue(null);

    const res = await POST(req({ inviteId: "priya-devansh-abc123" }));

    expect(res.status).toBe(502);
  });
});
