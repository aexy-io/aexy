/**
 * Frontend error reporter (UX-LE-005).
 *
 * Bridges to whatever error backend the deployment is wired to. The
 * default Aexy install doesn't bundle a Sentry SDK — operators add
 * it later by setting up `<Script>` in `_app` or `layout.tsx` so
 * `window.Sentry` exposes `captureException`. This module probes for
 * that at call time and forwards if present; otherwise it falls
 * back to a structured console.error so DevTools logs still carry
 * the digest + module context.
 *
 * Two design constraints:
 *
 * 1. The reporter itself must never throw. ModuleError fires it
 *    while it's ALREADY rendering an error UI — a second throw
 *    would crash the boundary. Wrap every external touchpoint in
 *    try/catch.
 *
 * 2. Safe to call from server-rendered code paths. Next.js
 *    error.tsx pages can run on the server during SSR; `window` is
 *    undefined there. Bail cleanly instead of crashing.
 */

interface ReportContext {
  /** Next.js's per-error digest — opaque hash that points at the
   *  server log entry. Surfacing this on the Sentry issue is how an
   *  operator correlates the two. */
  digest?: string;
  /** Free-form tags. We forward each key as a Sentry tag so they're
   *  filterable on the Sentry dashboard. Don't put PII here — tags
   *  are indexed + visible to anyone with project access. */
  context?: Record<string, string | number | boolean>;
}

interface SentryLike {
  captureException: (
    err: unknown,
    options?: { tags?: Record<string, string | number | boolean> },
  ) => void;
}

/** Probe the global for a Sentry-shaped object. Returns null on SSR
 *  or when no Sentry SDK is installed. Wrapped in a try because some
 *  global access can throw under strict CSP. */
function getSentry(): SentryLike | null {
  try {
    if (typeof window === "undefined") return null;
    const sentry = (window as unknown as { Sentry?: SentryLike }).Sentry;
    if (sentry && typeof sentry.captureException === "function") return sentry;
    return null;
  } catch {
    return null;
  }
}


export function reportError(error: unknown, ctx: ReportContext = {}): void {
  // SSR safety: if `window` doesn't exist we have nothing to report
  // to and console messages here would be noise — bail.
  if (typeof window === "undefined") return;

  const sentry = getSentry();
  if (sentry) {
    // Build the tags map. Sentry coerces non-string tag values to
    // strings, but we keep the typed entries so a caller can pass
    // a numeric workspace id without manually stringifying.
    const tags: Record<string, string | number | boolean> = { ...(ctx.context ?? {}) };
    if (ctx.digest) tags.digest = ctx.digest;
    try {
      sentry.captureException(error, { tags });
      return;
    } catch (innerError) {
      // Sentry's transport failed (network down, init pending, etc).
      // Fall through to the console path — we still want the
      // operator to see SOMETHING.
      console.error("[reportError] Sentry transport failed:", innerError);
    }
  }

  // No Sentry — structured console fallback. Prefix is what
  // operators grep for in browser-side log shippers.
  console.error(
    "[reportError]",
    error,
    ctx.digest ? { digest: ctx.digest } : undefined,
    ctx.context && Object.keys(ctx.context).length > 0
      ? { context: ctx.context }
      : undefined,
  );
}
