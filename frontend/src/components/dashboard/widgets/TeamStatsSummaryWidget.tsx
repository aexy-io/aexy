"use client";

import Link from "next/link";
import {
  Users,
  GitCommit,
  GitPullRequest,
  Eye,
  Code2,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeamInsights } from "@/hooks/useInsights";

export function TeamStatsSummaryWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teamInsights, isLoading } = useTeamInsights(
    currentWorkspace?.id || null
  );

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const stats = teamInsights;
  const hasData = !!stats;
  const aggregate = stats?.aggregate;

  const metrics = [
    {
      label: "Commits",
      value: aggregate?.total_commits ?? 0,
      icon: GitCommit,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Pull Requests",
      value: aggregate?.total_prs_merged ?? 0,
      icon: GitPullRequest,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Reviews",
      value: aggregate?.total_reviews ?? 0,
      icon: Eye,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Lines Changed",
      value: aggregate?.total_lines_changed ?? 0,
      icon: Code2,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Team Stats</h3>
        </div>
        <Link
          href="/insights"
          className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View details <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view team stats.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No team data available yet. Team insights will appear once members start contributing.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 ${metric.bgColor} rounded-md`}>
                    <metric.icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                  <span className="text-muted-foreground text-xs">{metric.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {typeof metric.value === "number"
                    ? metric.value.toLocaleString()
                    : metric.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
