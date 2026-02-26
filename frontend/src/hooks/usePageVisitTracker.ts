/**
 * Page Visit Tracker Hook
 * Batches page visit counts in-memory and flushes to server periodically.
 * Call once in the app layout to track all navigation.
 */

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { dashboardApi } from "@/lib/api";

const FLUSH_INTERVAL_MS = 30_000; // Flush every 30 seconds
const SKIP_PATHS = new Set(["/", "/dashboard"]);

/** Normalize to top-level route: /crm/inbox → /crm */
function normalizePath(pathname: string): string {
  const parts = pathname.replace(/^\//, "").split("/");
  return `/${parts[0]}`;
}

// Module-level batch so it survives re-renders but not page refresh
let pendingVisits: Record<string, number> = {};

export function usePageVisitTracker() {
  const pathname = usePathname();
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const batch = pendingVisits;
    if (Object.keys(batch).length === 0) return;

    // Swap out the batch atomically
    pendingVisits = {};

    dashboardApi.trackPageVisits(batch).catch(() => {
      // On failure, merge back into pending for next flush
      for (const [path, count] of Object.entries(batch)) {
        pendingVisits[path] = (pendingVisits[path] || 0) + count;
      }
    });
  }, []);

  // Accumulate visit on pathname change (debounced 1s)
  useEffect(() => {
    if (!pathname || SKIP_PATHS.has(pathname)) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const normalized = normalizePath(pathname);
      pendingVisits[normalized] = (pendingVisits[normalized] || 0) + 1;
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [pathname]);

  // Periodic flush + flush on tab close
  useEffect(() => {
    flushTimerRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleUnload = () => flush();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
      window.removeEventListener("beforeunload", handleUnload);
      // Flush remaining on unmount
      flush();
    };
  }, [flush]);
}
