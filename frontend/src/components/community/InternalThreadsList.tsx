"use client";

import Link from "next/link";
import { Hash, Lock, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CommunityMemberChannel } from "@/lib/api";

function fmt(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Members-only section listing the internal (non web-public) channels/topics
 * the signed-in member can access. Topics deep-link into the full in-app chat
 * experience (/chat/{channelSlug}/{topicId}); the public forum route is
 * read-only and web-public-only, so it can't render these.
 */
export function InternalThreadsList({
  channels,
}: {
  channels: CommunityMemberChannel[];
}) {
  const t = useTranslations("community");

  if (channels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
        {t("internal.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {channels.map((ch) => (
        <div
          key={ch.id}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <Hash className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {ch.name}
            </span>
            <span className="ml-auto shrink-0 text-xs text-gray-400">
              {t("internal.topicCount", { count: ch.topic_count })}
            </span>
          </div>

          {ch.topics.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">{t("internal.empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {ch.topics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/chat/${ch.slug}/${topic.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <span className="truncate text-sm text-gray-800 dark:text-gray-200">
                      {topic.name}
                    </span>
                    {topic.is_web_public && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                        <Globe className="h-3 w-3" />
                        {t("internal.publicBadge")}
                      </span>
                    )}
                    {topic.unread_count > 0 && (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {topic.unread_count}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-gray-400">
                      {topic.message_count} · {fmt(topic.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <Lock className="h-3 w-3" />
        {t("internal.membersOnly")}
      </p>
    </div>
  );
}
