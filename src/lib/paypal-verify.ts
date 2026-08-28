/**
 * Pure verification of a PayPal capture response against what WE
 * expected — no network calls, no Supabase, nothing but object
 * inspection, so it's trivial to exhaustively unit test every failure
 * mode (see paypal-verify.test.ts). This is the actual security boundary
 * for payment integrity: everything upstream of this (auth, ownership,
 * idempotency) decides WHETHER to call PayPal at all; this decides
 * whether what PayPal returned actually matches the invitation and price
 * we created the order for, before anything is ever marked paid.
 *
 * Response shape confirmed against PayPal's official Orders v2 API docs
 * (POST /v2/checkout/orders/{id}/capture — developer.paypal.com/api/
 * orders/v2/orders-capture): custom_id lives on purchase_units[], not on
 * the capture itself; the capture record is
 * purchase_units[].payments.captures[], with amount.currency_code/
 * amount.value and its own status (COMPLETED on success); payee info
 * (email_address/merchant_id) is on purchase_units[].payee.
 */

export interface PayPalCaptureBody {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    custom_id?: string;
    payee?: { email_address?: string; merchant_id?: string };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
}

export interface CaptureExpectations {
  /** The PayPal order id we stored for this payment row — must match the captured order's own id. */
  orderId: string;
  /** The invitation's internal uuid (invites.id / payments.invitation_id) — what we set as custom_id at order-creation time (see createPayPalOrder in paypal.ts). Deliberately NOT the slug, so this comparison never needs a second lookup: the payments row already has this value on hand. */
  invitationCustomId: string;
  /** e.g. "USD" — the currency we created the order in. */
  currency: string;
  /** Fixed 2-decimal string, e.g. "19.00" — normalizeAmount() both sides before comparing. */
  expectedAmount: string;
  /**
   * Checked only when provided — this project is single-merchant (the
   * admin's own PayPal account receives every payment, no marketplace/
   * partner split), so when PAYPAL_MERCHANT_EMAIL is configured, the
   * payee on every capture should always match it. Left undefined this
   * check is skipped entirely, not silently "passed" — see the route
   * handler for how that's surfaced.
   */
  expectedPayeeEmail?: string;
}

export type CaptureVerificationResult =
  | { ok: true; captureId: string; capturedAmount: string; capturedCurrency: string }
  // `reason` is for SERVER-SIDE logging/audit only — the route handler
  // must never echo it back in a client-facing response body (generic
  // errors only, so a probing attacker learns nothing about which check
  // failed or why).
  | { ok: false; reason: string };

/** Normalizes a numeric-ish value (PostgREST numeric columns come back as strings; PayPal's amount.value is always a string) to a fixed 2-decimal string for exact comparison. */
export function normalizeAmount(value: string | number): string {
  return Number(value).toFixed(2);
}

export function verifyCaptureResponse(
  body: PayPalCaptureBody,
  expected: CaptureExpectations
): CaptureVerificationResult {
  if (!body.id || body.id !== expected.orderId) {
    return { ok: false, reason: `order id mismatch: got ${body.id ?? "<missing>"}, expected ${expected.orderId}` };
  }

  const unit = body.purchase_units?.[0];
  if (!unit) {
    return { ok: false, reason: "capture response has no purchase_units" };
  }

  if (unit.custom_id !== expected.invitationCustomId) {
    return {
      ok: false,
      reason: `custom_id mismatch: got ${unit.custom_id ?? "<missing>"}, expected ${expected.invitationCustomId}`,
    };
  }

  const capture = unit.payments?.captures?.[0];
  if (!capture || !capture.id) {
    return { ok: false, reason: "capture response has no purchase_units[0].payments.captures[0]" };
  }

  if (capture.status !== "COMPLETED") {
    return { ok: false, reason: `capture status is ${capture.status ?? "<missing>"}, not COMPLETED` };
  }

  if (!capture.amount) {
    return { ok: false, reason: "capture has no amount" };
  }

  if (capture.amount.currency_code !== expected.currency) {
    return {
      ok: false,
      reason: `currency mismatch: got ${capture.amount.currency_code ?? "<missing>"}, expected ${expected.currency}`,
    };
  }

  const capturedAmount = normalizeAmount(capture.amount.value ?? "0");
  const expectedAmount = normalizeAmount(expected.expectedAmount);
  if (capturedAmount !== expectedAmount) {
    return { ok: false, reason: `amount mismatch: got ${capturedAmount}, expected ${expectedAmount}` };
  }

  if (expected.expectedPayeeEmail && unit.payee?.email_address !== expected.expectedPayeeEmail) {
    return {
      ok: false,
      reason: `payee mismatch: got ${unit.payee?.email_address ?? "<missing>"}, expected ${expected.expectedPayeeEmail}`,
    };
  }

  return {
    ok: true,
    captureId: capture.id,
    capturedAmount,
    capturedCurrency: capture.amount.currency_code,
  };
}
