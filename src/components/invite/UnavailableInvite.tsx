import Link from "next/link";
import { Clock } from "lucide-react";

/**
 * The ONE safe response for every reason an invitation might not be
 * viewable — Stage 4 (see PROJECT_STATUS.md). Deliberately used for all
 * of: the slug doesn't exist, the invitation exists but isn't published
 * yet, a supplied guest token didn't resolve to anything, and (were it
 * ever reachable here, which it isn't in the public flow) an invitation
 * belonging to someone else. The wording below is written to be
 * genuinely true in every one of those cases without confirming or
 * denying which one applies — never say "we couldn't find that" (implies
 * non-existence) or "not published yet" (confirms existence) separately;
 * this replaces both of the pre-Stage-4 NotFound/NotPublishedYet
 * components, which leaked exactly that distinction.
 *
 * Stage 5 (2026-09-10, see PROJECT_STATUS.md): reused, unmodified in
 * substance, for two more "collapse every reason into one safe response"
 * cases — an invalid/malformed/rotated/revoked private preview token
 * (src/app/preview/[token]/page.tsx), and, in the owner-management route
 * (src/app/dashboard/invite/[id]/page.tsx), BOTH "this invite doesn't
 * exist" and "you're signed in, but this isn't your invite" collapsed
 * into the same response — "another authenticated user must receive a
 * safe denied/not-found response," never a distinguishable one.
 * `homeHref`/`homeLabel` are the only variation allowed: where the one
 * action link goes, not what the message says about why it's here.
 */
export function UnavailableInvite({
  homeHref = "/",
  homeLabel = "Go to Enveloped",
}: {
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Clock className="h-6 w-6 text-ink-soft" aria-hidden="true" />
      <h1 className="font-display text-3xl">This invitation isn&apos;t available</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        The link may be incorrect, or the invitation may not be ready
        yet. Double-check the link you were sent, or reach out to
        whoever shared it with you.
      </p>
      <Link href={homeHref} className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
        {homeLabel}
      </Link>
    </div>
  );
}
