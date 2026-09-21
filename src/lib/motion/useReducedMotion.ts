"use client";

import { useSyncExternalStore } from "react";

/**
 * The one place this project ever reads `prefers-reduced-motion` —
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part B). Used by
 * every motion-bearing client component (AnimateIn.tsx,
 * EnvelopeOpening.tsx, AtmosphericEffect.tsx) so reduced-motion handling
 * is one small, testable primitive, not a scattered set of independent
 * `matchMedia` calls that could drift out of sync with each other.
 *
 * `useSyncExternalStore`, not `useState`+`useEffect` — avoids a
 * hydration mismatch the naive version would have (server always
 * renders as if motion is preferred, since `window` doesn't exist
 * there; if the client's FIRST render read the real browser preference
 * synchronously via useState's initializer, React would warn about a
 * server/client markup mismatch the instant a real reduced-motion user
 * loaded the page). `getServerSnapshot()` returns `false` — the server
 * always assumes motion is fine, exactly matching what every
 * non-reduced-motion visitor's browser will also report, so the common
 * case never needs a post-hydration correction; only a genuinely
 * reduced-motion visitor sees this settle from `false` to `true` within
 * the same synchronous commit their first paint happens in (React
 * itself guarantees `useSyncExternalStore` reads the true client value
 * before the browser paints, so there is no flash of un-reduced motion
 * visible to them either — this is precisely the problem the hook
 * exists to solve, not a workaround with a visible gap).
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
