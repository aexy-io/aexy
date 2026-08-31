/**
 * Where "back" goes from a ticket, and why it cannot be a constant.
 *
 * A ticket is opened from two screens — the dashboard and the ticket list — and
 * the list keeps its search, filters, sort and page in its own address. Sending
 * "back" to a fixed path threw all of that away: somebody working a filtered
 * queue lost their place on every ticket they opened, which is once per ticket
 * for a whole morning. The screen that opens a ticket records the exact address
 * it is leaving; the ticket reads it back.
 *
 * Session storage rather than a `?return=` parameter: the return address is a
 * fact about this tab's history, not part of the ticket's identity, and a
 * ticket link pasted into chat must not carry somebody else's filters with it.
 * It also survives a reload of the ticket page, which the browser's own history
 * would not tell us about.
 */
const KEY = "serviceDesk:returnTo";

/** Recorded against the ticket being opened, not on its own: a return address
 *  left over from an earlier visit is worse than none — it would send somebody
 *  who arrived from My Work to a ticket list they never saw. */
export function rememberServiceDeskReturn(ticketId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ticketId, url: window.location.pathname + window.location.search }),
    );
  } catch {
    // Private modes and storage-blocked contexts. The caller's fallback holds.
  }
}

/** The address `ticketId` was opened from, or null if it was reached some other
 *  way. Only ever an in-app service-desk path — whatever is in storage is
 *  treated as untrusted input for the purpose of navigating to it — and never a
 *  ticket, so a hop between two related tickets cannot become a loop. */
export function serviceDeskReturnTo(ticketId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { ticketId?: string; url?: string };
    if (stored.ticketId !== ticketId) return null;
    const url = stored.url ?? "";
    if (!url.startsWith("/service-desk")) return null;
    if (/^\/service-desk\/tickets\/[^/?#]+/.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}
