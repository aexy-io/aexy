"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeInternalPath, stashPostLoginRedirect } from "@/lib/oauth";
import { setAuthPresenceCookie, clearAuthPresenceCookie } from "@/lib/authCookie";
import { repositoriesApi } from "@/lib/api";

// Renders nothing. This is the only client-side behavior the homepage needs:
// the marketing HTML itself is server-rendered and crawlable, and logged-in
// visitors are bounced to the app. The common case is handled at the edge
// (middleware redirects "/" when the aexy_authed cookie is set); this effect
// covers the localStorage-token / deep-link (?next=) cases without hiding
// content behind a client gate.
//
// ?next= is read from window.location.search rather than useSearchParams():
// the hook would force a Suspense boundary and can flip the route to dynamic
// rendering, and this effect only runs on the client anyway.
export function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Honour ?next= from the middleware auth gate. Two cases:
    //  1. User is already authed (e.g., they clicked a deep link in a new
    //     tab while logged in) — redirect them straight to their target.
    //  2. User is logged out — stash it in sessionStorage so the OAuth
    //     callback can complete the redirect after token exchange.
    const rawNext =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    const nextPath = safeInternalPath(rawNext);
    const token = localStorage.getItem("token");
    if (token) {
      // We validate the token THROUGH `getOnboardingStatus` before
      // syncing the middleware-visible `aexy_authed` cookie. The
      // previous order set the cookie first, which left stale-token
      // users routed to /onboarding (the layout's own status check
      // would then "fail open" and grant access to a protected
      // shell). The fix: validate first, then mark authed.
      repositoriesApi
        .getOnboardingStatus()
        .then((status) => {
          setAuthPresenceCookie();
          router.replace(status.completed ? nextPath ?? "/dashboard" : "/onboarding");
        })
        .catch((err) => {
          // 401 means the token is dead — wipe both the localStorage
          // entry and the presence cookie, then surface the login
          // CTA on this same page. Any other error (network blip,
          // 5xx) is transient: keep the user where they are and let
          // the next click retry.
          const status = (err as { response?: { status?: number } })
            ?.response?.status;
          if (status === 401 || status === 403) {
            // Dead token — clear it and leave the visitor on the landing
            // page (already rendered) with the login CTA.
            localStorage.removeItem("token");
            clearAuthPresenceCookie();
            if (nextPath) stashPostLoginRedirect(nextPath);
          }
          // Any other error (network blip, 5xx) is transient — keep the
          // visitor on the landing page and let the next click retry.
        });
    } else {
      if (nextPath) stashPostLoginRedirect(nextPath);
    }
  }, [router]);

  return null;
}
