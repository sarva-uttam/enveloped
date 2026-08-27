import { NextResponse } from "next/server";
import { markInvitePaid } from "@/lib/storage.server";
import { capturePayPalOrder, paypalConfigured } from "@/lib/paypal";

type Params = { params: Promise<{ orderId: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!paypalConfigured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  const { orderId } = await params;
  const { inviteId } = (await req.json()) as { inviteId?: string };
  if (!inviteId) {
    return NextResponse.json({ error: "inviteId is required." }, { status: 400 });
  }

  try {
    const result = await capturePayPalOrder(orderId);

    if (result.status !== "COMPLETED") {
      return NextResponse.json({ error: `Payment not completed (status: ${result.status}).` }, { status: 402 });
    }

    const marked = await markInvitePaid(inviteId, orderId);
    if (!marked) {
      return NextResponse.json({ error: "Payment succeeded but we couldn't update the invite. Contact support." }, { status: 500 });
    }

    return NextResponse.json({ status: "COMPLETED" });
  } catch (err) {
    console.error("paypal order capture error", err);
    return NextResponse.json({ error: "Could not capture payment. Please try again." }, { status: 502 });
  }
}
