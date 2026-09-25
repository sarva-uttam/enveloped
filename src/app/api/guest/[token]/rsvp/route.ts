import { NextResponse } from "next/server";
import { submitGuestRsvp } from "@/lib/guest-client.server";
import { checkGuestRequestOrigin, readBoundedGuestJsonBody, checkGuestCooldown } from "@/lib/guest-submission-guard.server";

/**
 * Anonymous, TOKEN-gated — the ONE guest write, Stage 10. The token
 * lives in the URL, never in the body, matching /preview/[token]'s own
 * review-decision routes. POST-only mutation, same origin/cooldown/
 * body-size guard shape as those routes. Deliberately the SAME generic
 * message and status for every rejection reason (bad token, revoked/
 * inactive guest, unpublished invitation, over-limit attendee count,
 * plus-one not permitted, unknown schedule entry, malformed input) —
 * never reveal which.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const originCheck = checkGuestRequestOrigin(req);
  if (!originCheck.ok) {
    return NextResponse.json({ error: "This request could not be processed." }, { status: originCheck.status });
  }

  const { token } = await params;
  if (!checkGuestCooldown(token)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const rawBody = await readBoundedGuestJsonBody(req);
  if (rawBody === null) {
    return NextResponse.json({ error: "This request could not be processed." }, { status: 400 });
  }

  const result = await submitGuestRsvp(token, rawBody);
  if (!result.ok) {
    return NextResponse.json({ error: "This invitation is not currently accepting responses." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
