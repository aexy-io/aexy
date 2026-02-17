"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Phone, ChevronDown, Clock, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { oncallApi, OnCallConfig, CurrentOnCallResponse } from "@/lib/api";

interface TeamOnCallStatus {
  teamId: string;
  teamName: string;
  config: OnCallConfig | null;
  current: CurrentOnCallResponse | null;
  isUserOnCall: boolean;
}

interface OnCallIndicatorProps {
  userId?: string;
}

export function OnCallIndicator({ userId }: OnCallIndicatorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams } = useTeams(workspaceId);

  // Fetch on-call status for all teams
  const { data: teamStatuses = [] } = useQuery({
    queryKey: ["oncall-header-status", workspaceId, teams.map(t => t.id)],
    queryFn: async () => {
      if (!workspaceId || teams.length === 0) return [];

      const statuses: TeamOnCallStatus[] = [];

      for (const team of teams) {
        try {
          const config = await oncallApi.getConfig(workspaceId, team.id);
          if (config?.is_enabled) {
            const current = await oncallApi.getCurrentOnCall(workspaceId, team.id);
            statuses.push({
              teamId: team.id,
              teamName: team.name,
              config,
              current,
              isUserOnCall: current?.schedule?.developer_id === userId,
            });
          }
        } catch {
          // Team doesn't have on-call enabled, skip
        }
      }

      return statuses;
    },
    enabled: !!workspaceId && teams.length > 0 && !!userId,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if user is currently on-call for any team
  const userOnCallTeams = teamStatuses.filter(s => s.isUserOnCall);
  const teamsWithOnCall = teamStatuses.filter(s => s.current?.is_active);

  // Don't show if no teams have on-call enabled
  if (teamStatuses.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-sm ${
          userOnCallTeams.length > 0
            ? "bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
            : teamsWithOnCall.length > 0
            ? "bg-muted/70 text-foreground hover:bg-accent/70"
            : "bg-muted/50 text-muted-foreground hover:bg-accent/50"
        }`}
      >
        <Phone className={`h-4 w-4 ${userOnCallTeams.length > 0 ? "animate-pulse" : ""}`} />
        {userOnCallTeams.length > 0 ? (
          <span className="hidden sm:inline font-medium">You&apos;re On-Call</span>
        ) : teamsWithOnCall.length > 0 ? (
          <span className="hidden sm:inline">{teamsWithOnCall.length} active</span>
        ) : (
          <span className="hidden sm:inline">On-Call</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-background/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div className="p-3 border-b border-border/50">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-400" />
              On-Call Status
            </h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {teamStatuses.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No teams have on-call enabled
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {teamStatuses.map((status) => (
                  <div key={status.teamId} className="p-3 hover:bg-muted/50 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {status.teamName}
                          </span>
                          {status.isUserOnCall && (
                            <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-xs rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        {status.current?.is_active && status.current.schedule ? (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-sm text-green-400">
                                {status.current.schedule.developer?.name ||
                                  status.current.schedule.developer?.email ||
                                  "Unknown"}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              until{" "}
                              {new Date(status.current.schedule.end_time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ) : status.current?.next_schedule ? (
                          <div className="flex items-center gap-1.5 mt-1 text-muted-foreground text-xs">
                            <Clock className="h-3 w-3" />
                            <span>
                              Next: {status.current.next_schedule.developer?.name || "Unknown"} (
                              {new Date(status.current.next_schedule.start_time).toLocaleDateString()})
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">No one scheduled</div>
                        )}
                      </div>
                      <Link
                        href={`/settings/projects/${status.teamId}/oncall`}
                        onClick={() => setShowDropdown(false)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition whitespace-nowrap"
                      >
                        Manage
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-2 border-t border-border/50 bg-muted/30">
            <Link
              href="/settings/projects"
              onClick={() => setShowDropdown(false)}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition"
            >
              <Users className="h-4 w-4" />
              View All Projects
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
