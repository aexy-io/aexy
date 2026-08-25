"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
  const [signedIn, setSignedIn] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSignedIn(!!localStorage.getItem("token"));
    setNext(window.location.pathname + window.location.search);
  }, []);

  const className =
    "shrink-0 rounded-[3px] bg-ledger-ink px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-paper transition hover:bg-ledger-ink/85";

  if (signedIn) {
    return (
      <Link href="/dashboard" className={className}>
        {t("auth.openApp")}
      </Link>
    );
  }

  const params = new URLSearchParams({ next });
  if (communitySlug) {
    params.set("context", "community");
    params.set("community", communitySlug);
  }

  return (
    <Link href={`/login?${params.toString()}`} className={className}>
      {t(`auth.${signedOutVariant}`)}
    </Link>
  );
}
