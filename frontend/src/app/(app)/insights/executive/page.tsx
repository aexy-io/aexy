"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Users,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Code,
  AlertTriangle,
  ShieldAlert,
  Crown,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  insightsApi,
  InsightsPeriodType,
  ExecutiveSummaryResponse,
} from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

export default function ExecutiveDashboardPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");

  const { data: summary, isLoading } = useQuery<ExecutiveSummaryResponse>({
    queryKey: ["executiveSummary", currentWorkspaceId, periodType],
    queryFn: () =>
      insightsApi.getExecutiveSummary(currentWorkspaceId!, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId,
  });

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

  const balanceColor =
    summary?.health.workload_balance === "good"
      ? "text-green-400"
      : summary?.health.workload_balance === "moderate"
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/insights"
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-6 w-6 text-indigo-400" />
              Executive Dashboard
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Org-wide engineering health overview
            </p>
          </div>
        </div>
        <div className="flex bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 animate-pulse h-24" />
          ))}
        </div>
      )}

      {summary && (
        <>
          {/* Key Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              iconColor="text-blue-400"
              label="Total Developers"
              value={summary.total_developers}
            />
            <StatCard
              icon={GitCommit}
              iconColor="text-green-400"
              label="Total Commits"
              value={summary.activity.total_commits}
            />
            <StatCard
              icon={GitPullRequest}
              iconColor="text-purple-400"
              label="PRs Merged"
              value={summary.activity.total_prs_merged}
            />
            <StatCard
              icon={MessageSquare}
              iconColor="text-cyan-400"
              label="Reviews"
              value={summary.activity.total_reviews}
            />
          </div>

          {/* Health Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-indigo-400" />
                Org Health
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Gini Coefficient</span>
                  <span className="text-sm font-medium text-white">
                    {summary.health.gini_coefficient.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Workload Balance</span>
                  <span className={`text-sm font-medium capitalize ${balanceColor}`}>
                    {summary.health.workload_balance}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Avg Commits/Dev</span>
                  <span className="text-sm font-medium text-white">
                    {summary.activity.avg_commits_per_dev}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Avg PRs/Dev</span>
                  <span className="text-sm font-medium text-white">
                    {summary.activity.avg_prs_per_dev}
                  </span>
                </div>
              </div>
            </div>

            {/* Burnout Risks */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Burnout Risks ({summary.health.burnout_risk_count})
              </h3>
              {summary.risks.burnout.length === 0 ? (
                <p className="text-xs text-zinc-500">No burnout risks detected</p>
              ) : (
                <div className="space-y-2">
                  {summary.risks.burnout.map((risk) => (
                    <div
                      key={risk.developer_id}
                      className="flex items-center gap-3 p-2 bg-amber-500/5 rounded-lg"
                    >
                      <Link
                        href={`/insights/developers/${risk.developer_id}`}
                        className="text-xs text-amber-300 hover:text-amber-200 truncate flex-1"
                      >
                        {risk.developer_id.slice(0, 8)}...
                      </Link>
                      <span className="text-[10px] text-zinc-400">
                        WE: {(risk.weekend_ratio * 100).toFixed(0)}% | LN:{" "}
                        {(risk.late_night_ratio * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottlenecks */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                Bottlenecks ({summary.health.bottleneck_count})
              </h3>
              {summary.risks.bottlenecks.length === 0 ? (
                <p className="text-xs text-zinc-500">No bottleneck risks detected</p>
              ) : (
                <div className="space-y-2">
                  {summary.risks.bottlenecks.map((bn) => (
                    <div
                      key={bn.developer_id}
                      className="flex items-center gap-3 p-2 bg-red-500/5 rounded-lg"
                    >
                      <Link
                        href={`/insights/developers/${bn.developer_id}`}
                        className="text-xs text-red-300 hover:text-red-200 truncate flex-1"
                      >
                        {bn.developer_id.slice(0, 8)}...
                      </Link>
                      <span className="text-[10px] text-zinc-400">
                        {bn.commits} commits ({bn.ratio_vs_avg}x avg)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Contributors */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Crown className="h-4 w-4 text-yellow-400" />
              Top Contributors
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-400 text-xs border-b border-zinc-800">
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">Developer</th>
                    <th className="text-right py-2 font-medium">Commits</th>
                    <th className="text-right py-2 font-medium">PRs</th>
                    <th className="text-right py-2 font-medium">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_contributors.map((dev, i) => (
                    <tr key={dev.developer_id} className="border-b border-zinc-800/50">
                      <td className="py-2 text-zinc-500">{i + 1}</td>
                      <td className="py-2">
                        <Link
                          href={`/insights/developers/${dev.developer_id}`}
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          {dev.developer_id.slice(0, 12)}...
                        </Link>
                      </td>
                      <td className="py-2 text-right text-white font-medium">{dev.commits}</td>
                      <td className="py-2 text-right text-zinc-300">{dev.prs_merged}</td>
                      <td className="py-2 text-right text-zinc-300">
                        {dev.lines_changed > 1000
                          ? `${(dev.lines_changed / 1000).toFixed(1)}K`
                          : dev.lines_changed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">
        {value > 1000 ? `${(value / 1000).toFixed(1)}K` : value}
      </p>
    </div>
  );
}
