"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useParams, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  GitCommit,
  GitPullRequest,
  Clock,
  Shield,
  Users,
  Zap,
  Sun,
  Moon,
  Target,
  BarChart3,
  Heart,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  useDeveloperInsights,
  useDeveloperTrends,
} from "@/hooks/useInsights";
import {
  InsightsPeriodType,
  insightsApi,
  HealthScoreResponse,
  GamingFlagsResponse,
  VelocityForecastResponse,
  PRSizeDistribution,
  CodeChurnResponse,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

export default function DeveloperInsightsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const params = useParams();
  const developerId = params.developerId as string;
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");

  const { insights, isLoading } = useDeveloperInsights(
    currentWorkspaceId,
    developerId,
    { period_type: periodType, compare_previous: true }
  );

  const { trends } = useDeveloperTrends(currentWorkspaceId, developerId, {
    period_type: periodType,
    limit: 12,
  });

  const { data: healthScore } = useQuery<HealthScoreResponse>({
    queryKey: ["healthScore", currentWorkspaceId, developerId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperHealthScore(currentWorkspaceId!, developerId, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!developerId,
  });

  const { data: gamingFlags } = useQuery<GamingFlagsResponse>({
    queryKey: ["gamingFlags", currentWorkspaceId, developerId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperGamingFlags(currentWorkspaceId!, developerId, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!developerId,
  });

  const { data: forecast } = useQuery<VelocityForecastResponse>({
    queryKey: ["forecast", currentWorkspaceId, developerId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperForecast(currentWorkspaceId!, developerId, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!developerId,
  });

  const { data: prSizes } = useQuery<PRSizeDistribution>({
    queryKey: ["prSizes", currentWorkspaceId, developerId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperPRSizes(currentWorkspaceId!, developerId, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!developerId,
  });

  const { data: codeChurn } = useQuery<CodeChurnResponse>({
    queryKey: ["codeChurn", currentWorkspaceId, developerId, periodType],
    queryFn: () =>
      insightsApi.getDeveloperCodeChurn(currentWorkspaceId!, developerId, {
        period_type: periodType,
      }),
    enabled: !!currentWorkspaceId && !!developerId,
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

  const v = insights?.velocity;
  const e = insights?.efficiency;
  const q = insights?.quality;
  const s = insights?.sustainability;
  const c = insights?.collaboration;
  const pv = insights?.previous?.velocity;

  // Trend chart data
  const trendData = trends.map((snap) => ({
    period: new Date(snap.period_start).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    commits: snap.velocity_metrics?.commits_count ?? 0,
    prs: snap.velocity_metrics?.prs_merged ?? 0,
    reviews: snap.quality_metrics?.review_participation_rate ?? 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/insights"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Developer Insights
            </h1>
            <p className="text-slate-400 text-sm">
              {developerId.slice(0, 8)}... &middot;{" "}
              {insights?.period_start
                ? `${new Date(insights.period_start).toLocaleDateString()} – ${new Date(insights.period_end).toLocaleDateString()}`
                : "No data"}
            </p>
          </div>
        </div>
        <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-xl p-4 border border-slate-700 animate-pulse h-24"
            />
          ))}
        </div>
      ) : !insights ? (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <p className="text-slate-400">
            No insights data for this developer. Generate snapshots from the
            Team Overview page first.
          </p>
        </div>
      ) : (
        <>
          {/* Velocity Section */}
          <Section title="Velocity" icon={Zap} color="text-green-400">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Commits"
                value={v?.commits_count ?? 0}
                prev={pv?.commits_count}
              />
              <MetricCard
                label="PRs Merged"
                value={v?.prs_merged ?? 0}
                prev={pv?.prs_merged}
              />
              <MetricCard
                label="Commit Frequency"
                value={`${(v?.commit_frequency ?? 0).toFixed(1)}/day`}
                prev={pv?.commit_frequency}
                format="perDay"
              />
              <MetricCard
                label="PR Throughput"
                value={`${(v?.pr_throughput ?? 0).toFixed(1)}/wk`}
                prev={pv?.pr_throughput}
                format="perWeek"
              />
              <MetricCard
                label="Lines Added"
                value={formatNumber(v?.lines_added ?? 0)}
                color="text-green-400"
              />
              <MetricCard
                label="Lines Removed"
                value={formatNumber(v?.lines_removed ?? 0)}
                color="text-red-400"
              />
              <MetricCard
                label="Net Lines"
                value={formatNumber(v?.net_lines ?? 0)}
              />
              <MetricCard
                label="Avg Commit Size"
                value={`${(v?.avg_commit_size ?? 0).toFixed(0)} lines`}
              />
            </div>
          </Section>

          {/* Efficiency Section */}
          <Section title="Efficiency" icon={Clock} color="text-purple-400">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard
                label="PR Cycle Time"
                value={`${(e?.avg_pr_cycle_time_hours ?? 0).toFixed(1)}h`}
              />
              <MetricCard
                label="Time to First Review"
                value={`${(e?.avg_time_to_first_review_hours ?? 0).toFixed(1)}h`}
              />
              <MetricCard
                label="PR Merge Rate"
                value={`${((e?.pr_merge_rate ?? 0) * 100).toFixed(0)}%`}
              />
              <MetricCard
                label="Avg PR Size"
                value={`${(e?.avg_pr_size ?? 0).toFixed(0)} lines`}
              />
              <MetricCard
                label="First Commit → Merge"
                value={`${(e?.first_commit_to_merge_hours ?? 0).toFixed(1)}h`}
              />
              <MetricCard
                label="Rework Ratio"
                value={`${((e?.rework_ratio ?? 0) * 100).toFixed(0)}%`}
                warn={(e?.rework_ratio ?? 0) > 0.3}
              />
            </div>
          </Section>

          {/* Quality Section */}
          <Section title="Quality" icon={Shield} color="text-blue-400">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Review Participation"
                value={`${((q?.review_participation_rate ?? 0) * 100).toFixed(0)}%`}
              />
              <MetricCard
                label="Avg Review Depth"
                value={`${(q?.avg_review_depth ?? 0).toFixed(1)} comments`}
              />
              <MetricCard
                label="Review Turnaround"
                value={`${(q?.review_turnaround_hours ?? 0).toFixed(1)}h`}
              />
              <MetricCard
                label="Self-Merge Rate"
                value={`${((q?.self_merge_rate ?? 0) * 100).toFixed(0)}%`}
                warn={(q?.self_merge_rate ?? 0) > 0.2}
              />
            </div>
          </Section>

          {/* Sustainability Section */}
          <Section
            title="Sustainability"
            icon={Sun}
            color="text-amber-400"
          >
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <MetricCard
                label="Weekend Commits"
                value={`${((s?.weekend_commit_ratio ?? 0) * 100).toFixed(0)}%`}
                warn={(s?.weekend_commit_ratio ?? 0) > 0.15}
                icon={Moon}
              />
              <MetricCard
                label="Late Night Commits"
                value={`${((s?.late_night_commit_ratio ?? 0) * 100).toFixed(0)}%`}
                warn={(s?.late_night_commit_ratio ?? 0) > 0.1}
                icon={Moon}
              />
              <MetricCard
                label="Longest Streak"
                value={`${s?.longest_streak_days ?? 0} days`}
              />
              <MetricCard
                label="Avg Active Hours"
                value={`${(s?.avg_daily_active_hours ?? 0).toFixed(1)}h/day`}
              />
              <MetricCard
                label="Focus Score"
                value={`${((s?.focus_score ?? 0) * 100).toFixed(0)}%`}
                icon={Target}
              />
            </div>
          </Section>

          {/* Collaboration Section */}
          <Section title="Collaboration" icon={Users} color="text-cyan-400">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <MetricCard
                label="Unique Collaborators"
                value={c?.unique_collaborators ?? 0}
              />
              <MetricCard
                label="Cross-Team PR Ratio"
                value={`${((c?.cross_team_pr_ratio ?? 0) * 100).toFixed(0)}%`}
              />
              <MetricCard
                label="Reviews Given"
                value={c?.review_given_count ?? 0}
              />
              <MetricCard
                label="Reviews Received"
                value={c?.review_received_count ?? 0}
              />
              <MetricCard
                label="Knowledge Sharing"
                value={`${((c?.knowledge_sharing_score ?? 0) * 100).toFixed(0)}%`}
              />
            </div>
          </Section>

          {/* Health Score + Forecast + Gaming Flags */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Health Score */}
            {healthScore && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Heart className="h-4 w-4 text-rose-400" />
                  Health Score
                </h3>
                <div className="text-center mb-3">
                  <span
                    className={`text-4xl font-bold ${
                      healthScore.score >= 70
                        ? "text-green-400"
                        : healthScore.score >= 40
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}
                  >
                    {healthScore.score.toFixed(0)}
                  </span>
                  <span className="text-slate-400 text-sm"> / 100</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(healthScore.breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-24 capitalize">{key}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min(100, val.score)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-300 w-8 text-right">
                        {val.score.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Velocity Forecast */}
            {forecast && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-indigo-400" />
                  Velocity Forecast
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Next period prediction (confidence: {((forecast.confidence ?? 0) * 100).toFixed(0)}%)
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Commits</span>
                    <span className="text-sm font-medium text-white">
                      ~{forecast.forecast.commits.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">PRs Merged</span>
                    <span className="text-sm font-medium text-white">
                      ~{forecast.forecast.prs_merged.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Lines Added</span>
                    <span className="text-sm font-medium text-white">
                      ~{formatNumber(Math.round(forecast.forecast.lines_added))}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Data points:</span>
                    <span className="text-xs text-slate-300">{forecast.data_points}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Gaming Flags */}
            {gamingFlags && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Integrity Check
                </h3>
                <div className="mb-3">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      gamingFlags.risk_level === "none"
                        ? "bg-green-500/10 text-green-400"
                        : gamingFlags.risk_level === "low"
                        ? "bg-blue-500/10 text-blue-400"
                        : gamingFlags.risk_level === "medium"
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    Risk: {gamingFlags.risk_level}
                  </span>
                </div>
                {gamingFlags.flags.length === 0 ? (
                  <p className="text-xs text-slate-400">No anomalous patterns detected.</p>
                ) : (
                  <div className="space-y-2">
                    {gamingFlags.flags.map((flag, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded-lg text-xs ${
                          flag.severity === "high"
                            ? "bg-red-500/10 text-red-300"
                            : flag.severity === "medium"
                            ? "bg-yellow-500/10 text-yellow-300"
                            : "bg-blue-500/10 text-blue-300"
                        }`}
                      >
                        <div className="font-medium capitalize">{flag.pattern.replace(/_/g, " ")}</div>
                        <div className="text-slate-400 mt-0.5">{flag.evidence}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PR Size Distribution + Code Churn */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PR Size Distribution */}
            {prSizes && prSizes.total_prs > 0 && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <GitPullRequest className="h-4 w-4 text-purple-400" />
                  PR Size Distribution
                </h3>
                <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
                  <span>Total: {prSizes.total_prs} PRs</span>
                  <span>Avg: {prSizes.avg_size.toFixed(0)} lines</span>
                  <span>Median: {prSizes.median_size.toFixed(0)} lines</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      { name: "Trivial", count: prSizes.distribution.trivial, color: "#6ee7b7" },
                      { name: "Small", count: prSizes.distribution.small, color: "#93c5fd" },
                      { name: "Medium", count: prSizes.distribution.medium, color: "#c4b5fd" },
                      { name: "Large", count: prSizes.distribution.large, color: "#fbbf24" },
                      { name: "Massive", count: prSizes.distribution.massive, color: "#f87171" },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#334155" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        color: "#f8fafc",
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {[
                        { color: "#6ee7b7" },
                        { color: "#93c5fd" },
                        { color: "#c4b5fd" },
                        { color: "#fbbf24" },
                        { color: "#f87171" },
                      ].map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Code Churn */}
            {codeChurn && (codeChurn.total_additions > 0 || codeChurn.total_deletions > 0) && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                  Code Churn
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-900 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Churn Rate</p>
                    <p
                      className={`text-xl font-bold ${
                        codeChurn.churn_rate > 0.3
                          ? "text-red-400"
                          : codeChurn.churn_rate > 0.15
                          ? "text-yellow-400"
                          : "text-green-400"
                      }`}
                    >
                      {(codeChurn.churn_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Churn Deletions</p>
                    <p className="text-xl font-bold text-white">
                      {formatNumber(codeChurn.churn_deletions)}
                    </p>
                  </div>
                </div>
                {codeChurn.per_repo.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 font-medium">Per Repository</p>
                    {codeChurn.per_repo.slice(0, 5).map((repo) => (
                      <div key={repo.repository} className="flex items-center gap-2">
                        <span className="text-xs text-slate-300 truncate flex-1">
                          {repo.repository}
                        </span>
                        <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              repo.churn_rate > 0.3
                                ? "bg-red-400"
                                : repo.churn_rate > 0.15
                                ? "bg-yellow-400"
                                : "bg-green-400"
                            }`}
                            style={{ width: `${Math.min(100, repo.churn_rate * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 w-10 text-right">
                          {(repo.churn_rate * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trend Chart */}
          {trendData.length > 1 && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-400" />
                Activity Trend
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="period"
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
                  <Line
                    type="monotone"
                    dataKey="commits"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#6366f1" }}
                    name="Commits"
                  />
                  <Line
                    type="monotone"
                    dataKey="prs"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#8b5cf6" }}
                    name="PRs Merged"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  prev,
  format,
  color,
  warn,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  prev?: number;
  format?: "perDay" | "perWeek";
  color?: string;
  warn?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  let delta: React.ReactNode = null;
  if (prev !== undefined && typeof value === "number") {
    const diff = value - prev;
    if (diff !== 0) {
      const pct =
        prev !== 0 ? ((diff / prev) * 100).toFixed(0) : diff > 0 ? "∞" : "0";
      delta = (
        <span
          className={`text-xs ${diff > 0 ? "text-green-400" : "text-red-400"}`}
        >
          {diff > 0 ? "+" : ""}
          {pct}%
        </span>
      );
    }
  }

  return (
    <div
      className={`bg-slate-800 rounded-xl p-4 border ${
        warn ? "border-amber-500/40" : "border-slate-700"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
        <span className="text-xs text-slate-400">{label}</span>
        {warn && (
          <span className="text-amber-400 text-[10px]">⚠</span>
        )}
      </div>
      <div className={`text-lg font-bold ${color || "text-white"}`}>
        {value}
      </div>
      {delta && <div className="mt-1">{delta}</div>}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
