import { checkAdmin } from "@/lib/auth/admin.server";
import { GUEST_IMPORT_TEMPLATE_CSV } from "@/lib/guest-csv";

/** Admin-only downloadable CSV template — a static, fixed file with no
 *  per-invitation data, so a fresh admin always knows the exact expected
 *  column names before mapping their own file against them. */
export async function GET() {
  const { isAdmin } = await checkAdmin();
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Administrator access required." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  return new Response(GUEST_IMPORT_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="guest-import-template.csv"',
    },
  });
}
