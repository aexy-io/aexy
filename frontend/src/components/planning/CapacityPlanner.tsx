"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Calendar, AlertTriangle, Clock, Shield } from "lucide-react";
import { sprintApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CapacityPlannerProps {
  sprintId: string;
}

export function CapacityPlanner({ sprintId }: CapacityPlannerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["sprintCapacity", sprintId],
    queryFn: () => sprintApi.getCapacity(sprintId),
    enabled: !!sprintId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted border border-border rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-accent rounded w-32 mb-3" />
            <div className="h-6 bg-accent rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-muted border border-border rounded-xl p-8 text-center">
        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-medium text-foreground mb-1">No Capacity Data</h3>
        <p className="text-sm text-muted-foreground">
          Add team members and tasks to see capacity analysis.
        </p>
      </div>
    );
  }

  const utilizationColor = (util: number) => {
    if (util > 1.0) return "text-red-500";
    if (util > 0.8) return "text-amber-500";
    return "text-emerald-500";
  };

  const barColor = (util: number) => {
    if (util > 1.0) return "bg-red-500";
    if (util > 0.8) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-6">
      {/* Overall Capacity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Capacity</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.total_capacity_hours}h</div>
        </div>

        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Committed</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{data.committed_hours}h</div>
        </div>

        <div className="bg-muted border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Utilization</span>
          </div>
          <div className={cn("text-2xl font-bold", utilizationColor(data.utilization_rate))}>
            {Math.round(data.utilization_rate * 100)}%
          </div>
          {data.overcommitted && (
            <span className="text-xs text-red-500 font-medium">Overcommitted</span>
          )}
        </div>
      </div>

      {/* Per-Member Capacity Bars */}
      <div className="bg-muted border border-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team Member Capacity
        </h3>
        <div className="space-y-4">
          {data.per_member_capacity.map((member) => {
            const util = member.utilization || 0;
            const barWidth = Math.min(util * 100, 100);

            return (
              <div key={member.developer_id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium">{member.developer_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {member.assigned_tasks} tasks · {member.assigned_points} pts
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.leave_days ? (
                      <span className="text-xs text-amber-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {member.leave_days}d leave
                      </span>
                    ) : null}
                    {member.oncall_days ? (
                      <span className="text-xs text-blue-500 flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        {member.oncall_days}d on-call
                      </span>
                    ) : null}
                    <span className={cn("text-sm font-medium", utilizationColor(util))}>
                      {Math.round(util * 100)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-background rounded-full h-3 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor(util))}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{member.committed_hours}h committed</span>
                  <span>{member.capacity_hours}h available</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-muted border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Recommendations
          </h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
