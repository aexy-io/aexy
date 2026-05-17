"use client";

import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/useAuth";
import { useLLMUsage } from "@/hooks/useCodeInsights";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const WINDOWS = [7, 30, 90] as const;

/**
 * Workspace-level LLM usage card. Admin-only.
 *
 * Renders three rollups from /code-insights/llm-usage:
 *   * totals (calls / input / output tokens)
 *   * per-provider / per-model
 *   * per-operation (top 20)
 *
 * Drops into /settings/insights below the AI settings section.
 */
export function LLMUsageCard() {
  const t = useTranslations("aiInsights.usage");
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId);

  const currentMember = members?.find((m) => m.developer_id === user?.id);
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(30);
  const { data, isLoading, error } = useLLMUsage(
    isAdmin ? currentWorkspaceId : null,
    window,
  );

  // Compute the largest by_day bar so the inline sparkline is comparable.
  const maxDayTokens = useMemo(() => {
    if (!data) return 0;
    return data.by_day.reduce(
      (m, d) => Math.max(m, d.input_tokens + d.output_tokens),
      0,
    );
  }, [data]);

  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("windowLabel")}:
            </span>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={[
                  "rounded-md border px-2 py-0.5 text-xs transition-colors",
                  window === w
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {t(`window.${w}` as "window.7" | "window.30" | "window.90")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        {!isAdmin && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            {t("adminOnly")}
          </div>
        )}

        {isAdmin && isLoading && (
          <div className="text-sm text-muted-foreground">…</div>
        )}
        {isAdmin && error && (
          <div className="text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isAdmin && data && data.totals.calls === 0 && (
          <div className="text-sm text-muted-foreground">{t("noUsage")}</div>
        )}

        {isAdmin && data && data.totals.calls > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                {t("totals.calls", { count: data.totals.calls })}
              </span>
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                {t("totals.inputTokens", {
                  tokens: formatTokens(data.totals.input_tokens),
                })}
              </span>
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                {t("totals.outputTokens", {
                  tokens: formatTokens(data.totals.output_tokens),
                })}
              </span>
            </div>

            {/* Inline sparkline: input (primary) + output (muted) stacked bars. */}
            {data.by_day.length > 0 && maxDayTokens > 0 && (
              <div className="flex items-end gap-0.5 h-16">
                {data.by_day.map((d) => {
                  const total = d.input_tokens + d.output_tokens;
                  const heightPct = (total / maxDayTokens) * 100;
                  const inputPct =
                    total > 0 ? (d.input_tokens / total) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      title={`${d.day}: ${formatTokens(total)} tokens (${d.calls} calls)`}
                      className="flex-1 flex flex-col-reverse"
                      style={{ height: `${heightPct}%`, minHeight: "1px" }}
                    >
                      <div
                        className="bg-primary/80 w-full rounded-t-sm"
                        style={{ height: `${inputPct}%`, minHeight: "1px" }}
                      />
                      <div
                        className="bg-primary/40 w-full"
                        style={{
                          height: `${100 - inputPct}%`,
                          minHeight: "1px",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
                  {t("byProvider")}
                </h3>
                <ul className="space-y-1 text-sm">
                  {data.by_provider.map((p) => (
                    <li
                      key={`${p.provider}-${p.model}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{p.provider}</span>
                        {p.model && (
                          <span className="text-muted-foreground"> · {p.model}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTokens(p.input_tokens + p.output_tokens)} ·{" "}
                        {p.calls}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
                  {t("byOperation")}
                </h3>
                <ul className="space-y-1 text-sm">
                  {data.by_operation.map((op) => (
                    <li
                      key={op.operation}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate font-mono text-xs">
                        {op.operation}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTokens(op.input_tokens + op.output_tokens)} ·{" "}
                        {op.calls}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
