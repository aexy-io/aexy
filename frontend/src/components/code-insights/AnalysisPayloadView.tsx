"use client";

/**
 * Renders the JSON `AnalysisPayload` produced by the backend AI analyzers.
 * Shared by PR / commit / review insight cards.
 */

import { useTranslations } from "next-intl";

import type { AnalysisPayload } from "@/lib/code-insights-api";

interface Props {
  payload: AnalysisPayload;
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function AnalysisPayloadView({ payload }: Props) {
  const t = useTranslations("aiInsights");

  const languages = (payload.languages || []).map((l) => l.name).filter(Boolean);
  const frameworks = (payload.frameworks || []).map((f) => f.name).filter(Boolean);
  const domains = (payload.domains || []).map((d) => d.name).filter(Boolean);
  const softSkills = (payload.soft_skills || [])
    .map((s) => s.skill)
    .filter(Boolean);
  const summary = payload.summary || "";
  const confidence = typeof payload.confidence === "number" ? payload.confidence : null;

  return (
    <div className="space-y-3">
      {summary && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("summary")}
          </div>
          <p className="text-sm leading-relaxed">{summary}</p>
        </div>
      )}

      {languages.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("languages")}
          </div>
          <ChipList items={languages} />
        </div>
      )}

      {frameworks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("frameworks")}
          </div>
          <ChipList items={frameworks} />
        </div>
      )}

      {domains.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("domains")}
          </div>
          <ChipList items={domains} />
        </div>
      )}

      {softSkills.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            {t("softSkills")}
          </div>
          <ChipList items={softSkills} />
        </div>
      )}

      {confidence !== null && (
        <div className="text-xs text-muted-foreground">
          {t("confidence")}: {(confidence * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
