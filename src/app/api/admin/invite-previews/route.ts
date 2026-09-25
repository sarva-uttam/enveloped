import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createPreviewLink, rotatePreviewLink, revokePreviewLink } from "@/lib/preview-admin.server";

/**
 * The minimal, admin-only control surface for private preview links —
 * Stage 5 (2026-09-10, see PROJECT_STATUS.md's Stage 5 section).
 * Deliberately NOT a full admin interface: one route, one action per
 * request, no listing, no invitation search/browse (an administrator
 * supplies the invitation's internal uuid directly — see
 * src/app/admin/PreviewLinkTool.tsx, this route's one caller). Building
 * that browsing/search experience is explicitly out of this stage's
 * scope ("do not build the request-management UI yet").
 *
 * Re-verifies admin status itself, at this layer, even though
 * preview-admin.server.ts's own functions ALSO check — the same
 * defense-in-depth shape as the PayPal order route re-stating its
 * ownership check inline rather than trusting a lower layer alone. A
 * non-admin (or signed-out) caller is rejected here, before the request
 * body is even parsed.
 */

const BodySchema = z.object({
  inviteId: z.string().uuid(),
  action: z.enum(["create", "rotate", "revoke"]),
});

export async function POST(req: Request) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { inviteId, action } = parsed.data;

  if (action === "revoke") {
    const result = await revokePreviewLink(inviteId);
    if (!result.ok) {
      return NextResponse.json({ error: revokeErrorMessage(result.reason) }, { status: revokeStatus(result.reason) });
    }
    return NextResponse.json({ revoked: true });
  }

  const result = action === "create" ? await createPreviewLink(inviteId) : await rotatePreviewLink(inviteId);
  if (!result.ok) {
    return NextResponse.json({ error: linkErrorMessage(result.reason) }, { status: linkStatus(result.reason) });
  }

  // The raw token is returned ONCE, in this single response body, and
  // nowhere else — never logged (see preview-admin.server.ts), never
  // persisted server-side beyond the lifetime of this request. The
  // caller (PreviewLinkTool.tsx) is responsible for showing it to the
  // administrator exactly once and never storing it either.
  return NextResponse.json({ token: result.token });
}

function linkErrorMessage(reason: "not-admin" | "invite-not-found" | "already-exists" | "database-error"): string {
  switch (reason) {
    case "not-admin":
      return "Administrator access required.";
    case "invite-not-found":
      return "No invitation (or no existing preview link) matches that id.";
    case "already-exists":
      return "A preview link already exists for this invitation — rotate it instead.";
    case "database-error":
      return "Something went wrong. Please try again.";
  }
}

function linkStatus(reason: "not-admin" | "invite-not-found" | "already-exists" | "database-error"): number {
  switch (reason) {
    case "not-admin":
      return 403;
    case "invite-not-found":
      return 404;
    case "already-exists":
      return 409;
    case "database-error":
      return 500;
  }
}

function revokeErrorMessage(reason: "not-admin" | "not-found" | "database-error"): string {
  switch (reason) {
    case "not-admin":
      return "Administrator access required.";
    case "not-found":
      return "No active preview link matches that invitation id.";
    case "database-error":
      return "Something went wrong. Please try again.";
  }
}

function revokeStatus(reason: "not-admin" | "not-found" | "database-error"): number {
  switch (reason) {
    case "not-admin":
      return 403;
    case "not-found":
      return 404;
    case "database-error":
      return 500;
  }
}
