"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, TrendingUp, Users, BarChart3, Timer, Activity } from "lucide-react";
import { sprintApi } from "@/lib/api";

interface CycleTimeChartProps {
  sprintId: string;
}

export function CycleTimeChart({ sprintId }: CycleTimeChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["cycleTimeAnalytics", sprintId],
    queryFn: () => sprintApi.getCycleTimeAnalytics(sprintId),
    enabled: !!sprintId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-accent rounded w-24 mb-2" />
              <div className="h-8 bg-accent rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.completed_count === 0) {
    return (
      <div className="bg-muted border border-border rounded-xl p-8 text-center">
        <Timer className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium text-foreground mb-1">No Cycle Time Data</h3>
        <p className="text-sm text-muted-foreground">
          Complete tasks to see cycle time analytics. Data is populated when tasks move to &quot;Done&quot;.
        </p>
      </div>
    );
  }

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const priorityColors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
  };

  const maxCycleTime = Math.max(
    ...Object.values(data.by_priority).map((p) => p.avg_cycle_time),
    1
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Avg Cycle Time</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatHours(data.cycle_time.avg)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Median: {formatHours(data.cycle_time.median)} · P90: {formatHours(data.cycle_time.p90)}
          </div>
        </div>

        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Avg Lead Time</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatHours(data.lead_time.avg)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Median: {formatHours(data.lead_time.median)} · P90: {formatHours(data.lead_time.p90)}
          </div>
        </div>

        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Throughput</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.throughput.tasks_per_week}/wk</div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.throughput.points_per_week} points/week · {data.completed_count} completed
          </div>
        </div>
      </div>

      {/* Cycle Time by Priority */}
      {Object.keys(data.by_priority).length > 0 && (
        <div className="bg-muted border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Cycle Time by Priority
          </h3>
          <div className="space-y-3">
            {Object.entries(data.by_priority).map(([priority, info]) => (
              <div key={priority} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16 capitalize">{priority}</span>
                <div className="flex-1 bg-background rounded-full h-6 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full ${priorityColors[priority] || "bg-primary-500"} transition-all`}
                    style={{ width: `${Math.max((info.avg_cycle_time / maxCycleTime) * 100, 8)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-foreground">
                    {formatHours(info.avg_cycle_time)} ({info.count} tasks)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cycle Time by Assignee */}
      {Object.keys(data.by_assignee).length > 0 && (
        <div className="bg-muted border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Cycle Time by Assignee
          </h3>
          <div className="space-y-2">
            {Object.entries(data.by_assignee).map(([id, info]) => (
              <div key={id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="text-sm text-foreground">{info.developer_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({info.tasks_completed} tasks)</span>
                </div>
                <span className="text-sm font-medium text-foreground">{formatHours(info.avg_cycle_time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
