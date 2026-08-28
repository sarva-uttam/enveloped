import type { PayPalCaptureBody } from "./paypal-verify";

const PAYPAL_API_BASE_URL = process.env.PAYPAL_API_BASE_URL || "https://api-m.sandbox.paypal.com";

export const paypalConfigured = Boolean(
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
);

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const auth = Buffer.from(
    `${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_API_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    // refresh a little early to avoid edge-of-expiry failures
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
}

/**
 * Creates a PayPal order server-side for a fixed, trusted amount — never
 * accept an amount from the client. `customId` is the invitation's
 * internal uuid (invites.id, NOT the slug) — stored verbatim as
 * purchase_units[0].custom_id, so at capture time we can compare what
 * PayPal echoes back against the SAME uuid our own `payments` row
 * already has on hand (payments.invitation_id), no extra lookup needed.
 * `idempotencyKey` should be the payment row's own idempotency_key (a
 * uuid we generated and stored ourselves) so a retried order-creation
 * attempt for the SAME payment row reuses the same PayPal-Request-Id,
 * making PayPal's own idempotency guarantee apply, not just ours.
 */
export async function createPayPalOrder(params: {
  priceUsd: string;
  customId: string;
  idempotencyKey: string;
}) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${PAYPAL_API_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "PayPal-Request-Id": params.idempotencyKey,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: params.customId,
          description: "Enveloped digital invite",
          amount: { currency_code: "USD", value: params.priceUsd },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal order create failed: ${res.status} ${body}`);
  }

  const order = (await res.json()) as { id: string };
  return order.id;
}

/**
 * Captures a PayPal order and returns the FULL response body — the
 * caller (the capture route) is responsible for running this through
 * verifyCaptureResponse() (src/lib/paypal-verify.ts) before trusting
 * anything about it. This function does no verification itself, only
 * the network call.
 */
export async function capturePayPalOrder(
  orderId: string,
  idempotencyKey: string
): Promise<{ httpStatus: number; body: PayPalCaptureBody }> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${PAYPAL_API_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "PayPal-Request-Id": idempotencyKey,
    },
  });

  const body = (await res.json()) as PayPalCaptureBody;
  return { httpStatus: res.status, body };
}
