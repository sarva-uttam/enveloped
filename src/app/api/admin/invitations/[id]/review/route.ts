import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createReviewRound } from "@/lib/review-admin.server";

/**
 * Admin-only — starts a new review round for this invitation, bound to
 * its current composition revision — Stage 9 Part G. No request body:
 * there is nothing for the caller to supply beyond the invitation id
 * already in the URL (matching create-invitation's own "structured
 * action, not a generic form post" shape).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await params;
  const result = await createReviewRound(id);
  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "invite-not-found" ? 404 : result.reason === "already-active" ? 409 : 500;
    return NextResponse.json({ error: reviewCreateErrorMessage(result.reason) }, { status });
  }

  return NextResponse.json({ reviewRoundId: result.reviewRoundId });
}

function reviewCreateErrorMessage(reason: string): string {
  switch (reason) {
    case "not-admin":
      return "Administrator access required.";
    case "invite-not-found":
      return "This invitation doesn't exist.";
    case "already-active":
      return "An active review round already exists for this invitation.";
    default:
      return "Something went wrong. Please try again.";
  }
}
