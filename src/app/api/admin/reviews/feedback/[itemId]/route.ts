import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth/admin.server";
import { resolveReviewFeedbackItem } from "@/lib/review-admin.server";

/** Admin-only — resolves ONE structured feedback item, independent of
 *  its parent round's own status — Stage 9 Part G. No body: resolving
 *  is the only action this route performs. */
export async function POST(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { itemId } = await params;
  const result = await resolveReviewFeedbackItem(itemId);
  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }

  return NextResponse.json({ ok: true });
}
