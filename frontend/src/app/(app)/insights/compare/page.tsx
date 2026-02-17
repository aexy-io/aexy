"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  GitCompare,
  Users,
  Plus,
  X,
  ChevronDown,
  Info,
} from "lucide-react";
import {
  insightsApi,
  InsightsPeriodType,
  DeveloperInsightsResponse,
} from "@/lib/api";
import { useTeamInsights } from "@/hooks/useInsights";
import {
  MetricsRadar,
  RadarDataPoint,
} from "@/components/insights/MetricsRadar";
import {
  ActivityHeatmap,
  HeatmapCell,
} from "@/components/insights/ActivityHeatmap";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

const RADAR_METRICS = [
  { key: "commits_count", label: "Commits", maxBase: 50, desc: "Total commits pushed during the period" },
  { key: "prs_merged", label: "PRs Merged", maxBase: 10, desc: "Pull requests successfully merged" },
  { key: "pr_throughput", label: "PR Throughput", maxBase: 5, desc: "PRs merged per week" },
  { key: "review_participation_rate", label: "Review Rate", maxBase: 2, desc: "Code reviews per working day" },
  { key: "unique_collaborators", label: "Collaborators", maxBase: 10, desc: "Unique developers collaborated with" },
  { key: "pr_merge_rate", label: "Merge Rate", maxBase: 1, desc: "Percentage of PRs that were merged" },
];

function getMetricValue(
  dev: DeveloperInsightsResponse,
  key: string
): number {
  switch (key) {
    case "commits_count":
      return dev.velocity.commits_count;
    case "prs_merged":
      return dev.velocity.prs_merged;
    case "pr_throughput":
      return dev.velocity.pr_throughput;
    case "review_participation_rate":
      return dev.quality.review_participation_rate;
    case "unique_collaborators":
      return dev.collaboration.unique_collaborators;
    case "pr_merge_rate":
      return dev.efficiency.pr_merge_rate;
    default:
      return 0;
  }
}

