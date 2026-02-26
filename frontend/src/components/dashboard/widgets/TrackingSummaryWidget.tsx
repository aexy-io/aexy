"use client";

import Link from "next/link";
import {
  Target,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useTrackingDashboard } from "@/hooks/useTracking";

export function TrackingSummaryWidget() {
  const { data: trackingData, isLoading } = useTrackingDashboard();

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const standupSubmitted = trackingData?.today_standup?.submitted || false;
  const activeBlockersCount = trackingData?.active_blockers?.length || 0;
  const timeLoggedToday = trackingData?.time_logged_today || 0;
  const activeTasksCount = trackingData?.active_tasks?.length || 0;

  // Format minutes to hours/minutes display
  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg shrink-0">
            <Target className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Today&apos;s Tracking</h3>
        </div>
        <Link
          href="/tracking"
          className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 gap-3">
          {/* Standup Status */}
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              {standupSubmitted ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-muted-foreground text-xs whitespace-nowrap">Standup</span>
            </div>
            <p
              className={`text-base font-bold ${standupSubmitted ? "text-green-400" : "text-muted-foreground"}`}
            >
              {standupSubmitted ? "Submitted" : "Pending"}
            </p>
          </div>

          {/* Active Tasks */}
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span className="text-muted-foreground text-xs whitespace-nowrap">Active Tasks</span>
            </div>
            <p className="text-xl font-bold text-foreground">{activeTasksCount}</p>
          </div>

          {/* Blockers */}
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle
                className={`h-3.5 w-3.5 shrink-0 ${activeBlockersCount > 0 ? "text-orange-400" : "text-muted-foreground"}`}
              />
              <span className="text-muted-foreground text-xs whitespace-nowrap">Blockers</span>
            </div>
            <p
              className={`text-xl font-bold ${activeBlockersCount > 0 ? "text-orange-400" : "text-foreground"}`}
            >
              {activeBlockersCount}
            </p>
          </div>

          {/* Time Logged */}
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-xs whitespace-nowrap">Time Today</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatTime(timeLoggedToday)}
            </p>
          </div>
        </div>

        {/* Quick action for standup */}
        {!standupSubmitted && (
          <Link
            href="/tracking/standups"
            className="mt-4 block w-full text-center px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-lg text-sm font-medium transition"
          >
            Submit Standup
          </Link>
        )}
      </div>
    </div>
  );
}
