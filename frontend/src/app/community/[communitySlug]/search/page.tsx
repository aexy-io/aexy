import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, SearchX } from "lucide-react";
import { getCommunity, parsePage, searchCommunity, siteBaseUrl } from "@/lib/community-api";
import { CommunitySearch } from "@/components/community/CommunitySearch";
import { Pagination } from "@/components/community/Pagination";

const SEARCH_PAGE_SIZE = 20;

interface Props {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { communitySlug } = await params;
  const community = await getCommunity(communitySlug);
  if (!community) return { title: "Community not found" };
  return {
    title: `Search — ${community.title || "Community"}`,
    // A search results page is thin, duplicative, and infinite in the number of
    // URLs it can produce. It exists for people, not for the index.
    robots: { index: false, follow: true },
    alternates: { canonical: `${siteBaseUrl()}/community/${communitySlug}` },
  };
}

export default async function CommunitySearchPage({ params, searchParams }: Props) {
  const [{ communitySlug }, { q: rawQuery, page: rawPage }] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = (rawQuery ?? "").trim();
  const page = parsePage(rawPage);

  const [community, t] = await Promise.all([
    getCommunity(communitySlug),
    getTranslations("community"),
  ]);
  if (!community) notFound();

  const results = query
    ? await searchCommunity(communitySlug, query, page, SEARCH_PAGE_SIZE)
    : null;

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
        / <span className="text-ledger-ink/75">{t("search.heading")}</span>
      </nav>

      <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("search.heading")}
      </h1>

      <div className="mb-8 max-w-xl">
        <CommunitySearch communitySlug={communitySlug} defaultValue={query} autoFocus />
      </div>

      {!query ? (
        <p className="text-sm text-ledger-ink/60">{t("search.prompt")}</p>
      ) : !results || results.total === 0 ? (
        <div className="rounded-[3px] border border-dashed border-ledger-ink/20 bg-ledger-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-ledger-ink/25" />
          <p className="mt-3 text-sm font-medium text-ledger-ink/70">
            {t("search.noResults", { query })}
          </p>
          <p className="mt-1 text-xs text-ledger-ink/50">{t("search.noResultsHint")}</p>
        </div>
      ) : (
        <>
          <p className="mb-4 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
            {t("search.resultCount", { count: results.total })}
          </p>
          <ul className="space-y-3">
            {results.hits.map((hit) => {
              const param =
                hit.topic_slug && hit.short_id
                  ? `${hit.topic_slug}-${hit.short_id}`
                  : null;
              const href = param
                ? `/community/${communitySlug}/${hit.channel_slug}/${param}`
                : `/community/${communitySlug}/${hit.channel_slug}`;
              return (
                <li key={`${hit.channel_slug}-${hit.short_id}`}>
                  <Link
                    href={href}
                    className="block rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-4 transition hover:border-ledger-ink/30"
                  >
                    <div className="flex items-baseline gap-2">
                      {hit.is_answered && (
                        <CheckCircle2
                          aria-label={t("topic.answered")}
                          className="h-4 w-4 shrink-0"
                          style={{ color: "var(--community-accent, #0B6B3A)" }}
                        />
                      )}
                      <h2 className="font-display font-semibold tracking-tight">
                        {hit.name}
                      </h2>
                    </div>
                    {hit.snippet && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-ledger-ink/65">
                        {hit.snippet}
                      </p>
                    )}
                    <p className="mt-2 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
                      #{hit.channel_name} ·{" "}
                      {t("home.messages", { count: hit.message_count })}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pagination
            basePath={`/community/${communitySlug}/search?q=${encodeURIComponent(query)}`}
            page={page}
            total={results.total}
            pageSize={SEARCH_PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
