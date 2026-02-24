"use client";

import Link from "next/link";
import {
  BarChart3,
  ChevronRight,
  Users,
  Building2,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";

export function OrgMetricsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { members, isLoading: membersLoading } = useWorkspaceMembers(
    currentWorkspace?.id || null
  );
  const { teams, isLoading: teamsLoading } = useTeams(
    currentWorkspace?.id || null
  );

  const isLoading = membersLoading || teamsLoading;

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

  const totalMembers = members?.length || 0;
  const totalTeams = teams?.length || 0;
  const workspaceName = currentWorkspace?.name || "Workspace";

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <BarChart3 className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Org Metrics</h3>
        </div>
        <Link
          href="/settings/organization"
          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 transition"
        >
          Settings <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view organization metrics.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Workspace name */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-muted-foreground">Workspace</span>
              </div>
              <p className="text-sm font-semibold text-foreground truncate">
                {workspaceName}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Members</span>
                </div>
                <p className="text-lg font-bold text-foreground">{totalMembers}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Teams</span>
                </div>
                <p className="text-lg font-bold text-foreground">{totalTeams}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
