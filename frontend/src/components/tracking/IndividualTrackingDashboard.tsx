"use client";

import {
  MessageSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { IndividualDashboard, StandupCreate, TimeEntryCreate, BlockerCreate } from "@/lib/api";
import { StandupForm } from "./StandupForm";
import { StandupCard } from "./StandupCard";
import { TimeLogForm } from "./TimeLogForm";
import { TimeEntryList } from "./TimeEntryList";
import { BlockerCard } from "./BlockerCard";
import { BlockerReportForm } from "./BlockerReportForm";

interface IndividualTrackingDashboardProps {
  dashboard: IndividualDashboard | undefined;
  isLoading?: boolean;
  onSubmitStandup: (data: StandupCreate) => Promise<void>;
  onLogTime: (data: TimeEntryCreate) => Promise<void>;
  onReportBlocker: (data: BlockerCreate) => Promise<void>;
  onResolveBlocker: (blockerId: string, notes?: string) => Promise<void>;
  isSubmittingStandup?: boolean;
  isLoggingTime?: boolean;
  isReportingBlocker?: boolean;
  isResolvingBlocker?: boolean;
  sprintId?: string;
  teamId?: string;
}

export function IndividualTrackingDashboard({
  dashboard,
  isLoading = false,
  onSubmitStandup,
  onLogTime,
  onReportBlocker,
  onResolveBlocker,
  isSubmittingStandup = false,
  isLoggingTime = false,
  isReportingBlocker = false,
  isResolvingBlocker = false,
  sprintId,
  teamId,
}: IndividualTrackingDashboardProps) {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-700 rounded w-1/3" />
            </div>
          ))}
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
              <div className="h-6 bg-slate-700 rounded w-1/3 mb-4" />
              <div className="space-y-3">
                <div className="h-4 bg-slate-700 rounded w-3/4" />
                <div className="h-4 bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-900/30 rounded-lg">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-slate-400">Standups This Week</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {dashboard?.standup_streak || 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {dashboard?.has_standup_today ? "Today complete" : "No standup today"}
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-slate-400">Time This Week</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {formatDuration(dashboard?.time_logged_this_week || 0)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {dashboard?.time_entries?.length || 0} entries
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-900/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-slate-400">Active Blockers</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {dashboard?.active_blockers?.length || 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {dashboard?.resolved_blockers_count || 0} resolved
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-900/30 rounded-lg">
              <Activity className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-slate-400">Work Logs</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {dashboard?.work_logs?.length || 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">This sprint</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Standup */}
        <div className="space-y-6">
          {/* Standup Form - supports both create and edit modes */}
          <StandupForm
            onSubmit={onSubmitStandup}
            isSubmitting={isSubmittingStandup}
            sprintId={sprintId}
            teamId={teamId}
            initialData={dashboard?.todays_standup}
            editMode={true}
          />

          {/* Recent Standups */}
          {dashboard?.recent_standups && dashboard.recent_standups.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Recent Standups</h3>
              <div className="space-y-3">
                {dashboard.recent_standups.slice(0, 3).map((standup) => (
                  <StandupCard key={standup.id} standup={standup} compact />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Time & Blockers */}
        <div className="space-y-6">
          {/* Time Logging */}
          <TimeLogForm
            onSubmit={onLogTime}
            isSubmitting={isLoggingTime}
            sprintId={sprintId}
          />

          {/* Recent Time Entries */}
          {dashboard?.time_entries && dashboard.time_entries.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Recent Time Entries</h3>
              <TimeEntryList entries={dashboard.time_entries.slice(0, 5)} />
            </div>
          )}
        </div>
      </div>

      {/* Blockers Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Report New Blocker */}
        <BlockerReportForm
          onSubmit={onReportBlocker}
          isSubmitting={isReportingBlocker}
          sprintId={sprintId}
          teamId={teamId}
        />

        {/* Active Blockers */}
        {dashboard?.active_blockers && dashboard.active_blockers.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Active Blockers
            </h3>
            <div className="space-y-3">
              {dashboard.active_blockers.map((blocker) => (
                <BlockerCard
                  key={blocker.id}
                  blocker={blocker}
                  onResolve={(notes) => onResolveBlocker(blocker.id, notes)}
                  isResolving={isResolvingBlocker}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
