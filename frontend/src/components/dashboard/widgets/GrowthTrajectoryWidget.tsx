"use client";

import Link from "next/link";
import { TrendingUp, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useDeveloperInsights } from "@/hooks/useInsights";

export function GrowthTrajectoryWidget() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { insights, isLoading } = useDeveloperInsights(
    currentWorkspace?.id || null,
    user?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="h-16 bg-muted rounded-lg mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Growth Trajectory</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view growth data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Derive growth-related data from insights
  const velocity = insights?.velocity;
  const quality = insights?.quality;
  const collaboration = insights?.collaboration;

  // Build strengths and areas for growth from metrics
  const strengths: string[] = [];
  const areasForGrowth: string[] = [];

  if (velocity) {
    if (velocity.commit_frequency >= 3) strengths.push("High commit velocity");
    else if (velocity.commit_frequency < 1) areasForGrowth.push("Commit frequency");

    if (velocity.pr_throughput >= 3) strengths.push("Strong PR throughput");
    else if (velocity.pr_throughput < 1) areasForGrowth.push("PR throughput");
  }

  if (quality) {
    if (quality.review_participation_rate >= 0.9) strengths.push("Excellent code quality");
    else if (quality.review_participation_rate < 0.7) areasForGrowth.push("Code review quality");
  }

  if (collaboration) {
    if (collaboration.review_given_count >= 3) strengths.push("Active code reviewer");
    else if (collaboration.review_given_count < 1) areasForGrowth.push("Code review participation");
  }

  // Calculate a simple growth score from available metrics
  const growthScore = Math.round(
    ((velocity?.commit_frequency || 0) * 10 +
      (velocity?.pr_throughput || 0) * 15 +
      (quality?.review_participation_rate || 0) * 30 +
      (collaboration?.review_given_count || 0) * 5)
  );

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Growth Trajectory</h3>
        </div>
        <Link
          href="/insights"
          className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!insights ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Growth data will appear after activity is analyzed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Growth Score */}
            <div className="text-center p-4 bg-muted/50 rounded-lg border border-border/50">
              <p className="text-4xl font-bold text-emerald-400">{growthScore}</p>
              <p className="text-xs text-muted-foreground mt-1">Growth Score</p>
            </div>

            {/* Strengths */}
            {strengths.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Strengths
                </p>
                <div className="flex flex-wrap gap-2">
                  {strengths.slice(0, 3).map((strength) => (
                    <span
                      key={strength}
                      className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400"
                    >
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Areas for Growth */}
            {areasForGrowth.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Areas for Growth
                </p>
                <div className="flex flex-wrap gap-2">
                  {areasForGrowth.slice(0, 3).map((area) => (
                    <span
                      key={area}
                      className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {strengths.length === 0 && areasForGrowth.length === 0 && (
              <p className="text-muted-foreground text-sm text-center">
                More data needed to identify strengths and growth areas.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
