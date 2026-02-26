"use client";

import Link from "next/link";
import { AlertCircle, ChevronRight, CheckCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useDeveloperInsights } from "@/hooks/useInsights";

export function SkillGapsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { insights, isLoading } = useDeveloperInsights(
    currentWorkspace?.id || null,
    user?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-amber-500/10 rounded-lg shrink-0">
              <AlertCircle className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-foreground truncate">Skill Gaps</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to identify skill gaps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Derive areas for growth from insights metrics
  const areasForGrowth: string[] = [];
  const recommendations: string[] = [];

  if (insights) {
    const { velocity, quality, collaboration, sustainability } = insights;

    if (velocity) {
      if (velocity.commit_frequency < 1) {
        areasForGrowth.push("Commit frequency");
        recommendations.push("Aim for smaller, more frequent commits");
      }
      if (velocity.pr_throughput < 1) {
        areasForGrowth.push("PR throughput");
        recommendations.push("Break work into smaller pull requests");
      }
    }

    if (quality) {
      if (quality.review_participation_rate < 0.7) {
        areasForGrowth.push("Code review quality");
        recommendations.push("Review feedback patterns to improve approval rates");
      }
      if (quality.self_merge_rate > 0.3) {
        areasForGrowth.push("Self-merge rate");
        recommendations.push("Seek reviews before merging to improve code quality");
      }
    }

    if (collaboration) {
      if (collaboration.review_given_count < 1) {
        areasForGrowth.push("Code review participation");
        recommendations.push("Dedicate time daily for reviewing teammates' code");
      }
    }

    if (sustainability) {
      if (sustainability.weekend_commit_ratio > 0.2) {
        areasForGrowth.push("Work-life balance");
        recommendations.push("Reduce weekend work to avoid burnout");
      }
    }
  }

  const displayGaps = areasForGrowth.slice(0, 5);
  const hasGaps = displayGaps.length > 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-amber-500/10 rounded-lg shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Skill Gaps</h3>
        </div>
        <Link
          href="/insights"
          className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!insights ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Skill gaps will be identified after activity is analyzed.
            </p>
          </div>
        ) : !hasGaps ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-foreground font-medium mb-1">No skill gaps identified</p>
            <p className="text-muted-foreground text-sm">
              Your metrics look strong across all areas.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayGaps.map((gap, index) => (
              <div
                key={gap}
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50"
              >
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{gap}</p>
                  {recommendations[index] && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {recommendations[index]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
