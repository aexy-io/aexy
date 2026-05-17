"use client";

/**
 * Renders the Phase 4B security block embedded in a commit's
 * `semantic_analysis` or a PR's `ai_analysis` payload.
 *
 * Pure display — the parent card decides whether to mount it.
 */

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SecurityBlock } from "@/lib/code-insights-api";

interface Props {
  security: SecurityBlock | null | undefined;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const KIND_KEY: Record<string, string> = {
  secret: "kindSecret",
  sensitive_area: "kindSensitiveArea",
  risky_call: "kindRiskyCall",
};

export function SecurityFindingsPanel({ security }: Props) {
  const t = useTranslations("aiInsights.security");
  if (!security) return null;

  const total = security.summary?.total ?? security.findings.length;
  if (total === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Shield className="h-3 w-3" />
          {t("noFindings")}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Shield className="h-4 w-4 text-primary" />
        {t("title")}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("totalLabel", { count: total })}
        </span>
      </div>
      <ul className="space-y-1.5">
        {security.findings.slice(0, 10).map((f, idx) => {
          const sevStyle = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.low;
          const kindLabel = KIND_KEY[f.kind] ?? "kindSensitiveArea";
          return (
            <li
              key={idx}
              className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 text-xs ${sevStyle}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium uppercase tracking-wide">
                  {t(`severity${f.severity.charAt(0).toUpperCase()}${f.severity.slice(1)}` as
                    "severityHigh" | "severityMedium" | "severityLow")}
                </span>
                <span>{t(kindLabel as
                  "kindSecret" | "kindSensitiveArea" | "kindRiskyCall")}</span>
                <span className="ml-auto truncate text-muted-foreground">
                  {f.file ?? ""}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{f.pattern}</span>
                {f.line_hint && (
                  <code className="text-[10px] text-muted-foreground break-all">
                    {f.line_hint}
                  </code>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
