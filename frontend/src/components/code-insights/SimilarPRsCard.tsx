"use client";

import { GitPullRequest } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimilarPRs } from "@/hooks/useCodeInsights";

interface Props {
  prId: string | null;
  limit?: number;
}

export function SimilarPRsCard({ prId, limit = 5 }: Props) {
  const t = useTranslations("aiInsights.similarPRs");
  const { data, isLoading, error } = useSimilarPRs(prId, limit);

  const matches = data?.matches ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitPullRequest className="h-4 w-4 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="text-sm text-muted-foreground">…</div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && data?.reason === "not_embedded" && (
          <div className="text-sm text-muted-foreground">
            {t("notEmbedded")}
          </div>
        )}
        {!isLoading && !data?.reason && matches.length === 0 && (
          <div className="text-sm text-muted-foreground">{t("empty")}</div>
        )}
        {matches.length > 0 && (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li
                key={m.pr_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    #{m.number} {m.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.repository}
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {t("similarityLabel", {
                    percent: Math.round(m.similarity * 100),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
