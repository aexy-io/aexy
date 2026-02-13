"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  Target,
  Activity,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useSprint,
  useSprintBurndown,
  useTeamVelocity,
  useSprintAI,
  useSprintStats,
} from "@/hooks/useSprints";
import { redirect } from "next/navigation";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "default" | "success" | "warning" | "danger";
}

function StatCard({ title, value, subtitle, icon, trend, trendValue, color = "default" }: StatCardProps) {
  const colorClasses = {
    default: "text-white",
    success: "text-green-400",
    warning: "text-amber-400",
    danger: "text-red-400",
  };

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
        <span className="text-slate-400 text-sm">{title}</span>
        <div className="p-2 bg-slate-700 rounded-lg">{icon}</div>
      </div>
      <div className={`text-3xl font-bold ${colorClasses[color]} mb-1`}>{value}</div>
      {(subtitle || trend) && (
        <div className="flex items-center gap-2 text-sm">
          {subtitle && <span className="text-slate-400">{subtitle}</span>}
          {trend && trendValue && (
            <span
              className={`flex items-center gap-1 ${
                trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-slate-400"
              }`}
            >
              {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trendValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SprintAnalyticsPage({
  params,
}: {
  params: { projectId: string; sprintId: string };
}) {
  const { projectId, sprintId } = params;

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const { sprint, isLoading: sprintLoading } = useSprint(currentWorkspaceId, projectId, sprintId);
  const { stats } = useSprintStats(currentWorkspaceId, projectId, sprintId);
  const { burndown, isLoading: burndownLoading } = useSprintBurndown(sprintId);
  const { velocity, isLoading: velocityLoading } = useTeamVelocity(projectId, 6);
  const { capacity, prediction, isLoadingCapacity, isLoadingPrediction } = useSprintAI(sprintId);

  // Prepare burndown chart data
  const burndownData = useMemo(() => {
    if (!burndown) return [];
    return burndown.dates.map((date, i) => ({
      date: formatDate(date),
      ideal: burndown.ideal[i],
      actual: burndown.actual[i],
      scopeChange: burndown.scope_changes?.[i] || 0,
    }));
  }, [burndown]);

  // Prepare velocity chart data
  const velocityData = useMemo(() => {
    if (!velocity) return [];
    return velocity.sprints.map((s) => ({
      name: s.sprint_name,
      committed: s.committed,
      completed: s.completed,
      carryOver: s.carry_over,
      completionRate: Math.round(s.completion_rate * 100),
    }));
  }, [velocity]);

  if (authLoading || currentWorkspaceLoading || sprintLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const completionRate = stats
    ? Math.round((stats.completed_tasks / Math.max(stats.total_tasks, 1)) * 100)
    : 0;

  const pointsCompletionRate = stats
    ? Math.round((stats.completed_points / Math.max(stats.total_points, 1)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/sprints/${projectId}/${sprintId}`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <BarChart3 className="h-5 w-5 text-slate-300" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Sprint Analytics</h1>
                <p className="text-slate-400 text-sm">{sprint?.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Task Completion"
            value={`${completionRate}%`}
            subtitle={`${stats?.completed_tasks || 0}/${stats?.total_tasks || 0} tasks`}
            icon={<CheckCircle className="h-5 w-5 text-green-400" />}
            color={completionRate >= 80 ? "success" : completionRate >= 50 ? "warning" : "danger"}
          />
          <StatCard
            title="Points Completed"
            value={`${pointsCompletionRate}%`}
            subtitle={`${stats?.completed_points || 0}/${stats?.total_points || 0} SP`}
            icon={<Target className="h-5 w-5 text-blue-400" />}
            color={pointsCompletionRate >= 80 ? "success" : pointsCompletionRate >= 50 ? "warning" : "danger"}
          />
          <StatCard
            title="In Progress"
            value={stats?.in_progress_tasks || 0}
            subtitle="tasks being worked on"
            icon={<Activity className="h-5 w-5 text-amber-400" />}
          />
          <StatCard
            title="Average Velocity"
            value={velocity?.average_velocity || 0}
            subtitle="points per sprint"
            icon={<Zap className="h-5 w-5 text-purple-400" />}
            trend={velocity?.trend === "improving" ? "up" : velocity?.trend === "declining" ? "down" : "neutral"}
            trendValue={velocity?.trend || "stable"}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Burndown Chart */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-slate-400" />
              Burndown Chart
            </h2>
            {burndownLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : burndownData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={burndownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="ideal"
                    name="Ideal"
                    stroke="#64748b"
                    fill="#64748b"
                    fillOpacity={0.1}
                    strokeDasharray="5 5"
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                No burndown data available yet
              </div>
            )}
          </div>

          {/* Velocity Trend */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-400" />
              Velocity Trend
            </h2>
            {velocityLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : velocityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Bar dataKey="committed" name="Committed" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="carryOver" name="Carry Over" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                No velocity data available yet
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Capacity Analysis */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-400" />
              Capacity Analysis
            </h2>
            {isLoadingCapacity ? (
              <div className="py-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : capacity ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-white">
                      {Math.round(capacity.total_capacity_hours)}h
                    </div>
                    <div className="text-xs text-slate-400">Total Capacity</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {Math.round(capacity.committed_hours)}h
                    </div>
                    <div className="text-xs text-slate-400">Committed</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div
                      className={`text-2xl font-bold ${
                        capacity.overcommitted ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {Math.round(capacity.utilization_rate * 100)}%
                    </div>
                    <div className="text-xs text-slate-400">Utilization</div>
                  </div>
                </div>

                {capacity.overcommitted && (
                  <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-red-400 font-medium text-sm">Sprint is overcommitted</p>
                      <p className="text-red-300/70 text-xs">
                        Consider reducing scope or extending timeline
                      </p>
                    </div>
                  </div>
                )}

                {capacity.recommendations && capacity.recommendations.length > 0 && (
                  <div className="pt-3 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Recommendations</h4>
                    <ul className="space-y-1">
                      {capacity.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                          <span className="text-primary-400">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                No capacity data available
              </div>
            )}
          </div>

          {/* Completion Prediction */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              Completion Prediction
            </h2>
            {isLoadingPrediction ? (
              <div className="py-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : prediction ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`text-5xl font-bold ${
                      prediction.predicted_completion_rate >= 0.8
                        ? "text-green-400"
                        : prediction.predicted_completion_rate >= 0.6
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {Math.round(prediction.predicted_completion_rate * 100)}%
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Predicted Completion</p>
                    <p className="text-slate-400 text-sm">
                      Confidence: {Math.round(prediction.confidence * 100)}%
                    </p>
                  </div>
                </div>

                {prediction.risk_factors && prediction.risk_factors.length > 0 && (
                  <div className="pt-3 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Risk Factors
                    </h4>
                    <ul className="space-y-1">
                      {prediction.risk_factors.map((risk, i) => (
                        <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                          <span className="text-red-400">•</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {prediction.at_risk_tasks && prediction.at_risk_tasks.length > 0 && (
                  <div className="pt-3 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-amber-400 mb-2">At-Risk Tasks</h4>
                    <div className="space-y-2">
                      {prediction.at_risk_tasks.slice(0, 3).map((task, i) => (
                        <div key={i} className="text-sm bg-slate-700/50 rounded p-2">
                          <span className="text-white">{task.title}</span>
                          <span className="text-slate-500 ml-2">({task.risk})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {prediction.recommendations && prediction.recommendations.length > 0 && (
                  <div className="pt-3 border-t border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Recommendations</h4>
                    <ul className="space-y-1">
                      {prediction.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                          <span className="text-green-400">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                No prediction data available
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
