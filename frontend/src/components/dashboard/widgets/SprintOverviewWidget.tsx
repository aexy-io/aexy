"use client";

import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlayCircle,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useActiveSprint } from "@/hooks/useSprints";

export function SprintOverviewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { sprint: activeSprint, isLoading } = useActiveSprint(
    currentWorkspace?.id || null,
    defaultTeamId
  );

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-slate-800 rounded" />
          <div className="h-20 bg-slate-800 rounded-lg" />
        </div>
      </div>
    );
  }

  const sprint = activeSprint;
  const hasActiveSprint = !!sprint && !!defaultTeamId;

  // Calculate sprint progress
  const totalTasks = sprint?.tasks_count || 0;
  const completedTasks = sprint?.completed_count || 0;
  const inProgressTasks = Math.max(0, totalTasks - completedTasks);
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate days remaining
  const endDate = sprint?.end_date ? new Date(sprint.end_date) : null;
  const today = new Date();
  const daysRemaining = endDate
    ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-green-500/10 rounded-lg shrink-0">
            <Calendar className="h-4 w-4 text-green-400" />
          </div>
          <h3 className="text-sm font-semibold text-white truncate">Sprint Overview</h3>
        </div>
        <Link
          href="/sprints"
          className="text-green-400 hover:text-green-300 text-xs flex items-center gap-1 transition shrink-0 whitespace-nowrap"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="p-4">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Select a workspace to view sprint data.
            </p>
          </div>
        ) : !hasActiveSprint ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <PlayCircle className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm mb-3">
              No active sprint. Start a new sprint to track progress.
            </p>
            <Link
              href="/sprints/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition"
            >
              Create Sprint
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sprint name and dates */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">{sprint.name}</h4>
                <p className="text-slate-500 text-xs">
                  {daysRemaining} days remaining
                </p>
              </div>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  daysRemaining <= 2
                    ? "bg-red-500/20 text-red-400"
                    : daysRemaining <= 5
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-green-500/20 text-green-400"
                }`}
              >
                {sprint.status || "Active"}
              </span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Progress</span>
                <span className="text-white font-medium">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Task breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                  <span className="text-xs text-slate-400">Done</span>
                </div>
                <p className="text-lg font-bold text-white">{completedTasks}</p>
              </div>
              <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="h-3 w-3 text-blue-400" />
                  <span className="text-xs text-slate-400">In Progress</span>
                </div>
                <p className="text-lg font-bold text-white">{inProgressTasks}</p>
              </div>
              <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className="h-3 w-3 text-slate-400" />
                  <span className="text-xs text-slate-400">Total</span>
                </div>
                <p className="text-lg font-bold text-white">{totalTasks}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
