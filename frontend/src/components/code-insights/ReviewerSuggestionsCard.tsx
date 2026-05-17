"use client";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReviewerSuggestions } from "@/hooks/useCodeInsights";

interface Props {
  prId: string | null;
  limit?: number;
}

export function ReviewerSuggestionsCard({ prId, limit = 5 }: Props) {
  const t = useTranslations("aiInsights.reviewerSuggestions");
  const { data, isLoading, error } = useReviewerSuggestions(prId, limit);

  const suggestions = data?.suggestions ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
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
        {!isLoading && !data?.reason && suggestions.length === 0 && (
          <div className="text-sm text-muted-foreground">{t("empty")}</div>
        )}
        {suggestions.length > 0 && (
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.developer_id} className="flex items-start gap-3">
                {s.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full shrink-0"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium truncate">
                      {s.name || s.github_username || s.developer_id.slice(0, 8)}
                    </span>
                    {s.github_username && (
                      <span className="text-xs text-muted-foreground">
                        @{s.github_username}
                      </span>
                    )}
                  </div>
                  {s.evidence.length > 0 && (
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {s.evidence.map((e, idx) => (
                        <li key={idx} className="truncate">
                          {e.role === "author"
                            ? t("evidenceAuthor", {
                                number: e.pr_number,
                                repo: e.repository,
                                percent: Math.round(e.similarity * 100),
                              })
                            : t("evidenceReviewer", {
                                number: e.pr_number,
                                repo: e.repository,
                                percent: Math.round(e.similarity * 100),
                              })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
