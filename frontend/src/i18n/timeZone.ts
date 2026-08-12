/**
 * The time zone next-intl formats dates in — the same value on both sides.
 *
 * With no explicit value, use-intl reports `ENVIRONMENT_FALLBACK` and falls back
 * to whatever zone the runtime happens to be in: the server's while rendering,
 * the visitor's on hydration. The same timestamp then renders two ways and React
 * reports a markup mismatch. In a production build the warning arrives stripped
 * of its message, as a bare `Error: ENVIRONMENT_FALLBACK` in the server log.
 *
 * The default matches the backend's own (`service_desk_clock.DEFAULT_TIMEZONE`)
 * so a date does not shift between an API response and the page rendering it,
 * and `NEXT_PUBLIC_DEFAULT_TIMEZONE` overrides it for a deployment elsewhere.
 * Deliberately not a per-workspace value: this is read while the layout renders,
 * before any workspace is known. A workspace-specific zone belongs in the
 * formatter call that needs it.
 *
 * Safe in a client component — `NEXT_PUBLIC_*` is inlined at build time.
 */
export const DEFAULT_TIME_ZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Kolkata";
