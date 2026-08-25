import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { getCommunity, getMemberProfile, siteBaseUrl } from "@/lib/community-api";

export const revalidate = 300;

interface Props {
  params: Promise<{ communitySlug: string; handle: string }>;
}

/**
 * A community member's public face.
 *
 * Note what is absent: no email, no developer id, and no page at all for
 * somebody who chose to post anonymously — the backend 404s those rather than
 * returning an empty profile, because a link is exactly how anonymity comes
 * undone. Follow it once and every other post by the same person is attributed.
 *
 * The handle is derived from the workspace and developer ids, so it identifies
 * the same person only within this one community.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { communitySlug, handle } = await params;
  const [community, profile] = await Promise.all([
    getCommunity(communitySlug),
    getMemberProfile(communitySlug, handle),
  ]);
  if (!community || !profile) return { title: "Member not found" };

  const url = `${siteBaseUrl()}/community/${communitySlug}/members/${handle}`;
  return {
    title: profile.display_name,
    description: `${profile.display_name} in the ${community.title || "community"}.`,
    alternates: { canonical: url },
    // A profile is a thin page whose content lives on the threads it links to.
    // Followed, not indexed.
    robots: { index: false, follow: true },
  };
}

function fmtMonth(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}

export default async function MemberProfilePage({ params }: Props) {
  const { communitySlug, handle } = await params;
  const [profile, t] = await Promise.all([
    getMemberProfile(communitySlug, handle),
    getTranslations("community"),
  ]);
  if (!profile) notFound();

  const stats = [
    { label: t("profile.threads"), value: profile.topic_count },
    { label: t("profile.posts"), value: profile.message_count },
    { label: t("profile.answers"), value: profile.accepted_answer_count },
  ];

  return (
    <div>
      <nav
        aria-label={t("nav.breadcrumb")}
        className="mb-5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45"
      >
        <Link
          href={`/community/${communitySlug}`}
          className="transition hover:text-ledger-ink"
        >
          {t("nav.community")}
        </Link>{" "}
        / <span className="text-ledger-ink/75">{profile.display_name}</span>
      </nav>

      <header className="mb-8 flex items-start gap-4 border-b border-ledger-ink/12 pb-7">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[2px] font-display text-lg font-semibold text-ledger-paper"
          style={{ background: "var(--community-accent, #0B6B3A)" }}
          aria-hidden
        >
          {profile.display_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {profile.display_name}
          </h1>
          {profile.joined_at && (
            <p className="mt-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
              {t("profile.joined", { date: fmtMonth(profile.joined_at) })}
            </p>
          )}
        </div>
      </header>

      <dl className="mb-10 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-4"
          >
            <dt className="font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-ink/45">
              {stat.label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-4 font-display text-lg font-semibold">
        {t("profile.threadsStarted")}
      </h2>
      {profile.topics.length === 0 ? (
        <p className="text-sm text-ledger-ink/60">{t("profile.noThreads")}</p>
      ) : (
        <ul className="divide-y divide-ledger-ink/10 rounded-[3px] border border-ledger-ink/12 bg-ledger-card">
          {profile.topics.map((topic) => {
            const param =
              topic.topic_slug && topic.short_id
                ? `${topic.topic_slug}-${topic.short_id}`
                : null;
            if (!param) return null;
            return (
              <li key={param}>
                <Link
                  href={`/community/${communitySlug}/${topic.channel_slug}/${param}`}
                  className="flex flex-col gap-1 p-4 transition hover:bg-ledger-ink/[0.03] sm:flex-row sm:items-center sm:gap-4"
                >
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
                    #{topic.channel_name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
