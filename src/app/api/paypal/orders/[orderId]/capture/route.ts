import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { markInvitePaid } from "@/lib/storage.server";
import { capturePayPalOrder, paypalConfigured } from "@/lib/paypal";
import { verifyCaptureResponse } from "@/lib/paypal-verify";
import {
  getPaymentByOrderId,
  claimPaymentForCapture,
  markPaymentCaptured,
  markPaymentFailed,
} from "@/lib/payments.server";

type Params = { params: Promise<{ orderId: string }> };

// PayPal order ids are alphanumeric (observed: uppercase + digits), but we
// don't need to be that strict — just enough to reject obvious junk before
// it reaches a query.
const ParamsSchema = z.object({
  orderId: z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, "invalid order id"),
});

// inviteId is accepted ONLY for a friendlier, faster error when the client
// is confused about what it's paying for — it is NEVER used to decide
// which invitation this capture unlocks. That decision always comes from
// the payments row looked up by orderId (see getPaymentByOrderId below),
// which is the one thing a browser cannot influence. Optional because a
// legitimate capture must succeed even if this field is missing or stale.
const BodySchema = z.object({
  inviteId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const GENERIC_ERROR = "Could not capture payment. Please try again or contact support.";

export async function POST(req: Request, { params }: Params) {
  if (!paypalConfigured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  const paramsParsed = ParamsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { orderId } = paramsParsed.data;

  const rawBody = await req.json().catch(() => ({}));
  const bodyParsed = BodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Require the authenticated invitation owner — a signed-out caller, or
  // one signed in as someone else, can never trigger a capture, which is
  // what would otherwise let a non-owner pay for (and thereby publish)
  // someone else's invitation.
  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in to do that." }, { status: 401 });
  }

  // THE AUTHORITATIVE lookup: which invitation (and owner, tier, and
  // amount) this order belongs to comes ONLY from our own stored payments
  // row, found by the PayPal order id — never from the client-supplied
  // inviteId above. This is what makes it impossible for one order to
  // unlock a different invitation than the one it was created for, no
  // matter what the request body claims.
  const payment = await getPaymentByOrderId(orderId);
  if (!payment) {
    // Also the "reused/unknown order" case: an orderId that isn't one we
    // ever created a payments row for (fabricated, or lifted from
    // elsewhere) is rejected here before anything else runs.
    return NextResponse.json({ error: "Unknown order." }, { status: 404 });
  }

  if (payment.ownerId !== user.id) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  // Idempotent short-circuit: this order was already captured and
  // verified in an earlier call. Re-running markInvitePaid() here is
  // deliberate, not wasted work — it's the recovery path for "PayPal
  // succeeded but the database update failed": if the invite flip didn't
  // land last time, this retries ONLY that step, without contacting
  // PayPal again (capturePayPalOrder is never called on this branch).
  if (payment.status === "captured") {
    const marked = await markInvitePaid(payment.invitationId, orderId);
    if (!marked) {
      console.error("paypal capture: recovery markInvitePaid failed", { orderId, paymentId: payment.id });
      return NextResponse.json(
        { error: "Payment succeeded but we couldn't update the invite. Contact support." },
        { status: 500 }
      );
    }
    return NextResponse.json({ status: "COMPLETED" });
  }

  if (payment.status === "failed") {
    // A previous verification attempt already rejected this order — don't
    // give a second attempt a chance to succeed via a different code path.
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 402 });
  }

  // Atomically claim this payment before calling PayPal at all — only the
  // request that wins this transition proceeds. A concurrent duplicate
  // (double-click, retried request) that loses the race falls through to
  // the 409 below instead of calling PayPal's capture endpoint a second
  // time for the same order.
  if (payment.status === "created") {
    const claimed = await claimPaymentForCapture(payment.id);
    if (!claimed) {
      return NextResponse.json(
        { error: "This payment is already being processed. Please wait a moment and refresh." },
        { status: 409 }
      );
    }
  } else if (payment.status === "processing") {
    // Another in-flight request already claimed this payment and hasn't
    // finished yet — don't call PayPal from here too.
    return NextResponse.json(
      { error: "This payment is already being processed. Please wait a moment and refresh." },
      { status: 409 }
    );
  }

  try {
    const { httpStatus, body } = await capturePayPalOrder(orderId, payment.idempotencyKey);

    if (httpStatus < 200 || httpStatus >= 300) {
      console.error("paypal capture: non-2xx response", { orderId, httpStatus, body });
      await markPaymentFailed(payment.id, `capture http ${httpStatus}: ${JSON.stringify(body)}`);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 402 });
    }

    // Verify EVERYTHING against our own stored expectations — never trust
    // that a 2xx response means this capture is for the right order, the
    // right invitation, or the right amount. This is what prevents a
    // Bronze-tier payment from unlocking a higher tier, and what confirms
    // the capture is genuinely completed rather than pending/denied.
    const result = verifyCaptureResponse(body, {
      orderId: payment.providerOrderId,
      invitationCustomId: payment.invitationId,
      currency: payment.currency,
      expectedAmount: payment.expectedAmount,
      expectedPayeeEmail: process.env.PAYPAL_MERCHANT_EMAIL || undefined,
    });

    if (!result.ok) {
      console.error("paypal capture: verification failed", { orderId, paymentId: payment.id, reason: result.reason });
      await markPaymentFailed(payment.id, result.reason);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 402 });
    }

    const captured = await markPaymentCaptured(payment.id, {
      captureId: result.captureId,
      capturedAmount: result.capturedAmount,
      currency: result.capturedCurrency,
      rawResponse: body,
    });

    if (!captured) {
      // PayPal genuinely captured the money and we verified it, but our
      // own record of that fact failed to persist. Do NOT mark the invite
      // paid off an unrecorded capture — surface the generic "contact
      // support" error instead. The payment row is still in "processing"
      // (not "captured"), so a manual retry of this same request will
      // reach this exact branch again and can be resolved by re-running
      // markPaymentCaptured by hand if this ever actually happens; it is
      // never silently lost since the raw response was already logged
      // above.
      console.error("paypal capture: verified but markPaymentCaptured failed", { orderId, paymentId: payment.id });
      return NextResponse.json(
        { error: "Payment succeeded but we couldn't record it. Contact support." },
        { status: 500 }
      );
    }

    const marked = await markInvitePaid(payment.invitationId, orderId);
    if (!marked) {
      // "PayPal succeeded but the database update failed" — the payment
      // row is already durably marked "captured" above, independent of
      // this step, so a retried capture request for the same orderId will
      // hit the idempotent "already captured" branch near the top of this
      // function and retry ONLY this invite flip, without contacting
      // PayPal again.
      console.error("paypal capture: markInvitePaid failed after successful capture", { orderId, paymentId: payment.id });
      return NextResponse.json(
        { error: "Payment succeeded but we couldn't update the invite. Contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "COMPLETED" });
  } catch (err) {
    console.error("paypal capture error", err);
    await markPaymentFailed(payment.id, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
  }
}
