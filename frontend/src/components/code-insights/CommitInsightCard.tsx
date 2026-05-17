"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnalysisPayloadView } from "./AnalysisPayloadView";
import { SecurityFindingsPanel } from "./SecurityFindingsPanel";
import { useCommitInsight } from "@/hooks/useCodeInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  commitId: string | null;
}

/** Maps a Layer-0 skip reason on a commit to a friendly i18n key. */
function skipKey(commit: NonNullable<ReturnType<typeof useCommitInsight>["data"]>) {
  if (commit.author_class === "bot") return "skippedBot";
  if (commit.is_merge) return "skippedMerge";
  if (commit.change_class === "docs_only") return "skippedDocsOnly";
  if (commit.change_class === "formatter_only") return "skippedFormatter";
  if (commit.change_class === "generated") return "skippedGenerated";
  return "notAnalyzed";
}

export function CommitInsightCard({ commitId }: Props) {
  const t = useTranslations("aiInsights");
  const { data, isLoading, error } = useCommitInsight(commitId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {t("commit.title")}
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
            <div>{t(skipKey(data))}</div>
            {skipKey(data) === "notAnalyzed" && (
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
