"use client";

import { useMemo, useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGenerateReviewDigest,
  useInsightsSnapshots,
} from "@/hooks/useCodeInsights";
import type {
  ReviewPeriodType,
  TeamReviewPayload,
} from "@/lib/code-insights-api";

interface Props {
  /** Either a team id (scopeType=team) or a workspace id (scopeType=workspace). */
  scopeType: "team" | "workspace";
  scopeId: string | null;
  workspaceId: string | null;
  defaultPeriod?: ReviewPeriodType;
}

const PERIODS: ReviewPeriodType[] = [
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

export function TeamReviewCard({
  scopeType,
  scopeId,
  workspaceId,
  defaultPeriod = "quarterly",
}: Props) {
  const t = useTranslations("aiInsights.teamReview");
  const tPeriod = useTranslations("aiInsights.reviewDigest");
  const [period, setPeriod] = useState<ReviewPeriodType>(defaultPeriod);

  const { data, isLoading, error, refetch } = useInsightsSnapshots({
    workspaceId,
    scopeType,
    scopeId,
    kind: "team_review_summary",
    limit: 10,
  });

  const snapshot = useMemo(() => {
    if (!data) return undefined;
    return data.snapshots.find((s) => {
      const p = (s.payload as TeamReviewPayload | undefined)?.period_type;
      return p === period;
    });
  }, [data, period]);

  const payload = snapshot?.payload as TeamReviewPayload | undefined;

  const generate = useGenerateReviewDigest();
  const isGenerating = generate.isPending;

  const handleGenerate = () => {
    if (!scopeId || !workspaceId) return;
    generate.mutate(
      {
        scopeType,
        scopeId,
        workspaceId,
        periodType: period,
      },
      { onSuccess: () => setTimeout(() => refetch(), 1500) },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {tPeriod("periodLabel")}:
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
              {tPeriod(`period.${p}` as
                | "period.weekly"
                | "period.monthly"
                | "period.quarterly"
                | "period.semi_annual"
                | "period.yearly")}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">…</div>
        )}
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
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !scopeId || !workspaceId}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`}
              />
              {isGenerating ? tPeriod("generating") : tPeriod("generate")}
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
            {payload.highlights && payload.highlights.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("highlights")}
                </div>
                <BulletList items={payload.highlights} />
              </div>
            )}
            {payload.cross_team_patterns && payload.cross_team_patterns.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("crossTeam")}
                </div>
                <BulletList items={payload.cross_team_patterns} />
              </div>
            )}
            {payload.knowledge_risks && payload.knowledge_risks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("knowledgeRisks")}
                </div>
                <BulletList items={payload.knowledge_risks} />
              </div>
            )}
            {payload.team_strengths && payload.team_strengths.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("teamStrengths")}
                </div>
                <BulletList items={payload.team_strengths} />
              </div>
            )}
            {payload.team_growth_areas && payload.team_growth_areas.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("teamGrowthAreas")}
                </div>
                <BulletList items={payload.team_growth_areas} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
