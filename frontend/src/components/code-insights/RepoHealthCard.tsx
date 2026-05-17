"use client";

import { HeartPulse } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInsightsSnapshots } from "@/hooks/useCodeInsights";
import type { RepoHealthPayload } from "@/lib/code-insights-api";

import { CardSkeleton } from "./CardSkeleton";

interface Props {
  repositoryId: string | null;
  workspaceId: string | null;
}

function BulletList({ items }: { items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item, idx) => (
        <li key={`${idx}-${item}`} className="flex gap-2">
          <span className="text-muted-foreground">•</span>
          <span className="break-all">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function RepoHealthCard({ repositoryId, workspaceId }: Props) {
  const t = useTranslations("aiInsights.repoHealth");
  const { data, isLoading, error } = useInsightsSnapshots({
    workspaceId,
    scopeType: "repository",
    scopeId: repositoryId,
    kind: "repo_health",
    limit: 1,
  });

  const snapshot = data?.snapshots?.[0];
  const payload = snapshot?.payload as RepoHealthPayload | undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4 text-primary" />
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
        {isLoading && <CardSkeleton />}
        {error && (
          <div className="text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && !snapshot && (
          <div className="text-sm text-muted-foreground">
            <div>{t("noSnapshotYet")}</div>
            <div className="mt-1 text-xs">{t("noSnapshotHint")}</div>
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
                {payload.metrics.merged_without_review !== undefined &&
                  payload.metrics.merged_without_review > 0 && (
                    <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                      {t("metrics.mergedWithoutReview", {
                        count: payload.metrics.merged_without_review,
                      })}
                    </span>
                  )}
                {payload.metrics.reverts !== undefined &&
                  payload.metrics.reverts > 0 && (
                    <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                      {t("metrics.reverts", { count: payload.metrics.reverts })}
                    </span>
                  )}
              </div>
            )}

            {payload.hotspots && payload.hotspots.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("hotspots")}
                </div>
                <BulletList items={payload.hotspots} />
              </div>
            )}

            {payload.risks && payload.risks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("risks")}
                </div>
                <BulletList items={payload.risks} />
              </div>
            )}

            {payload.highlights && payload.highlights.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("highlights")}
                </div>
                <BulletList items={payload.highlights} />
              </div>
            )}

            {payload.trends && payload.trends.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("trends")}
                </div>
                <BulletList items={payload.trends} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
