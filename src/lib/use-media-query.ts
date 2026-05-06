import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Returns whether the query currently
 * matches. Re-renders the caller on every change.
 *
 * Used by the AppShell wiring to collapse the right rail to a topbar
 * toggle below a width threshold (per `lpx-explorer-fom`'s acceptance).
 *
 * Tests rely on the matchMedia polyfill in `src/test/setup.ts`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
