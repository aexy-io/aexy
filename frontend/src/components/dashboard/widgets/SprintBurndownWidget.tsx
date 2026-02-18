"use client";

import Link from "next/link";
import { TrendingDown, ChevronRight, Calendar } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useActiveSprint, useSprintBurndown } from "@/hooks/useSprints";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function SprintBurndownWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { sprint: activeSprint, isLoading: sprintLoading } = useActiveSprint(
    currentWorkspace?.id || null,
    defaultTeamId
  );
  const { burndown, isLoading: burndownLoading } = useSprintBurndown(
    activeSprint?.id || null
  );

  const isLoading = sprintLoading || burndownLoading;

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-muted rounded mb-4" />
        <div className="h-48 bg-muted rounded-lg" />
      </div>
    );
  }

  const hasData =
    burndown && burndown.dates && burndown.dates.length > 0;

  // Build chart data
  const chartData = hasData
    ? burndown.dates.map((date: string, i: number) => ({
        date: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        ideal: burndown.ideal?.[i] ?? 0,
        actual: burndown.actual?.[i] ?? null,
      }))
    : [];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <TrendingDown className="h-5 w-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Sprint Burndown</h3>
        </div>
        <Link
          href="/sprints"
          className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
        >
          View sprint <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view burndown.
            </p>
          </div>
        ) : !activeSprint ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No active sprint to show burndown.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Burndown data will appear as the sprint progresses.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground text-xs mb-3">
              {activeSprint.name}
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
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
                <Area
                  type="monotone"
                  dataKey="ideal"
                  stroke="#64748b"
                  fill="#64748b"
                  fillOpacity={0.1}
                  strokeDasharray="5 5"
                  name="Ideal"
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.15}
                  name="Actual"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
