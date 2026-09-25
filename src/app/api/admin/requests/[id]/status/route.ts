import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { updateRequestStatus } from "@/lib/requests-admin.server";
import { REQUEST_STATUSES } from "@/lib/requests";

/**
 * Admin-only request status changes — Stage 8 (see PROJECT_STATUS.md's
 * Stage 8 section, Part B). Same defense-in-depth shape as
 * /api/admin/invite-previews: re-verifies admin status at this layer
 * even though updateRequestStatus() and the database trigger both also
 * check it independently.
 */

const BodySchema = z.object({ status: z.enum(REQUEST_STATUSES) });

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

  const result = await updateRequestStatus(id, parsed.data.status);
  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : result.reason === "invalid-transition" ? 409 : 500;
    const message =
      result.reason === "not-admin"
        ? "Administrator access required."
        : result.reason === "not-found"
          ? "No request matches that id."
          : result.reason === "invalid-transition"
            ? "That status change isn't allowed from the request's current status."
            : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
