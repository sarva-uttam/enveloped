import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { publishInvitation, unpublishInvitation } from "@/lib/invitation-admin.server";

/**
 * Admin-only publish/unpublish — Stage 8 Part I. Thin wrapper around the
 * EXISTING publish_invite()/unpublish_invite() functions (Stage 3);
 * nothing new added to the database. This route does not itself assess
 * publication readiness — the readiness panel (rendered from
 * assessPublicationReadiness()) is what the admin UI shows before this
 * button is ever pressed; publishing an invitation with blocking issues
 * is still technically possible here (the same as an administrator
 * always having final judgment over their own manual action), matching
 * Part I's own framing: "an assessment, not automatic publication" — not
 * a hard technical gate this route enforces.
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
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }

  return NextResponse.json({ ok: true });
}
