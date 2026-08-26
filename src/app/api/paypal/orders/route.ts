import { NextResponse } from "next/server";
import { getInvite } from "@/lib/storage";
import { getTier } from "@/lib/tiers";
import { createPayPalOrder, paypalConfigured } from "@/lib/paypal";

export async function POST(req: Request) {
  if (!paypalConfigured) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  const { inviteId } = (await req.json()) as { inviteId?: string };
  if (!inviteId) {
    return NextResponse.json({ error: "inviteId is required." }, { status: 400 });
  }

  const invite = await getInvite(inviteId);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.paid) {
    return NextResponse.json({ error: "This invite is already paid." }, { status: 409 });
  }

  const tier = getTier(invite.answers.tier || "bronze");

  try {
    const orderId = await createPayPalOrder({ priceUsd: tier.price, inviteId });
    return NextResponse.json({ orderId });
  } catch (err) {
    console.error("paypal order create error", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
