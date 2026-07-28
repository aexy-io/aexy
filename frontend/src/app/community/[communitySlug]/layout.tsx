import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { CommunityAuthButton } from "@/components/community/CommunityAuthButton";
import { getCommunity } from "@/lib/community-api";

/**
 * Public community shell — deliberately outside the (app) auth group. No auth,
 * no workspace chrome; just a light forum frame that reads on mobile and by
 * crawlers. Fetches the community once for its logo/title in the header (the
 * call is request-deduped with the page's own getCommunity).
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href={`/community/${communitySlug}`}
            className="flex items-center gap-2 min-w-0 hover:opacity-80"
          >
            {community?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={community.logo_url}
                alt=""
                className="h-7 w-7 rounded object-cover shrink-0"
              />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded bg-blue-600 text-xs font-bold text-white shrink-0">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-semibold text-gray-900 dark:text-white truncate">
              {name}
            </span>
          </Link>
          <CommunityAuthButton signedOutVariant="signInToJoin" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-sm text-gray-400">
        {t("home.poweredBy")}
      </footer>
    </div>
  );
}
