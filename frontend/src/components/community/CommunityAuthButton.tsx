"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { developerApi } from "@/lib/api";
import { clearAuthPresenceCookie } from "@/lib/authCookie";

/**
 * The current query string, as an external store.
 *
 * `useSearchParams()` would read this too, and is avoided on purpose. Calling it
 * from a Client Component opts that component's subtree out of prerendering, and
 * on a route that *is* prerendered it fails `next build` unless a Suspense
 * boundary sits above it — a failure that does not reproduce in dev, where every
 * route renders on demand. The community routes are server-rendered today, so
 * nothing would break right now; this component sits in the layout every one of
 * them shares, which is not a good place to leave that waiting for whoever adds
 * `generateStaticParams`.
 *
 * `useSyncExternalStore` re-reads the snapshot on every render, so a query-only
 * move (`?page=2`) that leaves the pathname untouched is caught by the re-render
 * Next does anyway; the subscription is only needed for back and forward, which
 * re-render nothing on their own.
 */
function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

const readSearch = () => window.location.search;
/** No query on the server; the first client render corrects it. */
const readSearchOnServer = () => "";

/**
 * Header CTA for the public community pages. Those pages are server/ISR
 * rendered, so auth state can't be read at render time — this small client
 * component reads the token from localStorage (same approach as the thread
 * composer) and swaps the button accordingly: signed-out visitors get "Sign in";
 * signed-in visitors get "Open app" instead of being told to sign in when they
 * already are.
 *
 * The sign-in link carries `context=community` when it comes from inside a
 * community. That is what makes a forum-only visitor a *community* account —
 * walled off from the internal product by the isolation middleware, non-billable,
 * and returned to the forum rather than dumped on /dashboard. Without it, every
 * person who signed in to ask one question got a full internal account, which is
 * neither what they wanted nor what the workspace paying for seats wanted.
 */
export function CommunityAuthButton({
  signedOutVariant = "signIn",
  communitySlug,
}: {
  signedOutVariant?: "signIn" | "signInToJoin";
  /** Set on community pages; omitted on the directory, which is not one community. */
  communitySlug?: string;
}) {
  const t = useTranslations("community");
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(!!localStorage.getItem("token"));
  }, []);

  // Who is signed in, not merely *that* somebody is. A community account exists
  // only inside this forum — the isolation middleware 403s it everywhere in the
  // internal API — so offering it "Open app" pointed the one control in the
  // header at the one place it cannot go. `/developers/me` is on that
  // middleware's short allow-list precisely so a client can ask this.
  //
  // Keyed as ["currentUser"], the same key `useAuth` uses, so the two share one
  // cached answer instead of each fetching their own.
  const { data: me, isPending, isError } = useQuery({
    queryKey: ["currentUser"],
    queryFn: developerApi.getMe,
    enabled: signedIn,
    retry: false,
  });

  const signOut = () => {
    localStorage.removeItem("token");
    clearAuthPresenceCookie();
    queryClient.clear();
    // A full reload rather than a soft refresh: the signed-in state is read from
    // localStorage by several islands on these pages (this button, the member
    // panel, the thread composer), each in its own mount effect. Re-rendering
    // would leave the others still believing there is a session.
    window.location.reload();
  };

  // Where to send the reader back to. Read live rather than captured once,
  // because this button lives in the community *layout*, which does not remount
  // as the reader moves between the front page, a channel and a thread: a
  // mount-only effect held the first URL of the visit for the rest of it, so
  // someone who arrived at the front page, opened a thread and then signed in
  // was returned to the front page.
  const pathname = usePathname();
  const search = useSyncExternalStore(subscribeToLocation, readSearch, readSearchOnServer);
  const next = pathname + search;

  const className =
    "shrink-0 rounded-[3px] bg-ledger-ink px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-paper transition hover:bg-ledger-ink/85";

  if (signedIn && !isError) {
    // Hold the space until we know which button belongs here. Rendering "Open
    // app" first and correcting it afterwards would offer a community account a
    // link to a 403 for as long as the request takes.
    if (isPending) {
      return <span aria-hidden className={`${className} invisible`} />;
    }

    if (me?.account_type === "community") {
      // No app to open, and until now no way out either: this button was the
      // only auth control on the public pages, so a forum-only reader had no
      // means of signing out at all.
      return (
        <button
          type="button"
          onClick={signOut}
          data-testid="community-auth-signout"
          className={className}
        >
          {t("auth.signOut")}
        </button>
      );
    }

    return (
      <Link href="/dashboard" data-testid="community-auth-openapp" className={className}>
        {t("auth.openApp")}
      </Link>
    );
  }

  // A token that `/developers/me` rejected is a dead session — an expired or
  // revoked one. Falling through to the signed-out branch offers the way back
  // in, where the previous behaviour offered "Open app" and a 401.

  const params = new URLSearchParams({ next });
  if (communitySlug) {
    params.set("context", "community");
    params.set("community", communitySlug);
  }

  return (
    <Link
      href={`/login?${params.toString()}`}
      data-testid="community-auth-signin"
      className={className}
    >
      {t(`auth.${signedOutVariant}`)}
    </Link>
  );
}
