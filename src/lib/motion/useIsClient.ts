"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` during server render and the hydration pass, `true` once
 * running on the client — Stage 7 (see PROJECT_STATUS.md's Stage 7
 * section). The `useSyncExternalStore` form (rather than the common
 * `useState(false)` + `useEffect(() => setMounted(true))`) is
 * deliberate: it's the pattern React's own docs recommend for
 * "client-only" gates, it produces NO setState-inside-an-effect (which
 * this project's lint config forbids as a cascading-render risk), and
 * it still guarantees no hydration mismatch — the hydration render sees
 * the server value (`false`), then React re-renders once with the
 * client value.
 *
 * Used by client components that must render exactly the same output as
 * the server on the first pass and only ADD behavior afterwards —
 * EnvelopeOpening.tsx (the overlay is never in server HTML).
 */
const emptySubscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
