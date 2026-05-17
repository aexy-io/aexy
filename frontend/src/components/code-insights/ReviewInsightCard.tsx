"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnalysisPayloadView } from "./AnalysisPayloadView";
import { useReviewInsight } from "@/hooks/useCodeInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  reviewId: string | null;
}

export function ReviewInsightCard({ reviewId }: Props) {
  const t = useTranslations("aiInsights");
  const { data, isLoading, error } = useReviewInsight(reviewId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("review.title")}
          {data?.state && (
            <span className="ml-auto text-xs font-normal text-muted-foreground uppercase">
              {data.state}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="text-sm text-muted-foreground">{t("loading")}</div>
        )}
        {error && (
          <div className="text-sm text-destructive">{t("error")}</div>
        )}
        {data && !data.quality_metrics && (
          <div className="text-sm text-muted-foreground">
            {t("skippedEmpty")}
          </div>
        )}
        {data?.quality_metrics && (
          <>
            <AnalysisPayloadView payload={data.quality_metrics} />
            {data.analyzed_at && (
              <div className="mt-3 text-xs text-muted-foreground">
                {t("analyzedAt", {
                  date: new Date(data.analyzed_at).toLocaleString(),
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
