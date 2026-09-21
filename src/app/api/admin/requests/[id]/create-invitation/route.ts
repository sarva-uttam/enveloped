import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createInvitationFromRequest } from "@/lib/invitation-admin.server";
import { CULTURAL_PACK_IDS } from "@/lib/composition/cultural-packs";

/**
 * Admin-only "create an invitation draft from this request" — Stage 8
 * Part C. One action per request, same shape as every other admin
 * mutation route in this project: re-checks admin status here, before
 * parsing the body, on top of createInvitationFromRequest()'s own check.
 */

const BodySchema = z.object({ packId: z.enum(CULTURAL_PACK_IDS) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await params;
  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a design pack first." }, { status: 400 });
  }

  const result = await createInvitationFromRequest({ requestId: id, packId: parsed.data.packId });

  if (!result.ok) {
    if (result.reason === "already-exists") {
      return NextResponse.json(
        { error: "This request already has an invitation.", existingInvitationId: result.existingInvitationId ?? null },
        { status: 409 }
      );
    }
    const status = result.reason === "not-admin" ? 403 : result.reason === "request-not-found" ? 404 : result.reason === "invalid-pack" ? 400 : 500;
    const message =
      result.reason === "not-admin"
        ? "Administrator access required."
        : result.reason === "request-not-found"
          ? "That request no longer exists."
          : result.reason === "invalid-pack"
            ? "Unknown design pack."
            : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ invitationId: result.invitationId });
}
