import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Hash, MessagesSquare } from "lucide-react";
import { getCommunity, siteBaseUrl } from "@/lib/community-api";
import { CommunityMemberPanel } from "@/components/community/CommunityMemberPanel";

export const revalidate = 300;

interface Props {
  params: Promise<{ communitySlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { communitySlug } = await params;
  const community = await getCommunity(communitySlug);
  if (!community) return { title: "Community not found" };

  const title = community.title || "Community";
  const description =
    community.description || `Join the conversation in the ${title} community.`;
  const url = `${siteBaseUrl()}/community/${communitySlug}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${url}/rss.xml` },
    },
    robots: community.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url, type: "website" },
  };
}

function fmtDate(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CommunityHome({ params }: Props) {
  const { communitySlug } = await params;
  const [community, t] = await Promise.all([
    getCommunity(communitySlug),
    getTranslations("community"),
  ]);
  if (!community) notFound();

  const totalTopics = community.channels.reduce((n, c) => n + c.topic_count, 0);

  return (
    <div>
      <header className="mb-10 border-b border-ledger-ink/12 pb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {community.title || t("home.communityFallback")}
        </h1>
        {community.description && (
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ledger-ink/70">
            {community.description}
          </p>
        )}
        {community.channels.length > 0 && (
          <p className="mt-5 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
            {t("home.channelCount", { count: community.channels.length })} ·{" "}
            {t("home.topics", { count: totalTopics })}
          </p>
        )}
      </header>

      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-semibold">{t("home.channels")}</h2>
        <span className="text-sm text-ledger-ink/50">{t("home.channelsSubtitle")}</span>
      </div>

      {community.channels.length === 0 ? (
        <div className="rounded-[3px] border border-dashed border-ledger-ink/20 bg-ledger-card p-12 text-center">
          <MessagesSquare className="mx-auto h-8 w-8 text-ledger-ink/25" />
          <p className="mt-3 text-sm font-medium text-ledger-ink/70">
            {t("home.noChannels")}
          </p>
          <p className="mt-1 text-xs text-ledger-ink/50">{t("home.noChannelsHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {community.channels.map((ch) => (
            <li key={ch.slug}>
              <Link
                href={`/community/${communitySlug}/${ch.slug}`}
                className="group block rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-5 transition hover:border-ledger-ink/30"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[2px] text-ledger-paper"
                    style={{ background: "var(--community-accent, #0B6B3A)" }}
                  >
                    <Hash className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold tracking-tight">
                      {ch.name}
                    </h3>
                    {ch.description && (
                      <p className="mt-1 text-sm leading-6 text-ledger-ink/65">
                        {ch.description}
                      </p>
                    )}
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
                      <span>{t("home.topics", { count: ch.topic_count })}</span>
                      <span aria-hidden>·</span>
                      <span>{t("home.messages", { count: ch.message_count })}</span>
                      {ch.last_message_at && (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            {t("home.updated", { date: fmtDate(ch.last_message_at) })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CommunityMemberPanel communitySlug={communitySlug} />
    </div>
  );
}
