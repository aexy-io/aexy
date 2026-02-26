"use client";

import Link from "next/link";
import {
  BarChart3,
  ChevronRight,
  UserPlus,
  PlayCircle,
  CheckCircle2,
  FileEdit,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessments } from "@/hooks/useAssessments";

export function CandidateStatsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { assessments, isLoading } = useAssessments(
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalCandidates = assessments.reduce(
    (sum, a) => sum + (a.total_candidates || 0),
    0
  );
  const activeCount = assessments.filter((a) => a.status === "active").length;
  const completedCount = assessments.filter(
    (a) => a.status === "completed"
  ).length;
  const draftCount = assessments.filter((a) => a.status === "draft").length;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-cyan-500/10 rounded-lg shrink-0">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Candidate Stats
          </h3>
        </div>
        <Link
          href="/hiring/analytics"
          className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          Analytics <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view candidate stats.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-muted-foreground text-xs">
                  Total Candidates
                </span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {totalCandidates}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <PlayCircle className="h-3.5 w-3.5 text-green-400" />
                <span className="text-muted-foreground text-xs">
                  Active Assessments
                </span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {activeCount}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-muted-foreground text-xs">Completed</span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {completedCount}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <FileEdit className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-muted-foreground text-xs">Draft</span>
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {draftCount}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
