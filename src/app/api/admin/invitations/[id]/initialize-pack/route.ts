import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCompositionFromPack, saveInviteComposition } from "@/lib/composition-admin.server";
import { CULTURAL_PACK_IDS } from "@/lib/composition/cultural-packs";

/**
 * Admin-only "initialize this invitation's composition from a pack" —
 * a small extension of Part E's pack-based initialization, generalized
 * to work for ANY invitation the admin editor can open (not only ones
 * just created from a request) so a pre-Stage-6 self-service invitation
 * can also be brought into the structured generator. Reuses
 * buildCompositionFromPack() + saveInviteComposition() verbatim — no new
 * composition-building logic. Only usable while the invitation has no
 * composition yet (checked by requiring expectedRevision from the
 * caller, which the editor only offers this action for when
 * composition is null).
 */

const BodySchema = z.object({ packId: z.enum(CULTURAL_PACK_IDS), expectedRevision: z.number().int().min(0) });

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

  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });

  const { data: invite, error: readError } = await client.from("invites").select("category").eq("id", id).maybeSingle();
  if (readError || !invite) {
    return NextResponse.json({ error: "This invitation doesn't exist." }, { status: 404 });
  }

  const composition = buildCompositionFromPack({ packId: parsed.data.packId, eventCategory: invite.category });
  if (!composition) {
    return NextResponse.json({ error: "Unknown design pack." }, { status: 400 });
  }

  const result = await saveInviteComposition({ inviteId: id, composition, expectedRevision: parsed.data.expectedRevision });
  if (!result.ok) {
    const status = result.reason === "stale-revision" ? 409 : result.reason === "invite-not-found" ? 404 : 500;
    return NextResponse.json({ error: "Something went wrong. Reload and try again.", reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, composition, revision: result.revision });
}
