import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { publishInvitation, unpublishInvitation } from "@/lib/invitation-admin.server";

/**
 * Admin-only publish/unpublish — Stage 8 Part I, hardened in Stage 9
 * Part I for concierge invitations. For a SELF-SERVICE invitation
 * (unchanged since Stage 8), publishing with blocking readiness issues
 * remains technically possible — an assessment, not a gate. For a
 * CONCIERGE invitation, publishInvitation() now enforces readiness,
 * client approval of the current revision, and the absence of an
 * unresolved change request as real preconditions — this route just
 * maps those specific rejection reasons to a clear message.
 */

const BodySchema = z.object({ action: z.enum(["publish", "unpublish"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await params;
  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = parsed.data.action === "publish" ? await publishInvitation(id) : await unpublishInvitation(id);
  if (!result.ok) {
    const status =
      result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : result.reason === "not-ready" || result.reason === "not-approved" || result.reason === "unresolved-changes" ? 409 : 500;
    return NextResponse.json({ error: publishErrorMessage(result.reason) }, { status });
  }

  return NextResponse.json({ ok: true });
}

function publishErrorMessage(reason: string): string {
  switch (reason) {
    case "not-ready":
      return "This invitation has blocking readiness issues — fix them before publishing.";
    case "not-approved":
      return "This invitation has not been approved by the client for its current version yet.";
    case "unresolved-changes":
      return "There is an unresolved change request — resolve it before publishing.";
    case "not-found":
      return "This invitation doesn't exist.";
    default:
      return "Something went wrong. Please try again.";
  }
}
