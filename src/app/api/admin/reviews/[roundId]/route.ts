import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { markReviewRoundReady, sendReviewRound, cancelReviewRound, resolveReviewRound } from "@/lib/review-admin.server";

/**
 * Admin-only — every subsequent review-round lifecycle action (Stage 9
 * Part G) besides creation itself: mark ready, mark sent, cancel,
 * resolve. One route, one `action` field — the same shape
 * publish/route.ts already uses for publish/unpublish — rather than
 * four near-identical route files for four single-purpose database
 * functions.
 */

const BodySchema = z.object({ action: z.enum(["ready", "send", "cancel", "resolve"]) });

export async function POST(req: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { roundId } = await params;
  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = parsed.data.action;
  const result =
    action === "ready"
      ? await markReviewRoundReady(roundId)
      : action === "send"
        ? await sendReviewRound(roundId)
        : action === "cancel"
          ? await cancelReviewRound(roundId)
          : await resolveReviewRound(roundId);

  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }

  return NextResponse.json({ ok: true });
}
