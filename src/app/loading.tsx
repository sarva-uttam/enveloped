import { Loader2 } from "lucide-react";

/** A minimal, non-jarring loading state for route-level Suspense boundaries. */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-ink-soft" aria-hidden="true" />
      <span className="text-sm text-ink-soft">Loading&hellip;</span>
    </div>
  );
}
