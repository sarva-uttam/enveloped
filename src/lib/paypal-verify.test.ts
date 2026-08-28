import { describe, it, expect } from "vitest";
import { verifyCaptureResponse, normalizeAmount, type PayPalCaptureBody } from "./paypal-verify";

// Exhaustive tests of the actual security boundary: everything upstream
// (auth, ownership, idempotency) only decides WHETHER to call PayPal —
// this decides whether what PayPal returned actually matches the
// invitation/tier/price we created the order for. No network, no
// Supabase — pure object inspection, so every failure mode is cheap to
// cover here directly.

const baseExpected = {
  orderId: "ORDER-1",
  invitationCustomId: "11111111-1111-1111-1111-111111111111",
  currency: "USD",
  expectedAmount: "19.00",
};

function baseBody(overrides: Partial<PayPalCaptureBody> = {}): PayPalCaptureBody {
  return {
    id: "ORDER-1",
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "11111111-1111-1111-1111-111111111111",
        payee: { email_address: "merchant@example.com" },
        payments: {
          captures: [
            {
              id: "CAPTURE-1",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "19.00" },
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe("normalizeAmount", () => {
  it("formats numbers and numeric strings to a fixed 2-decimal string", () => {
    expect(normalizeAmount("19")).toBe("19.00");
    expect(normalizeAmount("19.5")).toBe("19.50");
    expect(normalizeAmount(19)).toBe("19.00");
    expect(normalizeAmount("19.004")).toBe("19.00");
  });
});

describe("verifyCaptureResponse — success", () => {
  it("passes and returns the captured amount/currency/id when everything matches", () => {
    const result = verifyCaptureResponse(baseBody(), baseExpected);
    expect(result).toEqual({
      ok: true,
      captureId: "CAPTURE-1",
      capturedAmount: "19.00",
      capturedCurrency: "USD",
    });
  });

  it("passes even when expectedPayeeEmail is not supplied (check is skipped, not failed)", () => {
    const result = verifyCaptureResponse(baseBody({ purchase_units: [{ ...baseBody().purchase_units![0], payee: undefined }] }), baseExpected);
    expect(result.ok).toBe(true);
  });

  it("passes when the payee email matches an explicitly expected one", () => {
    const result = verifyCaptureResponse(baseBody(), { ...baseExpected, expectedPayeeEmail: "merchant@example.com" });
    expect(result.ok).toBe(true);
  });
});

describe("verifyCaptureResponse — order id mismatch (reused/wrong order)", () => {
  it("fails when the response's order id doesn't match the stored payment's order id", () => {
    const result = verifyCaptureResponse(baseBody({ id: "SOME-OTHER-ORDER" }), baseExpected);
    expect(result.ok).toBe(false);
  });

  it("fails when the response is missing an id entirely", () => {
    const result = verifyCaptureResponse(baseBody({ id: undefined }), baseExpected);
    expect(result.ok).toBe(false);
  });
});

describe("verifyCaptureResponse — wrong invitation (custom_id mismatch)", () => {
  it("fails when purchase_units is empty — no invitation association at all", () => {
    const result = verifyCaptureResponse(baseBody({ purchase_units: [] }), baseExpected);
    expect(result.ok).toBe(false);
  });

  it("fails when custom_id belongs to a different invitation", () => {
    const body = baseBody();
    body.purchase_units![0].custom_id = "22222222-2222-2222-2222-222222222222";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/custom_id mismatch/);
  });
});

describe("verifyCaptureResponse — capture status not genuinely completed", () => {
  it("fails when there is no captures array at all", () => {
    const body = baseBody();
    body.purchase_units![0].payments = {};
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
  });

  it("fails when capture status is PENDING, not COMPLETED", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].status = "PENDING";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not COMPLETED/);
  });

  it("fails when capture status is DECLINED", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].status = "DECLINED";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
  });
});

describe("verifyCaptureResponse — wrong currency", () => {
  it("fails when the captured currency differs from what the order was created in", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].amount!.currency_code = "EUR";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/currency mismatch/);
  });

  it("fails when amount is missing entirely", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].amount = undefined;
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
  });
});

describe("verifyCaptureResponse — wrong amount (the Bronze-unlocks-Platinum case)", () => {
  it("fails when the captured amount is less than expected", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].amount!.value = "19.00";
    // Bronze ($19) captured, but this payment row expected a Platinum price.
    const result = verifyCaptureResponse(body, { ...baseExpected, expectedAmount: "149.00" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/amount mismatch/);
  });

  it("fails on even a one-cent discrepancy", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].amount!.value = "18.99";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(false);
  });

  it("passes when amounts match after normalization (e.g. '19' vs '19.00')", () => {
    const body = baseBody();
    body.purchase_units![0].payments!.captures![0].amount!.value = "19";
    const result = verifyCaptureResponse(body, baseExpected);
    expect(result.ok).toBe(true);
  });
});

describe("verifyCaptureResponse — payee mismatch", () => {
  it("fails when a specific merchant email is expected but the payee differs", () => {
    const result = verifyCaptureResponse(baseBody(), { ...baseExpected, expectedPayeeEmail: "someone-else@example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/payee mismatch/);
  });

  it("fails when a merchant email is expected but payee is entirely missing", () => {
    const body = baseBody({ purchase_units: [{ ...baseBody().purchase_units![0], payee: undefined }] });
    const result = verifyCaptureResponse(body, { ...baseExpected, expectedPayeeEmail: "merchant@example.com" });
    expect(result.ok).toBe(false);
  });
});
