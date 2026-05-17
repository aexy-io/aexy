"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnalysisPayloadView } from "./AnalysisPayloadView";
import { SecurityFindingsPanel } from "./SecurityFindingsPanel";
import { usePRInsight } from "@/hooks/useCodeInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  prId: string | null;
}

export function PRInsightCard({ prId }: Props) {
  const t = useTranslations("aiInsights");
  const { data, isLoading, error } = usePRInsight(prId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("pr.title")}
          {data?.size_bucket && (
            <span className="ml-auto text-xs font-normal text-muted-foreground uppercase">
              {data.size_bucket}
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
        {data && !data.analysis && (
          <div className="text-sm text-muted-foreground">
            <div>
              {data.size_bucket === "xs" ? t("skippedSizeXs") : t("notAnalyzed")}
            </div>
            {data.size_bucket !== "xs" && (
              <div className="mt-1 text-xs">{t("notAnalyzedHint")}</div>
            )}
          </div>
        )}
        {data?.analysis && (
          <>
            <AnalysisPayloadView payload={data.analysis} />
            {data.analysis.security && (
              <div className="mt-3">
                <SecurityFindingsPanel security={data.analysis.security} />
              </div>
            )}
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
