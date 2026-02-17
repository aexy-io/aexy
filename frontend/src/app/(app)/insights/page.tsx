"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  GitCommit,
  GitPullRequest,
  Code,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Crown,
  ArrowRight,
  BarChart3,
  FolderKanban,
  Bell,
  Building2,
  Gauge,
  User,
  Brain,
  FolderGit2,
} from "lucide-react";
import {
  useTeamInsights,
  useLeaderboard,
  useGenerateSnapshots,
} from "@/hooks/useInsights";
import { useEnabledRepositories } from "@/hooks/useRepositories";
import { InsightsPeriodType } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

const METRIC_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#818cf8",
  "#7c3aed",
  "#4f46e5",
  "#4338ca",
];

function GiniIndicator({ value }: { value: number }) {
  const label =
    value < 0.2
      ? "Very Equal"
      : value < 0.35
        ? "Balanced"
        : value < 0.5
          ? "Moderate"
          : "Unequal";
  const color =
    value < 0.2
      ? "text-green-400"
      : value < 0.35
        ? "text-blue-400"
        : value < 0.5
          ? "text-yellow-400"
          : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
      <span className="text-xs text-muted-foreground">({value.toFixed(2)})</span>
    </div>
  );
}

export default function InsightsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { hasEnabledRepos, hasInstallation, installUrl, isLoading: reposLoading } = useEnabledRepositories();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");

  const {
    teamInsights,
    isLoading: teamLoading,
    refetch: refetchTeam,
  } = useTeamInsights(currentWorkspaceId, { period_type: periodType });

  const { leaderboard, isLoading: lbLoading } = useLeaderboard(
    currentWorkspaceId,
    { metric: "commits", period_type: periodType, limit: 5 },
  );

  const { generateSnapshots, isGenerating } =
    useGenerateSnapshots(currentWorkspaceId);

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

  const agg = teamInsights?.aggregate;
  const dist = teamInsights?.distribution;
  const members = dist?.member_metrics ?? [];

  const workloadData = members.map((m, i) => ({
    name: m.developer_name || m.developer_id.slice(0, 8),
    commits: m.commits_count,
    prs: m.prs_merged,
    reviews: m.reviews_given,
    fill: METRIC_COLORS[i % METRIC_COLORS.length],
  }));

  const handleGenerate = async () => {
    if (!currentWorkspaceId) return;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (periodType === "monthly" ? 30 : 7));
    try {
      await generateSnapshots({
        period_type: periodType,
        start_date: start.toISOString().split("T")[0],
        end_date: now.toISOString().split("T")[0],
      });
      refetchTeam();
    } catch {
      toast.error("Failed to generate snapshots. Please try again.");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-indigo-400" />
              Team Insights
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Metrics-driven view of team velocity, efficiency, and workload
              distribution
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
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Selector */}

          <Link
            href="/insights/compare"
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            <Users className="h-4 w-4" />
            Compare
          </Link>
          <Link
            href="/insights/allocations"
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            <FolderKanban className="h-4 w-4" />
            Allocations
          </Link>
          <Link
            href="/insights/alerts"
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            <Bell className="h-4 w-4" />
            Alerts
          </Link>
          <Link
            href="/insights/executive"
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            <Building2 className="h-4 w-4" />
            Executive
          </Link>
          <Link
            href="/insights/sprint-capacity"
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            <Gauge className="h-4 w-4" />
            Capacity
          </Link>

          <Link
            href="/insights/ai"
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg transition"
          >
            <Brain className="h-4 w-4" />
            AI Insights
          </Link>
          <Link
            href="/insights/me"
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-sm rounded-lg transition"
          >
            <User className="h-4 w-4" />
            My Insights
          </Link>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
          >
            <RefreshCw
              className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`}
            />
            {isGenerating ? "Generating..." : "Generate Snapshots"}
          </button>
        </div>
      </div>

      {/* GitHub App not installed */}
      {!reposLoading && !hasInstallation && (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <FolderGit2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Connect your GitHub account
          </h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Install the Aexy GitHub App to grant access to your repositories. This is required to generate team insights, velocity metrics, and workload analysis.
          </p>
          {installUrl ? (
            <a
              href={installUrl}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
            >
              Install GitHub App
              <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <Link
              href="/settings/repositories"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
            >
              Go to Repository Settings
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}

      {/* Installation exists but no repos enabled */}
      {!reposLoading && hasInstallation && !hasEnabledRepos && (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <FolderGit2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No repositories enabled
          </h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Your GitHub App is connected but you haven&apos;t enabled any repositories yet. Enable at least one repository to see team velocity, efficiency, and workload distribution.
          </p>
          <Link
            href="/settings/repositories"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
          >
            Select Repositories
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      {!hasEnabledRepos ? null : teamLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted rounded-xl p-4 border border-border animate-pulse h-24"
            />
          ))}
        </div>
      ) : teamInsights ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={Users}
            label="Team Size"
            value={teamInsights.member_count}
            color="text-blue-400"
          />
          <StatCard
            icon={GitCommit}
            label="Commits"
            value={agg?.total_commits ?? 0}
            sub={`${(agg?.avg_commits_per_member ?? 0).toFixed(1)}/member`}
            color="text-green-400"
          />
          <StatCard
            icon={GitPullRequest}
            label="PRs Merged"
            value={agg?.total_prs_merged ?? 0}
            sub={`${(agg?.avg_prs_per_member ?? 0).toFixed(1)}/member`}
            color="text-purple-400"
          />
          <StatCard
            icon={MessageSquare}
            label="Reviews"
            value={agg?.total_reviews ?? 0}
            color="text-amber-400"
          />
          <StatCard
            icon={Code}
            label="Lines Changed"
            value={formatNumber(agg?.total_lines_changed ?? 0)}
            color="text-cyan-400"
          />
          <StatCard
            icon={BarChart3}
            label="Workload Equality"
            value={<GiniIndicator value={dist?.gini_coefficient ?? 0} />}
            color="text-indigo-400"
          />
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <p className="text-muted-foreground">
            No insights data yet. Click &quot;Generate Snapshots&quot; to
            compute metrics.
          </p>
        </div>
      )}

      {/* Main Content Grid */}
      {hasEnabledRepos && <div className="grid lg:grid-cols-3 gap-6">
        {/* Workload Distribution Chart */}
        <div className="lg:col-span-2 bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Workload Distribution
            </h2>
            {dist && dist.bottleneck_developers.length > 0 && (
              <div className="flex items-center gap-1 text-amber-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {dist.bottleneck_developers.length} bottleneck
                {dist.bottleneck_developers.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
          {workloadData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={workloadData}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "#334155" }}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "#334155" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f8fafc",
                  }}
                />
                <Bar
                  dataKey="commits"
                  name="Commits"
                  stackId="a"
                  fill="#6366f1"
                />
                <Bar dataKey="prs" name="PRs" stackId="a" fill="#8b5cf6" />
                <Bar
                  dataKey="reviews"
                  name="Reviews"
                  stackId="a"
                  fill="#a78bfa"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No workload data available
            </div>
          )}
          {dist && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Top contributor:{" "}
                <span className="text-foreground">
                  {(dist.top_contributor_share * 100).toFixed(0)}%
                </span>{" "}
                of work
              </span>
              <span>
                Gini:{" "}
                <span className="text-foreground">
                  {dist.gini_coefficient.toFixed(2)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              Top Contributors
            </h2>
            <Link
              href="/insights/leaderboard"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {lbLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-accent rounded animate-pulse"
                />
              ))}
            </div>
          ) : leaderboard?.entries.length ? (
            <div className="space-y-2">
              {leaderboard.entries.map((entry, i) => (
                <div
                  key={entry.developer_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? "bg-amber-500/20 text-amber-400"
                        : i === 1
                          ? "bg-muted/20 text-foreground"
                          : i === 2
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-accent text-muted-foreground"
                    }`}
                  >
                    {entry.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/insights/developers/${entry.developer_id}`}
                      className="text-sm text-foreground hover:text-indigo-300 truncate block"
                    >
                      {entry.developer_name || entry.developer_id.slice(0, 8)}
                    </Link>
                  </div>
                  <span className="text-sm font-mono text-foreground">
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">
              No leaderboard data
            </p>
          )}
        </div>
      </div>}

      {/* Member Summary Table */}
      {hasEnabledRepos && members.length > 0 && (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              Developer Summary
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-6 py-3 font-medium">Developer</th>
                  <th className="px-6 py-3 font-medium text-right">Commits</th>
                  <th className="px-6 py-3 font-medium text-right">
                    PRs Merged
                  </th>
                  <th className="px-6 py-3 font-medium text-right">
                    Lines Changed
                  </th>
                  <th className="px-6 py-3 font-medium text-right">
                    Reviews Given
                  </th>
                  <th className="px-6 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isBottleneck =
                    dist?.bottleneck_developers.includes(m.developer_id) ??
                    false;
                  return (
                    <tr
                      key={m.developer_id}
                      className="border-b border-border/50 hover:bg-accent/30 transition"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">
                            {m.developer_name || m.developer_id.slice(0, 8)}
                          </span>
                          {isBottleneck && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                              bottleneck
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-foreground font-mono">
                        {m.commits_count}
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-foreground font-mono">
                        {m.prs_merged}
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-foreground font-mono">
                        {formatNumber(m.lines_changed)}
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-foreground font-mono">
                        {m.reviews_given}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/insights/developers/${m.developer_id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Details →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-muted rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
