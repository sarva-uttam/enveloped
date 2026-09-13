import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth/admin.server";
import { deleteHousehold } from "@/lib/guest-admin.server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { householdId } = await params;
  const result = await deleteHousehold(householdId);
  if (!result.ok) {
    const status = result.reason === "not-admin" ? 403 : result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
  }
  return NextResponse.json({ ok: true });
}
