"use client";

import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessments } from "@/hooks/useAssessments";

export function OpenPositionsWidget() {
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
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg shrink-0">
            <Briefcase className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Open Positions
          </h3>
        </div>
        <Link
          href="/hiring"
          className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view open positions.
            </p>
          </div>
        ) : activeAssessments.length > 0 ? (
          <div className="space-y-2">
            {activeAssessments.slice(0, 5).map((assessment) => (
              <Link
                key={assessment.id}
                href={`/hiring/${assessment.id}`}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-foreground truncate">
                    {assessment.title}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap ml-2">
                  <Users className="h-3 w-3" />
                  {assessment.total_candidates}
                </div>
              </Link>
            ))}
            {activeAssessments.length > 5 && (
              <div className="text-center text-muted-foreground text-xs pt-1">
                +{activeAssessments.length - 5} more positions
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No open positions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
