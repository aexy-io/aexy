"use client";

/**
 * Compact inline badge showing how well a linked PR delivers what the task
 * asked. Designed to sit next to the PR link row in the task-detail modal.
 *
 * Hides itself entirely until alignment data is available — passive surface
 * that lights up after the weekly analysis cycle.
 */

import { Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { useTaskPRAlignment } from "@/hooks/useCodeInsights";

interface Props {
  linkId: string | null;
}

function matchColor(percent: number): string {
  if (percent >= 80) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (percent >= 50) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

export function TaskAlignmentBadge({ linkId }: Props) {
  const t = useTranslations("aiInsights.alignment");
  const { data, isLoading } = useTaskPRAlignment(linkId);

  if (isLoading) return null;
  if (!data?.alignment) return null;

  const matches = data.alignment.matches_intent;
  if (typeof matches !== "number") return null;

  const percent = Math.round(matches * 100);
  const gaps = data.alignment.gaps ?? [];
  const extras = data.alignment.extras ?? [];

  return (
    <div className="space-y-1.5">
      <div
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${matchColor(percent)}`}
        title={data.alignment.notes?.join(" · ")}
      >
        <Target className="h-3 w-3" />
        {t("matchesIntentLabel", { percent })}
      </div>
      {(gaps.length > 0 || extras.length > 0) && (
        <div className="rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs space-y-1">
          {gaps.length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-0.5">
                {t("gaps")}
              </div>
              <ul className="space-y-0.5">
                {gaps.map((g, idx) => (
                  <li key={idx} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {extras.length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-0.5">
                {t("extras")}
              </div>
              <ul className="space-y-0.5">
                {extras.map((e, idx) => (
                  <li key={idx} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
