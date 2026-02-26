"use client";

import Link from "next/link";
import { Clock, ChevronRight, Timer } from "lucide-react";
import { useTrackingDashboard } from "@/hooks/useTracking";

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function TimeTrackingWidget() {
  const { data: trackingData, isLoading } = useTrackingDashboard();

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-8 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  const timeLoggedToday = trackingData?.time_logged_today || 0;
  const activeTasks = trackingData?.active_tasks || [];
  const activeTasksCount = activeTasks.length;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Time Tracking</h3>
        </div>
        <Link
          href="/tracking/time"
          className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {/* Time logged display */}
        <div className="text-center mb-4">
          <p className="text-3xl font-bold text-foreground">
            {timeLoggedToday > 0 ? formatTime(timeLoggedToday) : "0m"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {timeLoggedToday > 0
              ? "Logged today"
              : "No time logged yet today"}
          </p>
        </div>

        {/* Active tasks count */}
        <div className="p-3 bg-muted/50 rounded-lg border border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">Active Tasks</span>
          </div>
          <span className="text-lg font-bold text-foreground">{activeTasksCount}</span>
        </div>

        {/* CTA */}
        <Link
          href="/tracking/time"
          className="mt-4 block w-full text-center px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 rounded-lg text-sm font-medium transition"
        >
          Log Time
        </Link>
      </div>
    </div>
  );
}
