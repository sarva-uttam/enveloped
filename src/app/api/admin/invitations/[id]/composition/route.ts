import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { saveInviteComposition } from "@/lib/composition-admin.server";
import { EVENT_TYPE_IDS } from "@/lib/composition/event-types";

/**
 * Admin-only composition save — Stage 8 Part G. The full, validated
 * composition document plus the revision the editor last read
 * (`expectedRevision`) travel together in every request; the database
 * (admin_save_invite_composition()) performs the actual compare-and-
 * swap. This route's own job is authorization (re-checked here, on top
 * of saveInviteComposition()'s own check) and translating its typed
 * result into an HTTP response — never re-implementing the concurrency
 * check itself.
 */

const BodySchema = z.object({
  composition: z.unknown(),
  expectedRevision: z.number().int().min(0),
  occasionId: z.enum(EVENT_TYPE_IDS).nullable().optional(),
  occasionCustomLabel: z.string().max(120).nullable().optional(),
});

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

  const result = await saveInviteComposition({
    inviteId: id,
    composition: parsed.data.composition,
    expectedRevision: parsed.data.expectedRevision,
    occasionId: parsed.data.occasionId ?? null,
    occasionCustomLabel: parsed.data.occasionCustomLabel ?? null,
  });

  if (!result.ok) {
    const status =
      result.reason === "not-admin"
        ? 403
        : result.reason === "invite-not-found"
          ? 404
          : result.reason === "stale-revision"
            ? 409
            : result.reason === "invalid"
              ? 422
              : 500;
    const message =
      result.reason === "not-admin"
        ? "Administrator access required."
        : result.reason === "invite-not-found"
          ? "This invitation no longer exists."
          : result.reason === "stale-revision"
            ? "Someone else saved a newer version of this invitation. Reload before continuing — your changes here were not saved."
            : result.reason === "invalid"
              ? "This composition doesn't pass validation — check the highlighted fields."
              : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message, reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, revision: result.revision });
}
