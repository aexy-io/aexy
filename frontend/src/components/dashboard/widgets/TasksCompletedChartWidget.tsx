"use client";

import Link from "next/link";
import { CheckSquare, ChevronRight, BarChart3 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useTeamVelocity } from "@/hooks/useSprints";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function TasksCompletedChartWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { velocity, isLoading } = useTeamVelocity(defaultTeamId);

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  const sprints = velocity?.sprints || [];
  const hasData = sprints.length > 0;

  const chartData = sprints.map((s: any) => ({
    name: s.sprint_name || s.sprint_id?.slice(0, 8),
    completed: s.completed,
    carryOver: s.carry_over || 0,
  }));

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <CheckSquare className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Tasks Completed</h3>
        </div>
        <Link
          href="/sprints"
          className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 transition"
        >
          View sprints <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace || !defaultTeamId ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              {!currentWorkspace
                ? "Select a workspace to view task completion."
                : "Create a team to track tasks."}
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckSquare className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Complete sprints to see tasks completed per sprint.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
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
              <Bar
                dataKey="completed"
                fill="#34d399"
                radius={[4, 4, 0, 0]}
                name="Completed"
              />
              <Bar
                dataKey="carryOver"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                name="Carry Over"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
