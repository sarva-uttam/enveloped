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
 */
export function UnavailableInvite() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Clock className="h-6 w-6 text-ink-soft" aria-hidden="true" />
      <h1 className="font-display text-3xl">This invitation isn&apos;t available</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        The link may be incorrect, or the invitation may not be ready
        yet. Double-check the link you were sent, or reach out to
        whoever shared it with you.
      </p>
      <Link href="/" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
        Go to Enveloped
      </Link>
    </div>
  );
}
