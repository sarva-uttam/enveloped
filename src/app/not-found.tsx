import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Stage 11 — Next.js had no styled not-found.tsx/error.tsx/loading.tsx
 * anywhere in the app before this; unmatched routes fell through to
 * Next's default, unstyled fallback. Visually echoes
 * src/components/invite/UnavailableInvite.tsx's icon+heading+body+CTA
 * shape, but — unlike that component — this one CAN be specific, since a
 * generic "page not found" carries no risk of confirming or denying the
 * existence of any private invitation/guest/preview resource.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Compass className="h-6 w-6 text-ink-soft" aria-hidden="true" />
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist, or may have moved.
      </p>
      <Link href="/" className="focus-ring rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
        Go to Enveloped
      </Link>
    </div>
  );
}
