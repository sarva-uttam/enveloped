import "server-only";
import { randomUUID } from "crypto";
import { supabaseAdmin, supabaseAdminConfigured } from "./supabase/admin";

/**
 * Server-only persistence for the `payments` table (see
 * supabase/migrations/20260829000000_payment_integrity.sql). Every
 * function here uses the ADMIN (service-role) client — this is
 * deliberate and matches the table's own RLS: `payments` has no insert/
 * update policy for anon/authenticated at all, so the browser
 * structurally cannot write to it under any circumstances. Ownership
 * checks (does this caller actually own this payment's invitation?) are
 * the ROUTE HANDLER's job, using the value this module returns — this
 * module itself doesn't know or care who's asking, the same way
 * markInvitePaid() in storage.server.ts doesn't.
 */

export type PaymentStatus = "created" | "processing" | "captured" | "failed";

export interface PaymentRecord {
  id: string;
  invitationId: string;
  ownerId: string;
  providerOrderId: string;
  providerCaptureId: string | null;
  tier: string;
  expectedAmount: string;
  capturedAmount: string | null;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
}

interface PaymentRow {
  id: string;
  invitation_id: string;
  owner_id: string;
  provider_order_id: string;
  provider_capture_id: string | null;
  tier: string;
  expected_amount: string;
  captured_amount: string | null;
  currency: string;
  status: PaymentStatus;
  idempotency_key: string;
}

function mapRow(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    invitationId: row.invitation_id,
    ownerId: row.owner_id,
    providerOrderId: row.provider_order_id,
    providerCaptureId: row.provider_capture_id,
    tier: row.tier,
    expectedAmount: row.expected_amount,
    capturedAmount: row.captured_amount,
    currency: row.currency,
    status: row.status,
    idempotencyKey: row.idempotency_key,
  };
}

/**
 * An existing not-yet-captured order for this invitation, if any — used
 * to avoid creating a second outstanding PayPal order for the same
 * invitation on a retried "start checkout" click. Not a hard uniqueness
 * guarantee (nothing stops two rows existing if this races), just a
 * best-effort reuse; the `payments_invitation_status_idx` index keeps
 * this cheap.
 */
export async function findPendingPayment(invitationId: string): Promise<PaymentRecord | null> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return null;

  const { data } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("invitation_id", invitationId)
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapRow(data as PaymentRow) : null;
}

export async function createPaymentRecord(params: {
  invitationId: string;
  ownerId: string;
  providerOrderId: string;
  tier: string;
  expectedAmount: string;
  currency: string;
}): Promise<PaymentRecord | null> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert({
      invitation_id: params.invitationId,
      owner_id: params.ownerId,
      provider: "paypal",
      provider_order_id: params.providerOrderId,
      tier: params.tier,
      expected_amount: params.expectedAmount,
      currency: params.currency,
      status: "created",
      idempotency_key: randomUUID(),
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapRow(data as PaymentRow);
}

export async function getPaymentByOrderId(providerOrderId: string): Promise<PaymentRecord | null> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return null;

  const { data } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("provider", "paypal")
    .eq("provider_order_id", providerOrderId)
    .maybeSingle();

  return data ? mapRow(data as PaymentRow) : null;
}

/**
 * Atomically transitions a payment from "created" to "processing" —
 * this is the idempotency claim: only the request that successfully
 * flips this transition goes on to actually call PayPal's capture API.
 * A concurrent duplicate request (double-click, retry) that loses the
 * race gets `false` back and should treat the payment's THEN-CURRENT
 * state as authoritative instead of calling PayPal itself.
 *
 * Safe under concurrent requests: the conditional `.eq("status", "created")`
 * is evaluated against the row's state at the database, not something
 * read-then-written from application code — two simultaneous UPDATE
 * statements against the same row can't both "win" this condition.
 */
export async function claimPaymentForCapture(paymentId: string): Promise<boolean> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return false;

  const { data } = await supabaseAdmin
    .from("payments")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "created")
    .select("id");

  return Boolean(data && data.length > 0);
}

export async function markPaymentCaptured(
  paymentId: string,
  params: { captureId: string; capturedAmount: string; currency: string; rawResponse: unknown }
): Promise<boolean> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return false;

  const { error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "captured",
      provider_capture_id: params.captureId,
      captured_amount: params.capturedAmount,
      currency: params.currency,
      raw_capture_response: params.rawResponse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  return !error;
}

export async function markPaymentFailed(paymentId: string, reason: string): Promise<void> {
  if (!supabaseAdminConfigured || !supabaseAdmin) return;

  await supabaseAdmin
    .from("payments")
    .update({ status: "failed", failure_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", paymentId);
}
