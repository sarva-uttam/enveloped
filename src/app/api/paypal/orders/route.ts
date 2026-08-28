import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInviteServer } from "@/lib/storage.server";
import { getTier } from "@/lib/tiers";
import { createPayPalOrder, paypalConfigured } from "@/lib/paypal";
import { findPendingPayment, createPaymentRecord } from "@/lib/payments.server";

// Matches the shape slugify() (src/lib/utils.ts) + the survey's
// `${slug}-${Date.now().toString(36)}` suffix always produce — a light
// allowlist, defense in depth beyond the parameterized Supabase queries
// this value ultimately flows into.
const BodySchema = z.object({
  inviteId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "inviteId must be a valid invite slug"),
});

export async function POST(req: Request) {
  if (!paypalConfigured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { inviteId } = parsed.data;

  // Require the authenticated invitation owner to initiate checkout.
  // getInviteServer() is already RLS-scoped to the owner (a non-owner or
  // a genuinely missing invite both come back null), but the explicit
  // user/ownership checks below state that requirement directly in this
  // route's own logic rather than leaning entirely on an implicit RLS
  // side effect two files away.
  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in to do that." }, { status: 401 });
  }

  const invite = await getInviteServer(inviteId);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.ownerId !== user.id) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }
  if (invite.paid) {
    return NextResponse.json({ error: "This invite is already paid." }, { status: 409 });
  }

  // Authoritative server-side pricing — the tier is what the owner chose
  // at survey time (stored on the invite, never re-derived from anything
  // this request sends), and the price for that tier comes from the
  // fixed TIERS table (src/lib/tiers.ts), never from the client.
  const tier = getTier(invite.answers.tier || "bronze");
  const expectedAmount = tier.price.toFixed(2);

  // Reuse an already-pending order for this invitation instead of
  // creating a second outstanding PayPal order on a retried click.
  const existing = await findPendingPayment(invite.internalId);
  if (existing) {
    return NextResponse.json({ orderId: existing.providerOrderId });
  }

  try {
    const orderId = await createPayPalOrder({
      priceUsd: expectedAmount,
      // The invitation's internal uuid, NOT the slug — see paypal.ts's
      // createPayPalOrder doc comment for why: it lets capture-time
      // verification compare directly against payments.invitation_id
      // with no extra lookup.
      customId: invite.internalId,
      // A fresh key per order-creation attempt is fine here — this path
      // isn't retried with the SAME key (the findPendingPayment() check
      // above is what prevents duplicate orders on a retried click, by
      // reusing the previously created order instead of calling PayPal
      // again at all).
      idempotencyKey: crypto.randomUUID(),
    });

    const payment = await createPaymentRecord({
      invitationId: invite.internalId,
      ownerId: user.id,
      providerOrderId: orderId,
      tier: tier.id,
      expectedAmount,
      currency: "USD",
    });

    if (!payment) {
      // PayPal succeeded but we couldn't persist the record — the order
      // exists on PayPal's side but we have no local row to verify a
      // capture against, so a capture attempt against it would correctly
      // fail closed (see the capture route: unknown orders are rejected).
      // The order simply expires unused on PayPal's side after ~3 hours.
      console.error("paypal order created but payments insert failed", { orderId, inviteId });
      return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ orderId });
  } catch (err) {
    console.error("paypal order create error", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
