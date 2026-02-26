"use client";

import { useState } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Heart,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMHealthDashboard, useGTMHealthScores } from "@/hooks/useGTM";

const HEALTH_STATUS_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  neutral: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  at_risk: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const HEALTH_BAR_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500",
  neutral: "bg-zinc-500",
  at_risk: "bg-amber-500",
  critical: "bg-red-500",
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-muted rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-foreground font-mono w-8 text-right">
        {score}
      </span>
    </div>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving")
    return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (trend === "declining")
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <span className="text-muted-foreground text-sm">—</span>;
}

export default function HealthPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [page, setPage] = useState(1);
  const [healthFilter, setHealthFilter] = useState<string>("");

  const { dashboard, isLoading: dashLoading, refetch: refetchDash } =
    useGTMHealthDashboard(workspaceId);
  const { scores, total, isLoading: scoresLoading } = useGTMHealthScores(
    workspaceId,
    { page, health_status: healthFilter || undefined }
  );

  const isLoading = dashLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading health scores...</span>
        </div>
      </div>
    );
  }

  const safeDash = dashboard ?? {
    total_customers: 0,
    healthy_count: 0,
    at_risk_count: 0,
    critical_count: 0,
    status_distribution: [],
  };
  const safeScores = scores ?? [];
  const safeTotal = total ?? 0;
  const totalPages = Math.ceil(safeTotal / 25);

  const statusFilters = [
    { value: "", label: "All" },
    { value: "healthy", label: "Healthy" },
    { value: "neutral", label: "Neutral" },
    { value: "at_risk", label: "At Risk" },
    { value: "critical", label: "Critical" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Activity className="w-7 h-7 text-indigo-400" />
              Health Scores
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor customer health and identify at-risk accounts
            </p>
          </div>
          <button
            onClick={() => refetchDash()}
            className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Heart className="w-4 h-4" />
              Total Customers
            </div>
            <p className="text-3xl font-bold text-foreground">
              {safeDash.total_customers.toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Healthy
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              {safeDash.healthy_count.toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              At Risk
            </div>
            <p className="text-3xl font-bold text-amber-400">
              {safeDash.at_risk_count.toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              Critical
            </div>
            <p className="text-3xl font-bold text-red-400">
              {safeDash.critical_count.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Status Distribution */}
        {(safeDash.status_distribution ?? []).length > 0 && (
          <div className="bg-muted/50 border border-border rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Status Distribution</h3>
            <div className="space-y-3">
              {(safeDash.status_distribution ?? []).map((d: any) => {
                const total = safeDash.total_customers || 1;
                const pct = ((d.count / total) * 100).toFixed(1);
                return (
                  <div key={d.status} className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border w-20 justify-center ${
                        HEALTH_STATUS_COLORS[d.status] ?? HEALTH_STATUS_COLORS.neutral
                      }`}
                    >
                      {d.status?.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 bg-muted/50 rounded-full h-5 relative overflow-hidden">
                      <div
                        className={`${
                          HEALTH_BAR_COLORS[d.status] ?? "bg-zinc-500"
                        } h-5 rounded-full transition-all duration-500 opacity-70`}
                        style={{ width: `${Math.max(parseFloat(pct), 2)}%` }}
                      />
                    </div>
                    <span className="text-sm text-foreground w-12 text-right">
                      {d.count}
                    </span>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-sm text-muted-foreground">Filter:</span>
          {statusFilters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                setHealthFilter(value);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                healthFilter === value
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Health Scores Table */}
        <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Health Scores</h3>
            <span className="text-sm text-muted-foreground">{safeTotal} records</span>
          </div>
          {scoresLoading ? (
            <div className="px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading scores...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Record ID", "Score", "Status", "Trend", "Delta", "Last Scored"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {safeScores.map((s: any) => (
                    <tr key={s.id ?? s.record_id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-foreground text-sm font-mono">
                          {s.record_id?.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <ScoreBar score={s.total_score ?? 0} />
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            HEALTH_STATUS_COLORS[s.health_status] ??
                            HEALTH_STATUS_COLORS.neutral
                          }`}
                        >
                          {s.health_status?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <TrendIcon trend={s.trend ?? "stable"} />
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {s.score_delta != null ? (
                          <span
                            className={
                              s.score_delta > 0
                                ? "text-emerald-400"
                                : s.score_delta < 0
                                  ? "text-red-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {s.score_delta > 0 ? "+" : ""}
                            {s.score_delta}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {s.last_scored_at
                          ? new Date(s.last_scored_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!scoresLoading && safeScores.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No health scores yet. Scores are computed automatically from customer activity.
            </div>
          )}
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground text-sm transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
