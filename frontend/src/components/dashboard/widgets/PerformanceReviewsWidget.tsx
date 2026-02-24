"use client";

import Link from "next/link";
import { ClipboardCheck, ChevronRight, Star } from "lucide-react";
import { useReviewStats } from "@/hooks/useReviews";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { ReviewStatus } from "@/lib/api";

const statusLabels: Record<ReviewStatus, string> = {
  pending: "Pending",
  self_review_submitted: "Self Review",
  peer_review_in_progress: "Peer Review",
  manager_review_in_progress: "Manager Review",
  completed: "Completed",
  acknowledged: "Acknowledged",
};

const statusColors: Record<ReviewStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  self_review_submitted: "bg-blue-500/10 text-blue-400",
  peer_review_in_progress: "bg-violet-500/10 text-violet-400",
  manager_review_in_progress: "bg-indigo-500/10 text-indigo-400",
  completed: "bg-green-500/10 text-green-400",
  acknowledged: "bg-emerald-500/10 text-emerald-400",
};

export function PerformanceReviewsWidget() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { reviews, isLoading } = useReviewStats(
    user?.id || null,
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const latestReviews = reviews.slice(0, 5);

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <ClipboardCheck className="h-5 w-5 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            My Reviews
          </h3>
        </div>
        <Link
          href="/reviews"
          className="text-green-400 hover:text-green-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-4 space-y-2">
        {latestReviews.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No reviews yet
          </p>
        ) : (
          latestReviews.map((review) => (
            <Link
              key={review.id}
              href={`/reviews/${review.id}`}
              className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardCheck className="h-4 w-4 text-green-400 flex-shrink-0" />
                <span className="text-sm text-foreground truncate">
                  {review.review_cycle_id.slice(0, 8)}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[review.status]}`}
                >
                  {statusLabels[review.status]}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {review.overall_rating !== null && (
                  <>
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-medium text-foreground">
                      {review.overall_rating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
