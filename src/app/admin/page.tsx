import { checkAdmin } from "@/lib/auth/admin.server";
import { PreviewLinkTool } from "./PreviewLinkTool";

export const metadata = { title: "Admin — Enveloped" };

/**
 * Still deliberately a placeholder for the concierge admin editor —
 * Stage 2's job was the identity/authorization boundary (see
 * src/app/admin/layout.tsx). Request management, the template editor,
 * the invitation editor, the payment interface, and the publication
 * workflow all remain out of scope here; see PROJECT_STATUS.md's Stage 2
 * section for what's still next.
 *
 * Stage 5 (2026-09-10, see PROJECT_STATUS.md's Stage 5 section) adds
 * exactly one thing: PreviewLinkTool, the minimal admin-only control for
 * private preview links — deliberately NOT a full admin interface (no
 * invitation search/browse; an administrator supplies the invitation's
 * uuid directly), permitted explicitly by this stage's own scope ("a
 * minimal admin-only control may be added if required, but avoid
 * designing the generator interface").
 *
 * By the time this component renders, AdminLayout has already verified
 * (server-side, against the real database) that the caller is signed in
 * AND is an administrator — this page trusts that and does no check of
 * its own, matching every other route in this app: the layout is the
 * boundary, not each individual page re-deriving the same fact.
 */
export default async function AdminPage() {
  const { user } = await checkAdmin();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl">Admin dashboard</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Signed in as <span className="font-medium text-ink">{user?.email}</span>.
      </p>
      <p className="mt-6 max-w-md text-sm text-ink-soft">
        This is a placeholder. Concierge tools — client requests, the
        template catalogue, and payment records — aren&apos;t built yet.
      </p>

      <PreviewLinkTool />
    </div>
  );
}
