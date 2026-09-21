"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Root error boundary — must be a Client Component (Next.js requirement
 * for error.tsx). Deliberately generic: `error.message` is never
 * rendered — a server error could carry details that shouldn't reach the
 * client, and this boundary has no way to know whether that's the case.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-6 w-6 text-burgundy" aria-hidden="true" />
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        That&apos;s on us — please try again, and reach out if it keeps happening.
      </p>
      <button
        type="button"
        onClick={reset}
        className="focus-ring rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
      >
        Try again
      </button>
    </div>
  );
}
