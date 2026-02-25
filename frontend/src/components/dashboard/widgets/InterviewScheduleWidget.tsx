"use client";

import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessments } from "@/hooks/useAssessments";

export function InterviewScheduleWidget() {
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

  const activeAssessments = assessments.filter((a) => a.status === "active");

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Interview Schedule
          </h3>
        </div>
        <Link
          href="/hiring"
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition"
        >
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view interviews.
            </p>
          </div>
        ) : activeAssessments.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Upcoming Interviews
            </p>
            {activeAssessments.slice(0, 4).map((assessment) => (
              <Link
                key={assessment.id}
                href={`/hiring/${assessment.id}`}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-foreground truncate">
                    {assessment.title}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap ml-2">
                  <Users className="h-3 w-3" />
                  {assessment.total_candidates} candidates
                </div>
              </Link>
            ))}
            {activeAssessments.length > 4 && (
              <div className="text-center text-muted-foreground text-xs pt-1">
                +{activeAssessments.length - 4} more assessments
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No upcoming interviews.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
