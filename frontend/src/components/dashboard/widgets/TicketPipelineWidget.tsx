"use client";

import Link from "next/link";
import {
  GitPullRequest,
  ChevronRight,
  Ticket,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketStats } from "@/hooks/useTicketing";

const PIPELINE_STAGES = [
  { key: "open", label: "Open", color: "bg-blue-500", textColor: "text-blue-400" },
  { key: "in_progress", label: "In Progress", color: "bg-amber-500", textColor: "text-amber-400" },
  { key: "pending", label: "Pending", color: "bg-purple-500", textColor: "text-purple-400" },
  { key: "resolved", label: "Resolved", color: "bg-green-500", textColor: "text-green-400" },
  { key: "closed", label: "Closed", color: "bg-muted-foreground", textColor: "text-muted-foreground" },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-muted/50 text-muted-foreground",
};

export function TicketPipelineWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stats, isLoading } = useTicketStats(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const statusBreakdown = stats?.by_status || stats?.status_breakdown || {};
  const priorityBreakdown = stats?.by_priority || stats?.priority_breakdown || {};
  const totalTickets = stats?.total || Object.values(statusBreakdown).reduce((a: number, b: any) => a + (b as number), 0) || 0;
  const hasData = totalTickets > 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <GitPullRequest className="h-5 w-5 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Ticket Pipeline</h3>
          {hasData && (
            <span className="text-muted-foreground text-xs">{totalTickets} total</span>
          )}
        </div>
        <Link
          href="/tickets"
          className="text-orange-400 hover:text-orange-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view tickets.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No tickets yet. Create your first ticket to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pipeline stages */}
            <div className="space-y-2">
              {PIPELINE_STAGES.map((stage, idx) => {
                const count =
                  (statusBreakdown as any)[stage.key] || 0;
                if (count === 0 && idx > 2) return null; // hide empty trailing stages
                const width =
                  totalTickets > 0
                    ? Math.max(8, (count / totalTickets) * 100)
                    : 0;
                return (
                  <div
                    key={stage.key}
                    className="flex items-center gap-3"
                  >
                    <span className={`text-xs w-20 text-right ${stage.textColor}`}>
                      {stage.label}
                    </span>
                    <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden">
                      <div
                        className={`h-full ${stage.color} rounded-md flex items-center px-2 transition-all`}
                        style={{ width: `${width}%`, minWidth: count > 0 ? "28px" : "0" }}
                      >
                        {count > 0 && (
                          <span className="text-foreground text-xs font-medium">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Priority breakdown */}
            {Object.keys(priorityBreakdown).length > 0 && (
              <div className="pt-3 border-t border-border">
                <span className="text-muted-foreground text-xs mb-2 block">
                  By Priority
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(priorityBreakdown).map(
                    ([priority, count]) =>
                      (count as number) > 0 && (
                        <span
                          key={priority}
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            PRIORITY_COLORS[priority] || PRIORITY_COLORS.low
                          }`}
                        >
                          {priority}: {count as number}
                        </span>
                      )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
