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
    alternates: { canonical: url },
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {community.title || t("home.communityFallback")}
        </h1>
        {community.description && (
          <p className="mt-2 text-gray-600 dark:text-gray-400">{community.description}</p>
        )}
        {community.channels.length > 0 && (
          <p className="mt-3 text-sm text-gray-400">
            {t("home.channels")} · {community.channels.length} —{" "}
            {t("home.topics", { count: totalTopics })}
          </p>
        )}
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("home.channels")}
        </h2>
        <span className="text-sm text-gray-400">{t("home.channelsSubtitle")}</span>
      </div>

      {community.channels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <MessagesSquare className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm font-medium text-gray-500">{t("home.noChannels")}</p>
          <p className="mt-1 text-xs text-gray-400">{t("home.noChannelsHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {community.channels.map((ch) => (
            <li key={ch.slug}>
              <Link
                href={`/community/${communitySlug}/${ch.slug}`}
                className="group block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:border-blue-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                    <Hash className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {ch.name}
                    </h3>
                    {ch.description && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {ch.description}
                      </p>
                    )}
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                      <span>{t("home.topics", { count: ch.topic_count })}</span>
                      <span aria-hidden>·</span>
                      <span>{t("home.messages", { count: ch.message_count })}</span>
                      {ch.last_message_at && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{t("home.updated", { date: fmtDate(ch.last_message_at) })}</span>
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
