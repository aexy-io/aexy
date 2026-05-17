"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInsightsSnapshots } from "@/hooks/useCodeInsights";
import type { WeeklyDigestPayload } from "@/lib/code-insights-api";

import { CardSkeleton } from "./CardSkeleton";

interface Props {
  /** ID of the developer (or workspace, if scopeType is "workspace") this digest is for. */
  developerId: string | null;
  workspaceId: string | null;
}

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
  });
}

export function WeeklyDigestCard({ developerId, workspaceId }: Props) {
  const t = useTranslations("aiInsights.weeklyDigest");
  const { data, isLoading, error } = useInsightsSnapshots({
    workspaceId,
    scopeType: "developer",
    scopeId: developerId,
    kind: "weekly_digest",
    limit: 1,
  });

  const snapshot = data?.snapshots?.[0];
  const payload = snapshot?.payload as WeeklyDigestPayload | undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("title")}
          {snapshot && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {t("period", {
                start: formatDate(snapshot.period_start),
                end: formatDate(snapshot.period_end),
              })}
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
                {payload.metrics.prs !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.prs", { count: payload.metrics.prs })}
                  </span>
                )}
                {payload.metrics.reviews !== undefined && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {t("metrics.reviews", { count: payload.metrics.reviews })}
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

            {payload.what_shipped && payload.what_shipped.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("whatShipped")}
                </div>
                <BulletList items={payload.what_shipped} />
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

            {payload.growth_signals && payload.growth_signals.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("growthSignals")}
                </div>
                <BulletList items={payload.growth_signals} />
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
