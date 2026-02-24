"use client";

import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";
import { useGoals } from "@/hooks/useReviews";
import { useAuth } from "@/hooks/useAuth";

const statusColors: Record<string, { bg: string; text: string }> = {
  not_started: { bg: "bg-muted", text: "text-muted-foreground" },
  draft: { bg: "bg-muted", text: "text-muted-foreground" },
  active: { bg: "bg-blue-500/20", text: "text-blue-400" },
  in_progress: { bg: "bg-amber-500/20", text: "text-amber-400" },
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  cancelled: { bg: "bg-red-500/20", text: "text-red-400" },
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MyGoalsWidget() {
  const { user } = useAuth();
  const { goals, isLoading } = useGoals(user?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const displayGoals = goals?.slice(0, 4) || [];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <Target className="h-5 w-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">My Goals</h3>
        </div>
        <Link
          href="/reviews/goals"
          className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {displayGoals.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              No goals set yet. Define goals to track your progress.
            </p>
            <Link
              href="/reviews/goals/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm font-medium transition"
            >
              Create Your First Goal
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {displayGoals.map((goal) => {
              const colors = statusColors[goal.status] || statusColors.draft;
              return (
                <div
                  key={goal.id}
                  className="p-3 bg-muted/50 rounded-lg border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground truncate mr-2">
                      {goal.title}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${colors.bg} ${colors.text}`}
                    >
                      {formatStatus(goal.status)}
                    </span>
                  </div>
                  <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(goal.progress_percentage, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {goal.progress_percentage}%
                    </span>
                    {goal.completed_at ? (
                      <span className="text-xs text-muted-foreground">
                        Completed
                      </span>
                    ) : goal.time_bound ? (
                      <span className="text-xs text-muted-foreground">
                        Due {new Date(goal.time_bound).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
