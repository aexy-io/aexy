"use client";

import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useDeveloperPercentile } from "@/hooks/useInsights";

function getPercentileCategory(percentile: number): string {
  if (percentile >= 90) return "Top Performer";
  if (percentile >= 75) return "Above Average";
  if (percentile >= 50) return "Average";
  if (percentile >= 25) return "Below Average";
  return "Needs Improvement";
}

function getPercentileColor(percentile: number): string {
  if (percentile >= 75) return "text-emerald-400";
  if (percentile >= 50) return "text-blue-400";
  if (percentile >= 25) return "text-amber-400";
  return "text-red-400";
}

function getBarColor(percentile: number): string {
  if (percentile >= 75) return "bg-emerald-500";
  if (percentile >= 50) return "bg-blue-500";
  if (percentile >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function getOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export function PeerBenchmarkWidget() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { percentile, isLoading } = useDeveloperPercentile(
    currentWorkspace?.id || null,
    user?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-muted rounded mb-4" />
        <div className="h-24 bg-muted rounded-lg mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-muted rounded" />
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
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Peer Benchmark</h3>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view peer comparison.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rankings = percentile?.rankings;
  const peerCount = percentile?.peer_count || 0;

  // Calculate an overall percentile from available rankings
  const rankingEntries = rankings ? Object.values(rankings) : [];
  const overallPercentile =
    rankingEntries.length > 0
      ? Math.round(
          rankingEntries.reduce((sum, r) => sum + r.percentile, 0) /
            rankingEntries.length
        )
      : null;

  const hasData = overallPercentile !== null && peerCount > 1;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Users className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Peer Benchmark</h3>
        </div>
        <Link
          href="/insights"
          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Not enough data for peer comparison
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall Percentile */}
            <div className="text-center p-4 bg-muted/50 rounded-lg border border-border/50">
              <p className={`text-4xl font-bold ${getPercentileColor(overallPercentile)}`}>
                {overallPercentile}
                <span className="text-lg text-muted-foreground font-normal">{getOrdinalSuffix(overallPercentile)}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {getPercentileCategory(overallPercentile)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compared to {peerCount} peers
              </p>
            </div>

            {/* Visual Bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>0th</span>
                <span>50th</span>
                <span>100th</span>
              </div>
              <div className="w-full bg-accent rounded-full h-3 overflow-hidden relative">
                <div
                  className={`${getBarColor(overallPercentile)} h-full rounded-full transition-all`}
                  style={{ width: `${overallPercentile}%` }}
                />
                {/* Median marker */}
                <div className="absolute top-0 left-1/2 w-px h-full bg-muted-foreground/30" />
              </div>
            </div>

            {/* Top rankings breakdown */}
            {rankings && Object.keys(rankings).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  By Metric
                </p>
                {Object.entries(rankings)
                  .slice(0, 4)
                  .map(([metric, entry]) => (
                    <div
                      key={metric}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                    >
                      <span className="text-sm text-foreground capitalize">
                        {metric.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`text-sm font-medium ${getPercentileColor(entry.percentile)}`}
                      >
                        {Math.round(entry.percentile)}{getOrdinalSuffix(Math.round(entry.percentile))}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
