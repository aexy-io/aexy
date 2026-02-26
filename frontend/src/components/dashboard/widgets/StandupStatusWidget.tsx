"use client";

import Link from "next/link";
import {
  CheckCircle,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { useTrackingDashboard } from "@/hooks/useTracking";

export function StandupStatusWidget() {
  const { data: trackingData, isLoading } = useTrackingDashboard();

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-muted rounded-lg" />
          <div className="h-8 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  const standupStatus = trackingData?.today_standup;
  const submitted = standupStatus?.submitted || false;
  const todaysStandup = trackingData?.todays_standup;
  const hasYesterday = !!todaysStandup?.yesterday_summary;
  const hasTodayPlan = !!todaysStandup?.today_plan;
  const hasBlockers = !!todaysStandup?.blockers_summary;
  const blockersCount = trackingData?.active_blockers?.length || 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-green-500/10 rounded-lg shrink-0">
            <CheckCircle className="h-4 w-4 text-green-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Standup Status</h3>
        </div>
        <Link
          href="/tracking/standups"
          className="text-green-400 hover:text-green-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {/* Status display */}
        <div className="text-center mb-4">
          <p
            className={`text-2xl font-bold ${
              submitted ? "text-green-400" : "text-muted-foreground"
            }`}
          >
            {submitted ? "Submitted" : "Pending"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {submitted ? "Today's standup is complete" : "You haven't submitted today's standup yet"}
          </p>
        </div>

        {/* Summary when submitted */}
        {submitted && (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg border border-border/50">
              <p className={`text-lg font-bold ${hasYesterday ? "text-foreground" : "text-muted-foreground"}`}>
                {hasYesterday ? "Done" : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Yesterday</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg border border-border/50">
              <p className={`text-lg font-bold ${hasTodayPlan ? "text-foreground" : "text-muted-foreground"}`}>
                {hasTodayPlan ? "Set" : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg border border-border/50">
              <p
                className={`text-lg font-bold ${
                  blockersCount > 0 ? "text-orange-400" : "text-foreground"
                }`}
              >
                {blockersCount}
              </p>
              <p className="text-xs text-muted-foreground">Blockers</p>
            </div>
          </div>
        )}

        {/* CTA when not submitted */}
        {!submitted && (
          <Link
            href="/tracking/standups"
            className="mt-2 block w-full text-center px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 rounded-lg text-sm font-medium transition"
          >
            Submit Standup
          </Link>
        )}
      </div>
    </div>
  );
}
