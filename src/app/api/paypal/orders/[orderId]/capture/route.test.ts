import { describe, it, expect, vi, beforeEach } from "vitest";

// Route-handler-level orchestration tests. Next.js Route Handlers are
// plain async functions, callable directly with a fake Request-like
// object — no HTTP server needed. Everything the route talks to
// (session, payments table, PayPal network calls, the invite write) is
// mocked; verifyCaptureResponse (src/lib/paypal-verify.ts) is left REAL
// since it's pure and is exactly what these "wrong X" scenarios are
// meant to exercise end-to-end through the route.

const mockServerClient = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }));
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const markInvitePaid = vi.fn();
vi.mock("@/lib/storage.server", () => ({
  markInvitePaid: (...args: unknown[]) => markInvitePaid(...args),
}));

const capturePayPalOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({
  capturePayPalOrder: (...args: unknown[]) => capturePayPalOrder(...args),
  paypalConfigured: true,
}));

const getPaymentByOrderId = vi.fn();
const claimPaymentForCapture = vi.fn();
const markPaymentCaptured = vi.fn();
const markPaymentFailed = vi.fn();
vi.mock("@/lib/payments.server", () => ({
  getPaymentByOrderId: (...args: unknown[]) => getPaymentByOrderId(...args),
  claimPaymentForCapture: (...args: unknown[]) => claimPaymentForCapture(...args),
  markPaymentCaptured: (...args: unknown[]) => markPaymentCaptured(...args),
  markPaymentFailed: (...args: unknown[]) => markPaymentFailed(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
  mockServerClient.auth.getUser.mockResolvedValue({ data: { user: { id: "host-1" } } });
  claimPaymentForCapture.mockResolvedValue(true);
  markPaymentCaptured.mockResolvedValue(true);
  markInvitePaid.mockResolvedValue(true);
});

function req(body: unknown = { inviteId: "priya-devansh-abc123" }) {
  return { json: async () => body } as unknown as Request;
}

function params(orderId = "ORDER-1") {
  return { params: Promise.resolve({ orderId }) };
}

const paymentRow = {
  id: "payment-1",
  invitationId: "invite-uuid-1",
  ownerId: "host-1",
  providerOrderId: "ORDER-1",
  providerCaptureId: null,
  tier: "gold",
  expectedAmount: "79.00",
  capturedAmount: null,
  currency: "USD",
  status: "created" as const,
  idempotencyKey: "idem-1",
};

function paypalBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "ORDER-1",
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "invite-uuid-1",
        payee: { email_address: "merchant@example.com" },
        payments: {
          captures: [{ id: "CAPTURE-1", status: "COMPLETED", amount: { currency_code: "USD", value: "79.00" } }],
        },
      },
    ],
    ...overrides,
  };
}

describe("capture route — success", () => {
  it("claims, captures, verifies, records the capture, and marks the invite paid", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({ httpStatus: 201, body: paypalBody() });

    const res = await POST(req(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "COMPLETED" });
    expect(claimPaymentForCapture).toHaveBeenCalledWith("payment-1");
    expect(capturePayPalOrder).toHaveBeenCalledWith("ORDER-1", "idem-1");
    expect(markPaymentCaptured).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({ captureId: "CAPTURE-1", capturedAmount: "79.00", currency: "USD" })
    );
    expect(markInvitePaid).toHaveBeenCalledWith("invite-uuid-1", "ORDER-1");
  });
});

describe("capture route — ownership failure", () => {
  it("refuses a caller who isn't the payment's owner, and never calls PayPal", async () => {
    getPaymentByOrderId.mockResolvedValue({ ...paymentRow, ownerId: "someone-else" });

    const res = await POST(req(), params());

    expect(res.status).toBe(403);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
    expect(markInvitePaid).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(req(), params());

    expect(res.status).toBe(401);
    expect(getPaymentByOrderId).not.toHaveBeenCalled();
  });
});

describe("capture route — reused/unknown order", () => {
  it("returns 404 when no payment row exists for this order id, and never calls PayPal", async () => {
    getPaymentByOrderId.mockResolvedValue(null);

    const res = await POST(req(), params("SOME-OTHER-ORDER"));

    expect(res.status).toBe(404);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });
});

