"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Zap,
  Clock,
  Shield,
  Sun,
  Users,
  Heart,
  TrendingUp,
  Download,
} from "lucide-react";
import { useDeveloperInsights } from "@/hooks/useInsights";
import { useQuery } from "@tanstack/react-query";
import {
  InsightsPeriodType,
  insightsApi,
  HealthScoreResponse,
  PercentileRankingsResponse,
} from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

export default function MyInsightsPage() {
  const { isLoading: authLoading, isAuthenticated, user: developer } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [exporting, setExporting] = useState(false);

  const myId = developer?.id;

  const { insights, isLoading } = useDeveloperInsights(
    currentWorkspaceId,
    myId || null,
    { period_type: periodType, compare_previous: true }
  );

  const { data: healthScore } = useQuery<HealthScoreResponse>({
    queryKey: ["myHealthScore", currentWorkspaceId, myId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperHealthScore(currentWorkspaceId!, myId!, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!myId,
  });

  const { data: percentile } = useQuery<PercentileRankingsResponse>({
    queryKey: ["myPercentile", currentWorkspaceId, myId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperPercentile(currentWorkspaceId!, myId!, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!myId,
  });
  console.log("data",percentile);
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const handleExport = async () => {
    if (!currentWorkspaceId || !myId) return;
    setExporting(true);
    try {
      const data = await insightsApi.exportDeveloperData(currentWorkspaceId, myId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `insights-export-${myId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const v = insights?.velocity;
  const e = insights?.efficiency;
  const q = insights?.quality;
  const s = insights?.sustainability;
  const c = insights?.collaboration;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/insights"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <User className="h-6 w-6 text-indigo-400" />
              My Insights
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your personal engineering metrics — same data your manager sees
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground text-sm rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export Data"}
          </button>
          <div className="flex bg-muted rounded-lg border border-border overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriodType(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  periodType === opt.value
                    ? "bg-indigo-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-background rounded-xl p-4 border border-border animate-pulse h-24" />
          ))}
        </div>
      )}

      {insights && (
        <>
          {/* Top row: Health Score + Key Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Health Score */}
            {healthScore && (
              <div className="bg-background border border-border rounded-xl p-5">
                <h3 className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-rose-400" />
                  Health Score
                </h3>
                <p
                  className={`text-4xl font-bold ${
                    healthScore.score >= 70
                      ? "text-green-400"
                      : healthScore.score >= 40
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {healthScore.score.toFixed(0)}
                </p>
                <div className="mt-2 space-y-1">
                  {Object.entries(healthScore.breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground w-16 capitalize">{key}</span>
                      <div className="flex-1 h-1 bg-muted rounded-full">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min(100, val.score)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Velocity */}
            <Stat icon={Zap} color="text-green-400" label="Commits" value={v?.commits_count ?? 0} />
            <Stat icon={TrendingUp} color="text-purple-400" label="PRs Merged" value={v?.prs_merged ?? 0} />
            <Stat icon={Users} color="text-cyan-400" label="Collaborators" value={c?.unique_collaborators ?? 0} />
          </div>

          {/* Metric Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Velocity + Efficiency */}
            <div className="bg-background border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-green-400" />
                Velocity & Efficiency
              </h3>
              <div className="space-y-2">
                <MetricRow label="Commit Frequency" value={`${(v?.commit_frequency ?? 0).toFixed(1)}/day`} />
                <MetricRow label="PR Throughput" value={`${(v?.pr_throughput ?? 0).toFixed(1)}/wk`} />
                <MetricRow label="Avg Commit Size" value={`${(v?.avg_commit_size ?? 0).toFixed(0)} lines`} />
                <MetricRow label="PR Cycle Time" value={`${(e?.avg_pr_cycle_time_hours ?? 0).toFixed(1)}h`} />
                <MetricRow label="Time to First Review" value={`${(e?.avg_time_to_first_review_hours ?? 0).toFixed(1)}h`} />
                <MetricRow label="PR Merge Rate" value={`${((e?.pr_merge_rate ?? 0) * 100).toFixed(0)}%`} />
                <MetricRow label="Rework Ratio" value={`${((e?.rework_ratio ?? 0) * 100).toFixed(0)}%`} warn={(e?.rework_ratio ?? 0) > 0.3} />
              </div>
            </div>

            {/* Quality + Sustainability */}
            <div className="bg-background border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-blue-400" />
                Quality & Sustainability
              </h3>
              <div className="space-y-2">
                <MetricRow label="Review Participation" value={`${((q?.review_participation_rate ?? 0) * 100).toFixed(0)}%`} />
                <MetricRow label="Avg Review Depth" value={`${(q?.avg_review_depth ?? 0).toFixed(1)} comments`} />
                <MetricRow label="Self-Merge Rate" value={`${((q?.self_merge_rate ?? 0) * 100).toFixed(0)}%`} warn={(q?.self_merge_rate ?? 0) > 0.2} />
                <MetricRow label="Weekend Commits" value={`${((s?.weekend_commit_ratio ?? 0) * 100).toFixed(0)}%`} warn={(s?.weekend_commit_ratio ?? 0) > 0.15} />
                <MetricRow label="Late Night Commits" value={`${((s?.late_night_commit_ratio ?? 0) * 100).toFixed(0)}%`} warn={(s?.late_night_commit_ratio ?? 0) > 0.1} />
                <MetricRow label="Focus Score" value={`${((s?.focus_score ?? 0) * 100).toFixed(0)}%`} />
                <MetricRow label="Knowledge Sharing" value={`${((c?.knowledge_sharing_score ?? 0) * 100).toFixed(0)}%`} />
              </div>
            </div>
          </div>

          {/* Percentile Rankings */}
          {percentile && Object.keys(percentile.rankings).length > 0 && (
            <div className="bg-background border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                Your Percentile Rankings
                <span className="text-xs text-muted-foreground font-normal">
                  (among {percentile.peer_count} peers)
                </span>
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(percentile.rankings).map(([metric, data]) => (
                  <div key={metric} className="bg-muted rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground capitalize mb-1">
                      {metric.replace(/_/g, " ")}
                    </p>
                    <div className="flex items-end gap-1">
                      <span
                        className={`text-lg font-bold ${
                          data.percentile >= 75
                            ? "text-green-400"
                            : data.percentile >= 50
                            ? "text-blue-400"
                            : data.percentile >= 25
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                      >
                        P{data.percentile.toFixed(0)}
                      </span>
                      <span className="text-[10px] text-muted-foreground mb-0.5">
                        #{data.rank}/{data.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-background border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          warn ? "text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