export default function ComparePage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [selectedDevIds, setSelectedDevIds] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<
    DeveloperInsightsResponse[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const { teamInsights } = useTeamInsights(currentWorkspaceId, {
    period_type: periodType,
  });

  const availableMembers = teamInsights?.distribution?.member_metrics ?? [];

  // Build name lookup from available members
  const devNameMap: Record<string, string> = {};
  availableMembers.forEach((m) => {
    devNameMap[m.developer_id] = m.developer_name || m.developer_id.slice(0, 8);
  });
  const devName = (id: string) => devNameMap[id] || id.slice(0, 8);

  const fetchComparison = useCallback(async () => {
    if (!currentWorkspaceId || selectedDevIds.length < 2) return;
    setLoading(true);
    try {
      const results = await insightsApi.compareDevs(
        currentWorkspaceId,
        selectedDevIds,
        { period_type: periodType }
      );
      setCompareResults(results);
    } catch (err) {
      console.error("Failed to fetch comparison:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, selectedDevIds, periodType]);

  useEffect(() => {
    if (selectedDevIds.length >= 2) {
      fetchComparison();
    } else {
      setCompareResults([]);
    }
  }, [selectedDevIds, periodType, fetchComparison]);

  const addDeveloper = (devId: string) => {
    if (selectedDevIds.length >= 6) return;
    if (!selectedDevIds.includes(devId)) {
      setSelectedDevIds([...selectedDevIds, devId]);
    }
    setShowPicker(false);
  };

  const removeDeveloper = (devId: string) => {
    setSelectedDevIds(selectedDevIds.filter((id) => id !== devId));
  };

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

  // Build radar chart data
  const radarData: RadarDataPoint[] = RADAR_METRICS.map((m) => {
    const point: RadarDataPoint = {
      metric: m.label,
      desc: m.desc,
      fullMark: m.maxBase,
    };
    compareResults.forEach((dev) => {
      const val = getMetricValue(dev, m.key);
      point[dev.developer_id] = Math.round(val * 100) / 100;
      if (val > m.maxBase) {
        point.fullMark = Math.max(point.fullMark as number, Math.ceil(val));
      }
    });
    return point;
  });

  const radarDevs = compareResults.map((dev) => ({
    id: dev.developer_id,
    name: devName(dev.developer_id),
  }));

  // Build heatmap data (mock weekly breakdown from available data)
  const heatmapData: HeatmapCell[] = [];
  if (compareResults.length > 0) {
    // Generate weekly data from the period
    compareResults.forEach((dev) => {
      const start = new Date(dev.period_start);
      const end = new Date(dev.period_end);
      const totalDays = Math.max(
        1,
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalCommits = dev.velocity.commits_count;
      const avgPerDay = totalCommits / totalDays;

      // Create weekly buckets
      const current = new Date(start);
      while (current < end) {
        const weekNum = getISOWeek(current);
        const year = current.getFullYear();
        const weekLabel = `${year}-W${String(weekNum).padStart(2, "0")}`;
        const daysInWeek = Math.min(
          7,
          (end.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)
        );
        heatmapData.push({
          developerId: dev.developer_id,
          developerName: devName(dev.developer_id),
          week: weekLabel,
          value: Math.round(avgPerDay * daysInWeek),
        });
        current.setDate(current.getDate() + 7);
      }
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/insights"
              className="text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <GitCompare className="h-6 w-6 text-indigo-400" />
              Developer Comparison
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Side-by-side comparison with radar chart and activity heatmap
          </p>
        </div>
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

      {/* Developer Selector */}
      <div className="bg-muted rounded-xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            Select developers to compare (2-6)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDevIds.map((devId) => (
            <div
              key={devId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 rounded-lg"
            >
              <span className="text-sm text-indigo-300">
                {devName(devId)}
              </span>
              <button
                onClick={() => removeDeveloper(devId)}
                className="text-indigo-400 hover:text-foreground transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {selectedDevIds.length < 6 && (
            <div className="relative">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-muted border border-border rounded-lg text-sm text-foreground transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Developer
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showPicker && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-muted border border-border rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                  {availableMembers
                    .filter((m) => !selectedDevIds.includes(m.developer_id))
                    .map((m) => (
                      <button
                        key={m.developer_id}
                        onClick={() => addDeveloper(m.developer_id)}
                        className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent transition"
                      >
                        {m.developer_name || m.developer_id.slice(0, 8)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({m.commits_count}c, {m.prs_merged}pr)
                        </span>
                      </button>
                    ))}
                  {availableMembers.filter(
                    (m) => !selectedDevIds.includes(m.developer_id)
                  ).length === 0 && (
                    <div className="px-4 py-3 text-xs text-muted-foreground">
                      No more developers available
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedDevIds.length < 2 && (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <p className="text-muted-foreground">
            Select at least 2 developers to see the comparison.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      )}

      {compareResults.length >= 2 && !loading && (
        <>
          {/* Radar Chart + Summary Table */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="bg-muted rounded-xl p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Metrics Radar
              </h2>
              <MetricsRadar
                data={radarData}
                developers={radarDevs}
                height={350}
              />
            </div>

            {/* Summary Table */}
            <div className="bg-muted rounded-xl p-6 border border-border overflow-x-auto">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Side-by-Side Metrics
              </h2>
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 font-medium">Metric</th>
                    {compareResults.map((dev) => (
                      <th
                        key={dev.developer_id}
                        className="pb-2 font-medium text-right"
                      >
                        <Link
                          href={`/insights/developers/${dev.developer_id}`}
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          {devName(dev.developer_id)}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Commits",
                      desc: "Total number of commits pushed during the period",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.commits_count,
                    },
                    {
                      label: "PRs Merged",
                      desc: "Pull requests successfully merged into the target branch",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.prs_merged,
                    },
                    {
                      label: "Lines Added",
                      desc: "Total lines of code added across all commits",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.lines_added,
                    },
                    {
                      label: "PR Cycle (hrs)",
                      desc: "Average time from PR creation to merge. Lower is better",
                      get: (d: DeveloperInsightsResponse) =>
                        d.efficiency.avg_pr_cycle_time_hours,
                      lower: true,
                    },
                    {
                      label: "Merge Rate",
                      desc: "Percentage of opened PRs that were merged (vs closed without merge)",
                      get: (d: DeveloperInsightsResponse) =>
                        d.efficiency.pr_merge_rate,
                      pct: true,
                    },
                    {
                      label: "Review Depth",
                      desc: "Average number of comments left per code review",
                      get: (d: DeveloperInsightsResponse) =>
                        d.quality.avg_review_depth,
                    },
                    {
                      label: "Self-merge Rate",
                      desc: "PRs merged without review from another developer. Lower is better",
                      get: (d: DeveloperInsightsResponse) =>
                        d.quality.self_merge_rate,
                      pct: true,
                      lower: true,
                    },
                    {
                      label: "Weekend Ratio",
                      desc: "Percentage of commits made on weekends. High values may indicate overwork",
                      get: (d: DeveloperInsightsResponse) =>
                        d.sustainability.weekend_commit_ratio,
                      pct: true,
                      lower: true,
                    },
                    {
                      label: "Collaborators",
                      desc: "Number of unique developers this person co-authored or reviewed with",
                      get: (d: DeveloperInsightsResponse) =>
                        d.collaboration.unique_collaborators,
                    },
                  ].map((row) => {
                    const values = compareResults.map((d) => row.get(d));
                    const best = row.lower
                      ? Math.min(...values.filter((v) => v > 0))
                      : Math.max(...values);

                    return (
                      <tr
                        key={row.label}
                        className="border-b border-border/30"
                      >
                        <td className="py-2 text-xs text-muted-foreground">
                          <span className="group relative inline-flex items-center gap-1 cursor-help">
                            {row.label}
                            <Info className="h-3 w-3 text-muted-foreground group-hover:text-muted-foreground transition" />
                            <span className="invisible group-hover:visible absolute left-0 bottom-full mb-1 w-52 px-3 py-2 text-xs text-foreground bg-background border border-border rounded-lg shadow-lg z-20">
                              {row.desc}
                            </span>
                          </span>
                        </td>
                        {compareResults.map((dev) => {
                          const val = row.get(dev);
                          const isBest =
                            val === best && val > 0;
                          return (
                            <td
                              key={dev.developer_id}
                              className={`py-2 text-right text-sm font-mono ${
                                isBest
                                  ? "text-green-400 font-semibold"
                                  : "text-foreground"
                              }`}
                            >
                              {row.pct
                                ? `${(val * 100).toFixed(0)}%`
                                : typeof val === "number" && val % 1 !== 0
                                  ? val.toFixed(1)
                                  : val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Heatmap */}
          {heatmapData.length > 0 && (
            <div className="bg-muted rounded-xl p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Activity Heatmap
              </h2>
              <ActivityHeatmap data={heatmapData} metric="commits" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}
