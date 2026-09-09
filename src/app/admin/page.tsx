import { checkAdmin } from "@/lib/auth/admin.server";

export const metadata = { title: "Admin — Enveloped" };

/**
 * Deliberately a placeholder — Stage 2's job is the identity/authorization
 * boundary (see src/app/admin/layout.tsx), not concierge tooling. Request
 * management, the template editor, the invitation editor, the payment
 * interface, and the publication workflow are all explicitly out of
 * scope here; see PROJECT_STATUS.md's Stage 2 section for what's next.
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
    </div>
  );
}
