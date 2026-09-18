import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth/admin.server";
import { listHouseholds, createHousehold } from "@/lib/guest-admin.server";
import { HOUSEHOLD_NAME_MAX_LENGTH } from "@/lib/guests";

const BodySchema = z.object({ name: z.string().trim().min(1).max(HOUSEHOLD_NAME_MAX_LENGTH) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { id } = await params;
  return NextResponse.json({ households: await listHouseholds(id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await createHousehold(id, parsed.data.name);
  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "invalid-input" ? 400 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }
  return NextResponse.json({ ok: true, householdId: result.householdId });
}
