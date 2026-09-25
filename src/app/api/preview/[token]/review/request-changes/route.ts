import { NextResponse } from "next/server";
import { z } from "zod";
import { getInvitePreviewServer } from "@/lib/storage.server";
import { submitChangeRequest } from "@/lib/review-client.server";
import { checkRequestOrigin, readBoundedJsonBody, checkCooldown } from "@/lib/review-submission-guard.server";
import { isValidPreviewTokenFormat } from "@/lib/preview-tokens.server";
import { FEEDBACK_ITEM_MAX_COUNT, FEEDBACK_MESSAGE_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH, FEEDBACK_CATEGORIES } from "@/lib/review";

/**
 * Anonymous, TOKEN-gated — submits a structured "request changes"
 * decision — Stage 9 Part C/D/F. Re-fetches the invitation's current
 * composition through the SAME token (getInvitePreviewServer(), the
 * exact function /preview/[token]/page.tsx itself already uses to
 * render) purely so submitChangeRequest() can validate each item's
 * optional sectionId against real section ids — never trusts a
 * client-supplied list of "valid" ids.
 */

const ItemSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).nullable().optional(),
  sectionId: z.string().max(64).nullable().optional(),
  message: z.string().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1).max(FEEDBACK_ITEM_MAX_COUNT),
  displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH).nullable().optional(),
});

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
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "This request could not be processed." }, { status: 400 });
  }

  if (!isValidPreviewTokenFormat(token)) {
    return NextResponse.json({ error: "This review is no longer available." }, { status: 409 });
  }

  const preview = await getInvitePreviewServer(token);
  if (!preview) {
    return NextResponse.json({ error: "This review is no longer available." }, { status: 409 });
  }

  const result = await submitChangeRequest(token, { items: parsed.data.items, displayName: parsed.data.displayName ?? null }, preview.composition);
  if (!result.ok) {
    return NextResponse.json({ error: "This review is no longer available." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
