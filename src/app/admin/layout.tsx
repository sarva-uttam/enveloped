import { redirect } from "next/navigation";
import Link from "next/link";
import { checkAdmin } from "@/lib/auth/admin.server";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";

/**
 * The authorization boundary for every route under /admin/*. Any future
 * concierge page (requests, templates, payment records — none built
 * yet, see PROJECT_STATUS.md's Stage 2 section on scope) automatically
 * inherits this check just by living under src/app/admin/ — it never
 * needs to re-implement it.
 *
 * This layout is the REAL boundary — it always re-verifies both
 * authentication and admin status server-side via checkAdmin(), which
 * calls the actual is_admin() database function through the session-
 * aware server client. src/proxy.ts's /admin entry (added alongside
 * this) is only an OPTIMISTIC, session-presence-only fast path for a
 * nicer redirect before any React rendering starts — it does not, and
 * structurally cannot, check admin status itself (see proxy.ts's own
 * comment on why database calls don't belong in Proxy). Even if proxy.ts
 * were deleted entirely, this layout alone would still correctly gate
 * every request — this page being unreachable through the UI, or a
 * client sending no query params, guarantees nothing on its own; the
 * database check on every render is what does.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user, isAdmin } = await checkAdmin();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(sanitizeRedirectPath("/admin"))}`);
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl">Access denied</h1>
        <p className="max-w-sm text-sm text-ink-soft">
          You&apos;re signed in, but this account doesn&apos;t have administrator access.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-ink underline underline-offset-4">
          Back to my invites
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-line px-6 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Admin</span>
      </div>
      {children}
    </div>
  );
}
