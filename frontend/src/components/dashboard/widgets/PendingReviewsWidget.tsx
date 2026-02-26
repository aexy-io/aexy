"use client";

import Link from "next/link";
import { Clock, ChevronRight, CheckCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useManagerReviews } from "@/hooks/useReviews";
import { useAuth } from "@/hooks/useAuth";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PendingReviewsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { reviews, isLoading } = useManagerReviews(user?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const pendingReviews = reviews.filter(
    (r) => r.status !== "completed" && r.status !== "acknowledged"
  );

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-amber-500/10 rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              Pending Reviews
            </h3>
            {pendingReviews.length > 0 && (
              <span className="text-xs text-amber-400">
                {pendingReviews.length} pending
              </span>
            )}
          </div>
        </div>
        <Link
          href="/reviews"
          className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="p-4 space-y-2">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view pending reviews.
            </p>
          </div>
        ) : pendingReviews.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-muted-foreground text-sm">
              No pending reviews
            </p>
          </div>
        ) : (
          pendingReviews.slice(0, 5).map((review) => (
            <Link
              key={review.id}
              href={`/reviews/${review.id}`}
              className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                  {review.developer_name?.[0] || "?"}
                </div>
                <div className="min-w-0">
                  <span className="text-sm text-foreground truncate block">
                    {review.developer_name || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate block">
                    {review.review_cycle_id.slice(0, 8)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                {formatDate(review.updated_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
