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
      <div className="rounded-[3px] border border-dashed border-ledger-ink/20 bg-ledger-card p-8 text-center text-sm text-ledger-ink/60">
        {t("internal.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {channels.map((ch) => (
        <div
          key={ch.id}
          className="overflow-hidden rounded-[3px] border border-ledger-ink/12 bg-ledger-card"
        >
          <div className="flex items-center gap-2 border-b border-ledger-ink/10 px-4 py-3">
            <Hash className="h-4 w-4 shrink-0 text-ledger-ink/40" />
            <span className="truncate font-display font-semibold tracking-tight">
              {ch.name}
            </span>
            <span className="ml-auto shrink-0 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
              {t("internal.topicCount", { count: ch.topic_count })}
            </span>
          </div>

          {ch.topics.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ledger-ink/45">{t("internal.empty")}</p>
          ) : (
            <ul className="divide-y divide-ledger-ink/10">
              {ch.topics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/chat/${ch.slug}/${topic.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 transition hover:bg-ledger-ink/[0.03]"
                  >
                    <span className="truncate text-sm text-ledger-ink/85">
                      {topic.name}
                    </span>
                    {topic.is_web_public && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ledger-mint/20 px-1.5 py-0.5 text-[10px] font-medium text-ledger-green">
                        <Globe className="h-3 w-3" />
                        {t("internal.publicBadge")}
                      </span>
                    )}
                    {topic.unread_count > 0 && (
                      <span className="rounded-full bg-ledger-ink px-1.5 py-0.5 text-[10px] font-semibold text-ledger-paper">
                        {topic.unread_count}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
                      {topic.message_count} · {fmt(topic.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p className="flex items-center justify-center gap-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
        <Lock className="h-3 w-3" />
        {t("internal.membersOnly")}
      </p>
    </div>
  );
}
