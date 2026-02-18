"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Blocker, BlockerAnalytics } from "@/lib/api";
import { MetricCard, metricPresets } from "./shared";
import { TrendLineChart, trendColors } from "./charts";
import { SLASummary } from "./SLAIndicator";

interface BlockerAnalyticsDashboardProps {
  analytics?: BlockerAnalytics;
  blockers?: Blocker[];
  isLoading?: boolean;
  className?: string;
}

export function BlockerAnalyticsDashboard({
  analytics,
  blockers = [],
  isLoading = false,
  className = "",
}: BlockerAnalyticsDashboardProps) {
  // Calculate analytics from blockers if not provided
  const computedAnalytics = useMemo(() => {
    if (analytics) return analytics;

    const active = blockers.filter((b) => b.status === "active");
    const resolved = blockers.filter((b) => b.status === "resolved");
    const escalated = blockers.filter((b) => b.status === "escalated");

    // Calculate average resolution time
    const resolvedWithTime = resolved.filter((b) => b.updated_at && b.reported_at);
    const avgResolutionHours = resolvedWithTime.length > 0
      ? resolvedWithTime.reduce((sum, b) => {
          const hours = (new Date(b.updated_at).getTime() - new Date(b.reported_at).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0) / resolvedWithTime.length
      : 0;

    // Group by severity
    const bySeverity: Record<string, number> = {};
    blockers.forEach((b) => {
      bySeverity[b.severity] = (bySeverity[b.severity] || 0) + 1;
    });

    // Group by category
    const byCategory: Record<string, number> = {};
    blockers.forEach((b) => {
      byCategory[b.category] = (byCategory[b.category] || 0) + 1;
    });

    return {
      summary: {
        total_reported: blockers.length,
        total_resolved: resolved.length,
        total_escalated: escalated.length,
        currently_active: active.length,
        avg_resolution_time_hours: avgResolutionHours,
      },
      by_severity: bySeverity,
      by_category: byCategory,
    };
  }, [analytics, blockers]);

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-muted rounded-xl p-6 border border-border animate-pulse">
              <div className="h-4 bg-accent rounded w-1/2 mb-3" />
              <div className="h-8 bg-accent rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { summary, by_severity, by_category } = computedAnalytics;

  // Build trend data if analytics has it
  const trendData = analytics?.trends?.reported_by_day?.map((d, i) => ({
    date: d.date,
    reported: d.count,
    resolved: analytics.trends.resolved_by_day?.[i]?.count || 0,
  })) || [];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Blockers"
          value={summary.currently_active}
          subtitle="Needs attention"
          icon={AlertTriangle}
          {...metricPresets.blocker}
        />
        <MetricCard
          title="Resolved"
          value={summary.total_resolved}
          subtitle={`of ${summary.total_reported} total`}
          icon={CheckCircle2}
          iconColor="text-green-400"
          iconBgColor="bg-green-100 dark:bg-green-900/30"
        />
        <MetricCard
          title="Escalated"
          value={summary.total_escalated}
          subtitle="Waiting for help"
          icon={ArrowUpCircle}
          iconColor="text-purple-400"
          iconBgColor="bg-purple-100 dark:bg-purple-900/30"
        />
        <MetricCard
          title="Avg Resolution"
          value={formatHours(summary.avg_resolution_time_hours || 0)}
          subtitle="Time to resolve"
          icon={Clock}
          iconColor="text-blue-400"
          iconBgColor="bg-blue-100 dark:bg-blue-900/30"
        />
      </div>

      {/* SLA & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLA Summary */}
        <div className="bg-muted rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            SLA Status
          </h3>
          {blockers.length > 0 ? (
            <SLASummary
              blockers={blockers.map((b) => ({
                reported_at: b.reported_at,
                updated_at: b.updated_at,
                status: b.status,
              }))}
              targetHours={24}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No blockers to analyze</p>
          )}
        </div>

        {/* By Severity */}
        <div className="bg-muted rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">By Severity</h3>
          <div className="space-y-3">
            {["critical", "high", "medium", "low"].map((severity) => {
              const count = by_severity[severity] || 0;
              const total = summary.total_reported || 1;
              const percentage = Math.round((count / total) * 100);

              const colors = {
                critical: "bg-red-500",
                high: "bg-orange-500",
                medium: "bg-yellow-500",
                low: "bg-blue-500",
              };

              return (
                <div key={severity}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground capitalize">{severity}</span>
                    <span className="text-foreground">{count} ({percentage}%)</span>
                  </div>
                  <div className="h-2 bg-accent rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors[severity as keyof typeof colors]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Category */}
        <div className="bg-muted rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">By Category</h3>
          <div className="space-y-3">
            {Object.entries(by_category)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([category, count]) => {
                const total = summary.total_reported || 1;
                const percentage = Math.round((count / total) * 100);

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground capitalize">{category.replace("_", " ")}</span>
                      <span className="text-foreground">{count} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(by_category).length === 0 && (
              <p className="text-muted-foreground text-sm">No category data</p>
            )}
          </div>
        </div>
      </div>

      {/* Trend Chart (if analytics data available) */}
      {trendData.length > 0 && (
        <TrendLineChart
          data={trendData}
          lines={[
            { key: "reported", name: "Reported", color: trendColors.blockers },
            { key: "resolved", name: "Resolved", color: "#10b981" },
          ]}
          title="Blocker Trends"
          height={300}
        />
      )}

      {/* Resolution Rate */}
      {summary.total_reported > 0 && (
        <div className="bg-muted rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            Resolution Rate
          </h3>
          <div className="flex items-center gap-8">
            <div className="flex-1">
              <div className="text-4xl font-bold text-foreground">
                {Math.round((summary.total_resolved / summary.total_reported) * 100)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {summary.total_resolved} of {summary.total_reported} blockers resolved
              </p>
            </div>
            <div className="flex-1 h-4 bg-accent rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full"
                style={{ width: `${(summary.total_resolved / summary.total_reported) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
