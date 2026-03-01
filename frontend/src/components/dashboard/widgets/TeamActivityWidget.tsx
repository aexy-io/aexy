"use client";

import Link from "next/link";
import {
  Activity,
  ChevronRight,
  GitCommit,
  GitPullRequest,
  Eye,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams, useTeamProfile } from "@/hooks/useTeams";

export function TeamActivityWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams, isLoading } = useTeams(currentWorkspace?.id || null);
  const { profile, isLoading: profileLoading } = useTeamProfile(
    currentWorkspace?.id || null,
    teams?.[0]?.id || null
  );

  if (isLoading || profileLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-6" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const teamName = teams?.[0]?.name || "Team";
  const hasData = !!profile;

  const metrics = [
    {
      label: "Commits",
      value: profile?.velocity?.total_commits ?? 0,
      icon: GitCommit,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "PRs Merged",
      value: profile?.velocity?.merged_prs ?? 0,
      icon: GitPullRequest,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Lines Added",
      value: profile?.velocity?.total_additions ?? 0,
      icon: Eye,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Members",
      value: profile?.member_count ?? 0,
      icon: Users,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-green-500/10 rounded-lg shrink-0">
            <Activity className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground truncate">Team Activity</h3>
            {hasData && (
              <p className="text-xs text-muted-foreground">{teamName}</p>
            )}
          </div>
        </div>
        <Link
          href="/tracking/team"
          className="text-green-400 hover:text-green-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View Teams <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view team activity.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No team activity data available yet. Activity will appear once teams start contributing.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
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
