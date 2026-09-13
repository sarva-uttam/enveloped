import { NextResponse } from "next/server";
import { z } from "zod";
import { submitApproval } from "@/lib/review-client.server";
import { checkRequestOrigin, readBoundedJsonBody, checkCooldown } from "@/lib/review-submission-guard.server";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/review";

/**
 * Anonymous, TOKEN-gated — submits an approval decision for the
 * invitation's currently active review round — Stage 9 Part C/F. The
 * token lives in the URL (the same place /preview/[token] itself puts
 * it), never in the body, matching how a preview link already works;
 * this route exists specifically so a decision submission stays
 * confined to its own narrow POST boundary rather than needing a GET
 * route to also accept side-effecting writes.
 *
 * Opening a preview must never itself approve or reject anything (Part
 * F) — this route is the ONLY code path that can transition a round to
 * client_approved, and it only ever runs on an explicit POST triggered
 * by a deliberate button press in the client UI.
 */

const BodySchema = z.object({ displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH).nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const originCheck = checkRequestOrigin(req);
  if (!originCheck.ok) {
    return NextResponse.json({ error: "This request could not be processed." }, { status: originCheck.status });
  }

  const { token } = await params;
  if (!checkCooldown(token)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const rawBody = await readBoundedJsonBody(req);
  const parsed = BodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "This request could not be processed." }, { status: 400 });
  }

  const result = await submitApproval(token, parsed.data.displayName ?? null);
  if (!result.ok) {
    // Deliberately the SAME generic message and status for every
    // failure reason (bad token, wrong round status, stale revision,
    // lost race, malformed input) — Part C: never reveal which.
    return NextResponse.json({ error: "This review is no longer available." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
