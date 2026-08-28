import { describe, it, expect, vi, beforeEach } from "vitest";

// Same rationale as storage.server.test.ts: every function here goes
// through the ADMIN (service-role) client, never the session-aware one —
// deliberate, since `payments` has no anon/authenticated write policy at
// all (see supabase/migrations/20260829000000_payment_integrity.sql), so
// the browser is structurally unable to write to this table under any
// circumstances. vitest.setup.ts mocks `server-only` so this file can be
// imported at all outside Next.js's build.

const mockAdminClient = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: mockAdminClient,
  supabaseAdminConfigured: true,
}));

import {
  findPendingPayment,
  createPaymentRecord,
  getPaymentByOrderId,
  claimPaymentForCapture,
  markPaymentCaptured,
  markPaymentFailed,
} from "./payments.server";

beforeEach(() => {
  vi.clearAllMocks();
});

const row = {
  id: "payment-1",
  invitation_id: "invite-uuid-1",
  owner_id: "host-1",
  provider_order_id: "ORDER-1",
  provider_capture_id: null,
  tier: "gold",
  expected_amount: "79.00",
  captured_amount: null,
  currency: "USD",
  status: "created" as const,
  idempotency_key: "idem-1",
};

describe("findPendingPayment", () => {
  it("looks up by invitation_id, scoped to status=created, most recent first", async () => {
    const limit = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: row }) });
    const order = vi.fn().mockReturnValue({ limit });
    const eqStatus = vi.fn().mockReturnValue({ order });
    const eqInvitation = vi.fn().mockReturnValue({ eq: eqStatus });
    const select = vi.fn().mockReturnValue({ eq: eqInvitation });
    mockAdminClient.from.mockReturnValue({ select });

    const result = await findPendingPayment("invite-uuid-1");

    expect(mockAdminClient.from).toHaveBeenCalledWith("payments");
    expect(eqInvitation).toHaveBeenCalledWith("invitation_id", "invite-uuid-1");
    expect(eqStatus).toHaveBeenCalledWith("status", "created");
    expect(result?.id).toBe("payment-1");
    expect(result?.invitationId).toBe("invite-uuid-1");
  });

  it("returns null when nothing pending exists", async () => {
    const limit = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) });
    const order = vi.fn().mockReturnValue({ limit });
    const eqStatus = vi.fn().mockReturnValue({ order });
    const eqInvitation = vi.fn().mockReturnValue({ eq: eqStatus });
    const select = vi.fn().mockReturnValue({ eq: eqInvitation });
    mockAdminClient.from.mockReturnValue({ select });

    const result = await findPendingPayment("invite-uuid-1");
    expect(result).toBeNull();
  });
});

describe("createPaymentRecord", () => {
  it("inserts a full row with status=created and a generated idempotency key", async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mockAdminClient.from.mockReturnValue({ insert });

    const result = await createPaymentRecord({
      invitationId: "invite-uuid-1",
      ownerId: "host-1",
      providerOrderId: "ORDER-1",
      tier: "gold",
      expectedAmount: "79.00",
      currency: "USD",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0][0];
    expect(inserted.invitation_id).toBe("invite-uuid-1");
    expect(inserted.owner_id).toBe("host-1");
    expect(inserted.status).toBe("created");
    expect(typeof inserted.idempotency_key).toBe("string");
    expect(inserted.idempotency_key.length).toBeGreaterThan(0);
    expect(result?.id).toBe("payment-1");
  });

  it("returns null (not a throw) on insert error", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mockAdminClient.from.mockReturnValue({ insert });

    const result = await createPaymentRecord({
      invitationId: "invite-uuid-1",
      ownerId: "host-1",
      providerOrderId: "ORDER-1",
      tier: "gold",
      expectedAmount: "79.00",
      currency: "USD",
    });

    expect(result).toBeNull();
  });
});

describe("getPaymentByOrderId — the authoritative order-to-invitation lookup", () => {
  it("scopes the lookup to provider=paypal and the given order id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row });
    const eqOrder = vi.fn().mockReturnValue({ maybeSingle });
    const eqProvider = vi.fn().mockReturnValue({ eq: eqOrder });
    const select = vi.fn().mockReturnValue({ eq: eqProvider });
    mockAdminClient.from.mockReturnValue({ select });

    const result = await getPaymentByOrderId("ORDER-1");

    expect(eqProvider).toHaveBeenCalledWith("provider", "paypal");
    expect(eqOrder).toHaveBeenCalledWith("provider_order_id", "ORDER-1");
    expect(result?.providerOrderId).toBe("ORDER-1");
    expect(result?.ownerId).toBe("host-1");
  });

  it("returns null for an order id we never created a payment row for (reused/unknown order)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null });
    const eqOrder = vi.fn().mockReturnValue({ maybeSingle });
    const eqProvider = vi.fn().mockReturnValue({ eq: eqOrder });
    const select = vi.fn().mockReturnValue({ eq: eqProvider });
    mockAdminClient.from.mockReturnValue({ select });

    const result = await getPaymentByOrderId("NEVER-SEEN-ORDER");
    expect(result).toBeNull();
  });
});

describe("claimPaymentForCapture — the atomic idempotency claim", () => {
  it("returns true and updates to processing when the row was still 'created'", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "payment-1" }] });
    const eqStatus = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mockAdminClient.from.mockReturnValue({ update });

    const claimed = await claimPaymentForCapture("payment-1");

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
    expect(eqId).toHaveBeenCalledWith("id", "payment-1");
    expect(eqStatus).toHaveBeenCalledWith("status", "created");
    expect(claimed).toBe(true);
  });

  it("returns false when a concurrent request already claimed it (conditional update affected zero rows)", async () => {
    const select = vi.fn().mockResolvedValue({ data: [] });
    const eqStatus = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mockAdminClient.from.mockReturnValue({ update });

    const claimed = await claimPaymentForCapture("payment-1");
    expect(claimed).toBe(false);
  });
});

describe("markPaymentCaptured", () => {
  it("persists the capture id, amount, currency and raw response, and flips status to captured", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mockAdminClient.from.mockReturnValue({ update });

    const ok = await markPaymentCaptured("payment-1", {
      captureId: "CAPTURE-1",
      capturedAmount: "79.00",
      currency: "USD",
      rawResponse: { id: "ORDER-1" },
    });

    expect(ok).toBe(true);
    const updated = update.mock.calls[0][0];
    expect(updated.status).toBe("captured");
    expect(updated.provider_capture_id).toBe("CAPTURE-1");
    expect(updated.captured_amount).toBe("79.00");
    expect(eq).toHaveBeenCalledWith("id", "payment-1");
  });

  it("returns false (the 'PayPal succeeded but DB failed' case) on a database error, without throwing", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const update = vi.fn().mockReturnValue({ eq });
    mockAdminClient.from.mockReturnValue({ update });

    const ok = await markPaymentCaptured("payment-1", {
      captureId: "CAPTURE-1",
      capturedAmount: "79.00",
      currency: "USD",
      rawResponse: {},
    });

    expect(ok).toBe(false);
  });
});

describe("markPaymentFailed", () => {
  it("sets status=failed with the given reason", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mockAdminClient.from.mockReturnValue({ update });

    await markPaymentFailed("payment-1", "amount mismatch: got 19.00, expected 149.00");

    const updated = update.mock.calls[0][0];
    expect(updated.status).toBe("failed");
    expect(updated.failure_reason).toBe("amount mismatch: got 19.00, expected 149.00");
  });
});
