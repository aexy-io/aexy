"use client";

import Link from "next/link";
import {
  Users,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";

export function TeamOverviewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams, isLoading } = useTeams(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalTeams = teams?.length || 0;
  const totalMembers = teams?.reduce((sum, t) => sum + (t.member_count || 0), 0) || 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Team Overview</h3>
        </div>
        <Link
          href="/teams"
          className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view teams.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Teams</span>
                </div>
                <p className="text-lg font-bold text-foreground">{totalTeams}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <UserPlus className="h-3 w-3 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Members</span>
                </div>
                <p className="text-lg font-bold text-foreground">{totalMembers}</p>
              </div>
            </div>

            {/* Team list */}
            {totalTeams > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Teams
                </p>
                {teams.slice(0, 4).map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-foreground">{team.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {team.member_count} {team.member_count === 1 ? "member" : "members"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm">No teams yet.</p>
                <Link
                  href="/teams"
                  className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300 text-sm transition"
                >
                  <UserPlus className="h-3 w-3" />
                  Create your first team
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
