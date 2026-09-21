"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A generic, hydration-safe `matchMedia` read — the same
 * `useSyncExternalStore` shape as `useReducedMotion.ts` (see that file's
 * own comment for why this pattern and not `useState`+`useEffect`),
 * generalized to an arbitrary query instead of one hardcoded to
 * `prefers-reduced-motion`. Introduced for `HeroVideo.tsx`'s desktop-vs-
 * mobile video choice, but written generically since any future
 * viewport-dependent client decision can reuse it instead of writing its
 * own `matchMedia` subscription.
 *
 * `serverSnapshot` (default `false`) is deliberately a parameter, not
 * hardcoded like `useReducedMotion`'s always-`false` default: unlike
 * "assume motion is fine," there is no single safe assumption for an
 * arbitrary layout query — a `(min-width: 768px)` caller wants `false`
 * (assume the narrower, more constrained layout server-side, matching
 * mobile-first CSS defaults), but a hypothetical `(max-width: …)` caller
 * would want the opposite. Callers that only ever act on this value
 * AFTER their own `useIsClient()` gate (as HeroVideo.tsx does) never
 * actually observe the server snapshot at all — it only matters for the
 * one synchronous pre-hydration read React's first client commit uses
 * before `subscribe` has run.
 */
export function useMediaQuery(query: string, serverSnapshot = false): boolean {
  // Stable per (query, serverSnapshot) via useCallback — subscribe's
  // identity would otherwise change every render (it closes over
  // `query`), and useSyncExternalStore re-subscribes whenever it does.
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );

  const getSnapshot = useCallback((): boolean => {
    if (typeof window === "undefined") return serverSnapshot;
    return window.matchMedia(query).matches;
  }, [query, serverSnapshot]);

  const getServerSnapshot = useCallback((): boolean => serverSnapshot, [serverSnapshot]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
