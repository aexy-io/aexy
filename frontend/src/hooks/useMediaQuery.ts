"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * For the cases where a Tailwind `xl:` class is not enough because JavaScript
 * has to behave differently, not just look different — measuring an element's
 * position is the example here, since there is nothing to measure into when the
 * layout has collapsed to one column.
 *
 * `useSyncExternalStore` rather than an effect so the first client render
 * already has the right answer instead of flashing the wrong branch. It returns
 * false during SSR, which is the mobile-first assumption the layout makes too.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
