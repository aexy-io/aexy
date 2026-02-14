"use client";

import { BarChart3 } from "lucide-react";

interface WorkPatterns {
  preferred_complexity?: string;
  peak_productivity_hours?: number[];
  average_review_turnaround_hours?: number;
  average_pr_size: number;
  collaboration_style?: string;
}

interface WorkPatternsWidgetProps {
  workPatterns: WorkPatterns | undefined;
}

export function WorkPatternsWidget({ workPatterns }: WorkPatternsWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Work Patterns</h3>
        </div>
      </div>
      <div className="p-6">
        {workPatterns ? (
          <div className="space-y-5">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-sm">Complexity Preference</span>
              </div>
              <p className="text-foreground font-medium capitalize">
                {workPatterns.preferred_complexity || "Balanced"}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-sm">Peak Hours</span>
              </div>
              <p className="text-foreground font-medium">
                {workPatterns.peak_productivity_hours?.length
                  ? workPatterns.peak_productivity_hours.slice(0, 3).map(h => `${h}:00`).join(", ")
                  : "Not analyzed"}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-sm">Review Turnaround</span>
              </div>
              <p className="text-foreground font-medium">
                {workPatterns.average_review_turnaround_hours
                  ? `${workPatterns.average_review_turnaround_hours.toFixed(1)} hours`
                  : "N/A"}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-sm">PR Efficiency</span>
              </div>
              <p className="text-foreground font-medium">
                {workPatterns.average_pr_size > 200 ? "Large PRs" :
                  workPatterns.average_pr_size > 50 ? "Medium PRs" : "Small PRs"}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Work patterns will appear after more activity is analyzed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
