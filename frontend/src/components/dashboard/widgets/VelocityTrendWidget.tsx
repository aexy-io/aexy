"use client";

import Link from "next/link";
import { TrendingUp, ChevronRight, Activity } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useTeamVelocity } from "@/hooks/useSprints";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function VelocityTrendWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { velocity, isLoading } = useTeamVelocity(defaultTeamId);

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  const sprints = velocity?.sprints || [];
  const hasData = sprints.length > 0;
  const trend = velocity?.trend;
  const avgVelocity = velocity?.average_velocity ?? 0;

  const trendColor =
    trend === "improving"
      ? "text-green-400"
      : trend === "declining"
        ? "text-red-400"
        : "text-slate-400";

  const chartData = sprints.map((s: any) => ({
    name: s.sprint_name || s.sprint_id?.slice(0, 8),
    committed: s.committed,
    completed: s.completed,
  }));

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <TrendingUp className="h-5 w-5 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Velocity Trend</h3>
          {hasData && (
            <span className={`text-xs font-medium ${trendColor} capitalize`}>
              {trend}
            </span>
          )}
        </div>
        <Link
          href="/sprints"
          className="text-green-400 hover:text-green-300 text-sm flex items-center gap-1 transition"
        >
          View sprints <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace || !defaultTeamId ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              {!currentWorkspace
                ? "Select a workspace to view velocity."
                : "Create a team to track velocity."}
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Complete sprints to see velocity trends.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-slate-400 text-xs">Avg velocity:</span>
              <span className="text-white font-semibold text-sm tabular-nums">
                {avgVelocity.toFixed(1)} pts/sprint
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
                />
                <Line
                  type="monotone"
                  dataKey="committed"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  dot={{ fill: "#94a3b8", r: 3 }}
                  name="Committed"
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={{ fill: "#4ade80", r: 3 }}
                  name="Completed"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
