import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { displayFont, brandMonoFont } from "@/lib/fonts";
import { CommunityAuthButton } from "@/components/community/CommunityAuthButton";
import { CommunitySearch } from "@/components/community/CommunitySearch";
import { getCommunity, siteBaseUrl, themeAccent } from "@/lib/community-api";

/**
 * Public community shell — deliberately outside the (app) auth group. No auth,
 * no workspace chrome.
 *
 * Built on the marketing brand's palette and typefaces rather than the generic
 * grey-and-blue it started with, because a visitor who follows a link from the
 * product to its forum should not feel they have landed on a different company's
 * site. It is not the marketing *chrome*, though: the header carries the
 * community's own name, logo and accent, since most of these forums belong to
 * somebody else.
 *
 * Fetches the community once for its identity (the call is request-deduped with
 * the page's own getCommunity).
 */
export default async function CommunityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const [community, t] = await Promise.all([
    getCommunity(communitySlug),
    getTranslations("community"),
  ]);
  const name = community?.title || t("home.communityFallback");
  const accent = themeAccent(community?.theme);

  return (
    <div
      className={`theme-ledger ${displayFont.variable} ${brandMonoFont.variable} min-h-screen bg-ledger-paper text-ledger-ink antialiased`}
      // The tenant's colour, validated to a hex literal in themeAccent. Falls
      // back to the ledger green, so a community that set no theme still looks
      // deliberate rather than unstyled.
      style={accent ? ({ "--community-accent": accent } as React.CSSProperties) : undefined}
    >
      <header className="sticky top-0 z-20 border-b border-ledger-ink/12 bg-ledger-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Link
            href={`/community/${communitySlug}`}
            className="flex min-w-0 items-center gap-2.5 transition hover:opacity-80"
          >
            {community?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={community.logo_url}
                alt=""
                className="h-7 w-7 shrink-0 rounded-[2px] object-cover"
              />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] bg-ledger-ink text-xs font-bold text-ledger-paper">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate font-display text-lg font-semibold tracking-tight">
              {name}
            </span>
          </Link>

          <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:max-w-xs sm:flex-1">
            <CommunitySearch communitySlug={communitySlug} />
          </div>

          <CommunityAuthButton
            signedOutVariant="signInToJoin"
            communitySlug={communitySlug}
          />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</main>

      <footer className="border-t border-ledger-ink/12">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-4 py-8 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/50 sm:flex-row sm:px-6">
          <a
            href={`${siteBaseUrl()}/community/${communitySlug}/rss.xml`}
            className="transition hover:text-ledger-ink"
          >
            {t("feed.rss")}
          </a>
          <Link href="/products/community" className="transition hover:text-ledger-ink">
            {t("home.poweredBy")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
