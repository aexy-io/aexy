"use client";

import Link from "next/link";
import { RefreshCw, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReviewCycles, useReviewCycle } from "@/hooks/useReviews";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  active: "bg-green-500/10 text-green-400",
  self_review: "bg-blue-500/10 text-blue-400",
  peer_review: "bg-violet-500/10 text-violet-400",
  manager_review: "bg-indigo-500/10 text-indigo-400",
  completed: "bg-emerald-500/10 text-emerald-400",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  self_review: "Self Review",
  peer_review: "Peer Review",
  manager_review: "Manager Review",
  completed: "Completed",
};

export function ReviewCycleWidget() {
  const { currentWorkspace } = useWorkspace();
  const { cycles, isLoading } = useReviewCycles(
    currentWorkspace?.id || null
  );

  // Find the active cycle (prefer active statuses over draft/completed)
  const activeCycle = cycles.find(
    (c) =>
      c.status === "active" ||
      c.status === "self_review" ||
      c.status === "peer_review" ||
      c.status === "manager_review"
  );

  // Load the detail for the active cycle to get total_reviews / completed_reviews
  const { cycle: cycleDetail, isLoading: isLoadingDetail } = useReviewCycle(
    activeCycle?.id || null
  );

  if (isLoading || isLoadingDetail) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-4 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  const totalReviews = cycleDetail?.total_reviews || 0;
  const completedReviews = cycleDetail?.completed_reviews || 0;
  const progressPercent =
    totalReviews > 0 ? Math.round((completedReviews / totalReviews) * 100) : 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <RefreshCw className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Review Cycle
          </h3>
        </div>
        <Link
          href="/reviews/cycles"
          className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view review cycles.
            </p>
          </div>
        ) : !activeCycle ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <RefreshCw className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No active review cycle
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {activeCycle.name}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${statusColors[activeCycle.status] || "bg-gray-500/10 text-gray-400"}`}
              >
                {statusLabels[activeCycle.status] || activeCycle.status}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {completedReviews} / {totalReviews} reviews completed
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {new Date(activeCycle.period_start).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
                )}
              </span>
              <span>
                {new Date(activeCycle.period_end).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
