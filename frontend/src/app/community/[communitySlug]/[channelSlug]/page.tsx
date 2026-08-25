import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import {
  PAGE_SIZE,
  getCommunity,
  getCommunityChannel,
  parsePage,
  siteBaseUrl,
} from "@/lib/community-api";
import { Pagination } from "@/components/community/Pagination";
import { NewTopicLauncher } from "@/components/community/NewTopicLauncher";

export const revalidate = 300;

interface Props {
  params: Promise<{ communitySlug: string; channelSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ communitySlug, channelSlug }, { page: rawPage }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = parsePage(rawPage);
  const [community, channel] = await Promise.all([
    getCommunity(communitySlug),
    getCommunityChannel(communitySlug, channelSlug, page),
  ]);
  if (!community || !channel) return { title: "Channel not found" };

  const title = `#${channel.name}`;
  const description = channel.description || `Discussions in #${channel.name}.`;
  const base = `${siteBaseUrl()}/community/${communitySlug}/${channelSlug}`;
  return {
    title,
    description,
    // The canonical carries the page, so page 2 is its own page rather than a
    // duplicate of page 1 that gets dropped from the index.
    alternates: {
      canonical: page === 0 ? base : `${base}?page=${page + 1}`,
      // The per-channel feed is a query on the community's feed, not a route of
      // its own — `{base}/rss.xml` would be a 404, and advertising a feed URL
      // that does not resolve is worse than advertising none.
      types: {
        "application/rss+xml":
          `${siteBaseUrl()}/community/${communitySlug}/rss.xml` +
          `?channel=${encodeURIComponent(channelSlug)}`,
      },
    },
    robots: community.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: base, type: "website" },
  };
}

function fmt(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const [{ communitySlug, channelSlug }, { page: rawPage }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = parsePage(rawPage);
  const [community, channel, t] = await Promise.all([
    getCommunity(communitySlug),
    getCommunityChannel(communitySlug, channelSlug, page),
    getTranslations("community"),
  ]);
  if (!channel || !community) notFound();

  return (
    <div>
      <nav
        aria-label={t("nav.breadcrumb")}
        className="mb-5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45"
      >
        <Link href={`/community/${communitySlug}`} className="transition hover:text-ledger-ink">
          {t("nav.community")}
        </Link>{" "}
        / <span className="text-ledger-ink/75">#{channel.name}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-ledger-ink/12 pb-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            #{channel.name}
          </h1>
          {channel.description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-7 text-ledger-ink/70">
              {channel.description}
            </p>
          )}
        </div>
        <NewTopicLauncher
          communitySlug={communitySlug}
          channelSlug={channelSlug}
          allowNewTopics={community.allow_new_topics && community.allow_participation}
        />
      </header>

      {channel.topics.length === 0 ? (
        <div className="rounded-[3px] border border-dashed border-ledger-ink/20 bg-ledger-card p-12 text-center">
          <p className="text-sm font-medium text-ledger-ink/70">{t("channel.noTopics")}</p>
          <p className="mt-1 text-xs text-ledger-ink/50">{t("channel.noTopicsHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-ledger-ink/10 rounded-[3px] border border-ledger-ink/12 bg-ledger-card">
          {channel.topics.map((topic) => {
            const param =
              topic.slug && topic.short_id ? `${topic.slug}-${topic.short_id}` : null;
            const inner = (
              <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                <span className="flex min-w-0 items-center gap-2">
                  {topic.is_answered && (
                    <CheckCircle2
                      aria-label={t("topic.answered")}
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--community-accent, #0B6B3A)" }}
                    />
                  )}
                  <span className="truncate font-medium">{topic.name}</span>
                </span>
                <span className="shrink-0 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45 sm:ml-auto">
                  {t("home.messages", { count: topic.message_count })} ·{" "}
                  {fmt(topic.last_message_at || topic.created_at)}
                </span>
              </div>
            );
            return (
              <li key={`${topic.slug}-${topic.short_id}`}>
                {param ? (
                  <Link
                    href={`/community/${communitySlug}/${channelSlug}/${param}`}
                    className="block transition hover:bg-ledger-ink/[0.03]"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        basePath={`/community/${communitySlug}/${channelSlug}`}
        page={page}
        total={channel.total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