describe("capture route — wrong invitation (custom_id mismatch)", () => {
  it("rejects and marks the payment failed without marking any invite paid", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({
      httpStatus: 201,
      body: paypalBody({ purchase_units: [{ ...paypalBody().purchase_units[0], custom_id: "some-other-invite-uuid" }] }),
    });

    const res = await POST(req(), params());
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.error).not.toMatch(/custom_id/); // generic client-facing error only
    expect(markPaymentFailed).toHaveBeenCalledWith("payment-1", expect.stringMatching(/custom_id mismatch/));
    expect(markInvitePaid).not.toHaveBeenCalled();
  });
});

describe("capture route — wrong amount (e.g. Bronze paid, Gold expected)", () => {
  it("rejects when the captured amount doesn't match the payment row's expected amount", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow); // expects 79.00 (gold)
    capturePayPalOrder.mockResolvedValue({
      httpStatus: 201,
      body: paypalBody({
        purchase_units: [
          {
            ...paypalBody().purchase_units[0],
            payments: { captures: [{ id: "CAPTURE-1", status: "COMPLETED", amount: { currency_code: "USD", value: "19.00" } }] },
          },
        ],
      }),
    });

    const res = await POST(req(), params());

    expect(res.status).toBe(402);
    expect(markPaymentFailed).toHaveBeenCalledWith("payment-1", expect.stringMatching(/amount mismatch/));
    expect(markInvitePaid).not.toHaveBeenCalled();
  });
});

describe("capture route — wrong currency", () => {
  it("rejects a capture in the wrong currency even if the numeric amount matches", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({
      httpStatus: 201,
      body: paypalBody({
        purchase_units: [
          {
            ...paypalBody().purchase_units[0],
            payments: { captures: [{ id: "CAPTURE-1", status: "COMPLETED", amount: { currency_code: "EUR", value: "79.00" } }] },
          },
        ],
      }),
    });

    const res = await POST(req(), params());

    expect(res.status).toBe(402);
    expect(markPaymentFailed).toHaveBeenCalledWith("payment-1", expect.stringMatching(/currency mismatch/));
    expect(markInvitePaid).not.toHaveBeenCalled();
  });
});

describe("capture route — duplicate capture processing", () => {
  it("short-circuits an already-captured payment: recovers the invite flip without calling PayPal again", async () => {
    getPaymentByOrderId.mockResolvedValue({ ...paymentRow, status: "captured", providerCaptureId: "CAPTURE-1" });

    const res = await POST(req(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "COMPLETED" });
    expect(capturePayPalOrder).not.toHaveBeenCalled();
    expect(markInvitePaid).toHaveBeenCalledWith("invite-uuid-1", "ORDER-1");
  });

  it("refuses a concurrent duplicate request that is currently 'processing', without calling PayPal", async () => {
    getPaymentByOrderId.mockResolvedValue({ ...paymentRow, status: "processing" });

    const res = await POST(req(), params());

    expect(res.status).toBe(409);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("refuses when the atomic claim itself loses a race (status was 'created' but the claim failed)", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    claimPaymentForCapture.mockResolvedValue(false);

    const res = await POST(req(), params());

    expect(res.status).toBe(409);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });
});

describe("capture route — database-update failure ('PayPal succeeded but DB failed')", () => {
  it("returns 500 with a support-contact message when markPaymentCaptured itself fails, without marking the invite paid off an unrecorded capture", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({ httpStatus: 201, body: paypalBody() });
    markPaymentCaptured.mockResolvedValue(false);

    const res = await POST(req(), params());

    expect(res.status).toBe(500);
    expect(markInvitePaid).not.toHaveBeenCalled();
  });

  it("returns 500 when markInvitePaid fails after a successfully verified+recorded capture — payment row is already 'captured' so a retry recovers", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({ httpStatus: 201, body: paypalBody() });
    markInvitePaid.mockResolvedValue(false);

    const res = await POST(req(), params());

    expect(res.status).toBe(500);
    expect(markPaymentCaptured).toHaveBeenCalled(); // the capture itself WAS durably recorded
  });
});

describe("capture route — PayPal-side non-2xx / capture not completed", () => {
  it("marks the payment failed and returns a generic error on a non-2xx capture response", async () => {
    getPaymentByOrderId.mockResolvedValue(paymentRow);
    capturePayPalOrder.mockResolvedValue({ httpStatus: 422, body: { name: "UNPROCESSABLE_ENTITY" } });

    const res = await POST(req(), params());

    expect(res.status).toBe(402);
    expect(markPaymentFailed).toHaveBeenCalled();
    expect(markInvitePaid).not.toHaveBeenCalled();
  });
});
