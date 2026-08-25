import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagesSquare } from "lucide-react";
import { displayFont, brandMonoFont } from "@/lib/fonts";
import { getCommunityDirectory, siteBaseUrl } from "@/lib/community-api";
import { CommunityAuthButton } from "@/components/community/CommunityAuthButton";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const url = `${siteBaseUrl()}/community`;
  const title = "Communities";
  const description =
    "Browse public community forums — discussions, questions, and answers from teams building with Aexy.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

/**
 * Public directory root at /community. Lists every community that opted in
 * (enabled AND listed). Communities not listed remain reachable only by their
 * direct /community/{slug} URL. Deliberately self-contained (no per-community
 * chrome) since it sits above the [communitySlug] layout — which means it owns
 * its own brand shell rather than inheriting one.
 */
export default async function CommunityDirectoryPage() {
  const [directory, t] = await Promise.all([
    getCommunityDirectory(),
    getTranslations("community"),
  ]);
  const communities = directory?.communities ?? [];

  return (
    <div
      className={`theme-ledger ${displayFont.variable} ${brandMonoFont.variable} min-h-screen bg-ledger-paper text-ledger-ink antialiased`}
    >
      <header className="border-b border-ledger-ink/12">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight transition hover:opacity-80"
          >
            {t("directory.brand")}
          </Link>
          <CommunityAuthButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("directory.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ledger-ink/70">
          {t("directory.subtitle")}
        </p>

        {communities.length === 0 ? (
          <div className="mt-8 rounded-[3px] border border-dashed border-ledger-ink/20 bg-ledger-card p-12 text-center">
            <MessagesSquare className="mx-auto h-8 w-8 text-ledger-ink/25" />
            <p className="mt-3 text-sm font-medium text-ledger-ink/70">
              {t("directory.empty")}
            </p>
            <p className="mt-1 text-xs text-ledger-ink/50">{t("directory.emptyHint")}</p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {communities.map((c) => (
              <li key={c.community_slug}>
                <Link
                  href={`/community/${c.community_slug}`}
                  className="block rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-5 transition hover:border-ledger-ink/30"
                >
                  <div className="flex items-start gap-3">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.logo_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-[2px] object-cover"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] bg-ledger-ink font-display text-sm font-semibold text-ledger-paper">
                        {(c.title || c.community_slug).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display font-semibold tracking-tight">
                        {c.title || c.community_slug}
                      </h2>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-ledger-ink/65">
                          {c.description}
                        </p>
                      )}
                      <p className="mt-2 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
                        {t("home.channelCount", { count: c.channel_count })} ·{" "}
                        {t("home.topics", { count: c.topic_count })}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-ledger-ink/12">
        <div className="mx-auto max-w-4xl px-4 py-8 text-center font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/50 sm:px-6">
          <Link href="/products/community" className="transition hover:text-ledger-ink">
            {t("home.poweredBy")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
