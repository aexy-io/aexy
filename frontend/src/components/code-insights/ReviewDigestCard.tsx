"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGenerateReviewDigest,
  useInsightsSnapshots,
} from "@/hooks/useCodeInsights";
import type {
  DeveloperReviewPayload,
  ReviewPeriodType,
} from "@/lib/code-insights-api";

import { CardSkeleton } from "./CardSkeleton";

interface Props {
  developerId: string | null;
  workspaceId: string | null;
  /** Default period to show. The card has its own selector. */
  defaultPeriod?: ReviewPeriodType;
}

const PERIODS: ReviewPeriodType[] = [
  "weekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
];

function BulletList({ items }: { items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item, idx) => (
        <li key={`${idx}-${item}`} className="flex gap-2">
          <span className="text-muted-foreground">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReviewDigestCard({
  developerId,
  workspaceId,
  defaultPeriod = "monthly",
}: Props) {
  const t = useTranslations("aiInsights.reviewDigest");
  const [period, setPeriod] = useState<ReviewPeriodType>(defaultPeriod);

  const { data, isLoading, error, refetch } = useInsightsSnapshots({
    workspaceId,
    scopeType: "developer",
    scopeId: developerId,
    kind: "review_summary",
    limit: 10,
  });

  // The snapshots list isn't filtered server-side by period_type, so we
  // pick the most recent snapshot whose payload's period_type matches.
  const snapshot = useMemo(() => {
    if (!data) return undefined;
    return data.snapshots.find((s) => {
      const p = (s.payload as DeveloperReviewPayload | undefined)?.period_type;
      return p === period;
    });
  }, [data, period]);

  const payload = snapshot?.payload as DeveloperReviewPayload | undefined;

  const generate = useGenerateReviewDigest();
  const [polling, setPolling] = useState(false);
  // Render the spinner during both the initial dispatch AND the
  // background poll waiting for the LLM to land its snapshot.
  const isGenerating = generate.isPending || polling;

  // After Generate fires, poll the snapshots query every 5s until either
  // the period's snapshot appears or we hit a ~2-minute timeout. The
  // single-refetch-at-1.5s pattern this replaces left users staring at
  // "No review summary generated yet" for the full 30-60s LLM call.
  const pollAttemptsRef = useRef(0);
  useEffect(() => {
    if (!polling) return;
    if (snapshot) {
      setPolling(false);
      return;
    }
    if (pollAttemptsRef.current >= 24) {
      setPolling(false);
      return;
    }
    const id = setTimeout(() => {
      pollAttemptsRef.current += 1;
      refetch();
    }, 5000);
    return () => clearTimeout(id);
  }, [polling, snapshot, refetch, data]);

  const handleGenerate = () => {
    if (!developerId || !workspaceId) return;
    pollAttemptsRef.current = 0;
    generate.mutate(
      {
        scopeType: "developer",
        scopeId: developerId,
        workspaceId,
        periodType: period,
      },
      {
        onSuccess: () => {
          setPolling(true);
          // Kick off an immediate refetch in case the activity completed
          // before the dispatch even returned (rare but possible on cache).
          refetch();
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          {t("title")}
          {snapshot && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {formatDate(snapshot.period_start)} –{" "}
              {formatDate(snapshot.period_end)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("periodLabel")}:
          </span>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={[
                "rounded-md border px-2.5 py-0.5 text-xs transition-colors",
                period === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {t(`period.${p}` as
                | "period.weekly"
                | "period.monthly"
                | "period.quarterly"
                | "period.semi_annual"
                | "period.yearly")}
            </button>
          ))}
        </div>

        {isLoading && <CardSkeleton bulletLines={4} />}
        {error && (
          <div className="text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !snapshot && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {t("noSnapshotYet")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("noSnapshotHint")}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !developerId || !workspaceId}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`}
              />
              {isGenerating ? t("generating") : t("generate")}
            </button>
          </div>
        )}

        {payload && (
          <>
            {payload.headline && (
              <p className="text-sm font-medium leading-relaxed">
                {payload.headline}
              </p>
            )}

            {payload.metrics && (
              <div className="flex flex-wrap gap-2 text-xs">
                {payload.metrics.commits !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.commits", { count: payload.metrics.commits })}
                  </span>
                )}
                {payload.metrics.prs_opened !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.prsOpened", {
                      count: payload.metrics.prs_opened,
                    })}
                  </span>
                )}
                {payload.metrics.prs_merged !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.prsMerged", {
                      count: payload.metrics.prs_merged,
                    })}
                  </span>
                )}
                {payload.metrics.reviews_given !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.reviews", {
                      count: payload.metrics.reviews_given,
                    })}
                  </span>
                )}
              </div>
            )}

            {payload.shipped && payload.shipped.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("shipped")}
                </div>
                <BulletList items={payload.shipped} />
              </div>
            )}

            {payload.growth && payload.growth.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("growth")}
                </div>
                <BulletList items={payload.growth} />
              </div>
            )}

            {payload.strengths && payload.strengths.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("strengths")}
                </div>
                <BulletList items={payload.strengths} />
              </div>
            )}

            {payload.areas_to_invest && payload.areas_to_invest.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("areasToInvest")}
                </div>
                <BulletList items={payload.areas_to_invest} />
              </div>
            )}

            {payload.blockers && payload.blockers.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("blockers")}
                </div>
                <BulletList items={payload.blockers} />
              </div>
            )}

            {payload.collaboration && payload.collaboration.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("collaboration")}
                </div>
                <BulletList items={payload.collaboration} />
              </div>
            )}

            {payload.week_by_week && payload.week_by_week.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("weekByWeek")}
                </div>
                <ul className="space-y-2 text-sm">
                  {payload.week_by_week.map((wk, idx) => (
                    <li
                      key={idx}
                      className="rounded-md border border-border bg-background/40 px-3 py-1.5"
                    >
                      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {formatDate(wk.period_start)} –{" "}
                          {formatDate(wk.period_end)}
                        </span>
                      </div>
                      {wk.headline && (
                        <div className="text-sm mt-0.5">{wk.headline}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
