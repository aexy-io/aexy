"use client";

import Link from "next/link";
import {
  Users,
  ChevronRight,
  ClipboardCheck,
  PlayCircle,
  UserPlus,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessments } from "@/hooks/useAssessments";

export function HiringPipelineWidget() {
  const { currentWorkspace } = useWorkspace();
  const { assessments, isLoading } = useAssessments(
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalAssessments = assessments.length;
  const activeAssessments = assessments.filter((a) => a.status === "active");
  const totalCandidates = assessments.reduce(
    (sum, a) => sum + (a.total_candidates || 0),
    0
  );

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-lg">
            <Users className="h-5 w-5 text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Hiring Pipeline
          </h3>
        </div>
        <Link
          href="/hiring"
          className="text-violet-400 hover:text-violet-300 text-sm flex items-center gap-1 transition"
        >
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view hiring data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ClipboardCheck className="h-3 w-3 text-violet-400" />
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {totalAssessments}
                </p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <PlayCircle className="h-3 w-3 text-green-400" />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {activeAssessments.length}
                </p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <UserPlus className="h-3 w-3 text-cyan-400" />
                  <span className="text-xs text-muted-foreground">
                    Candidates
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {totalCandidates}
                </p>
              </div>
            </div>

            {/* Active assessments list */}
            {activeAssessments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Active Assessments
                </p>
                {activeAssessments.slice(0, 3).map((assessment) => (
                  <Link
                    key={assessment.id}
                    href={`/hiring/${assessment.id}`}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-400" />
                      <span className="text-sm text-foreground truncate">
                        {assessment.title}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {assessment.total_candidates} candidates
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm">
                  No active assessments.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
