"use client";

import { useState } from "react";
import {
  Users,
  MessageSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { TeamDashboard, Standup, Blocker } from "@/lib/api";
import { StandupCard } from "./StandupCard";
import { BlockerBoard } from "./BlockerBoard";

interface TeamTrackingDashboardProps {
  dashboard: TeamDashboard | undefined;
  isLoading?: boolean;
  onResolveBlocker?: (blockerId: string, notes?: string) => Promise<void>;
  onEscalateBlocker?: (blockerId: string, escalateToId: string, notes?: string) => Promise<void>;
  teamMembers?: Array<{ id: string; name: string }>;
  isResolvingBlocker?: boolean;
  isEscalatingBlocker?: boolean;
}

export function TeamTrackingDashboard({
  dashboard,
  isLoading = false,
  onResolveBlocker,
  onEscalateBlocker,
  teamMembers = [],
  isResolvingBlocker = false,
  isEscalatingBlocker = false,
}: TeamTrackingDashboardProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const toggleMember = (memberId: string) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(memberId)) {
      newExpanded.delete(memberId);
    } else {
      newExpanded.add(memberId);
    }
    setExpandedMembers(newExpanded);
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
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/4 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const membersWithStandups = dashboard?.member_summaries?.filter(
    (m) => m.has_standup_today
  ).length || 0;
  const totalMembers = dashboard?.member_summaries?.length || 0;
  const standupRate = totalMembers > 0 ? Math.round((membersWithStandups / totalMembers) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-900/30 rounded-lg">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-slate-400">Standups Today</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {membersWithStandups}/{totalMembers}
          </p>
          <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${standupRate}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-slate-400">Team Time This Week</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {formatDuration(dashboard?.total_time_logged || 0)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Avg: {formatDuration(Math.round((dashboard?.total_time_logged || 0) / (totalMembers || 1)))} per member
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
            {dashboard?.escalated_blockers?.length || 0} escalated
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-900/30 rounded-lg">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-slate-400">Sprint Progress</span>
          </div>
          <p className="text-3xl font-semibold text-white">
            {dashboard?.sprint_completion_rate || 0}%
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {dashboard?.completed_tasks || 0}/{dashboard?.total_tasks || 0} tasks
          </p>
        </div>
      </div>

      {/* Today's Standups */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-400" />
            Today's Standups
          </h3>
          <div className="text-sm text-slate-400">
            {membersWithStandups} of {totalMembers} submitted
          </div>
        </div>

        <div className="divide-y divide-slate-700">
          {dashboard?.member_summaries?.map((member) => (
            <div key={member.developer_id} className="hover:bg-slate-800/50 transition">
              <button
                onClick={() => member.todays_standup && toggleMember(member.developer_id)}
                className="w-full px-6 py-4 flex items-center justify-between"
                disabled={!member.todays_standup}
              >
                <div className="flex items-center gap-3">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name || ""}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="font-medium text-white">{member.name || member.email}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>Time: {formatDuration(member.time_logged_this_week)}</span>
                      {member.active_blockers_count > 0 && (
                        <span className="text-red-400">
                          {member.active_blockers_count} blocker{member.active_blockers_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {member.has_standup_today ? (
                    <span className="flex items-center gap-1.5 text-sm text-green-400">
                      <MessageSquare className="h-4 w-4" />
                      Submitted
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500">No standup</span>
                  )}
                  {member.todays_standup && (
                    expandedMembers.has(member.developer_id) ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )
                  )}
                </div>
              </button>

              {/* Expanded Standup */}
              {member.todays_standup && expandedMembers.has(member.developer_id) && (
                <div className="px-6 pb-4">
                  <StandupCard standup={member.todays_standup} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blockers Board */}
      {(dashboard?.active_blockers?.length || 0) + (dashboard?.escalated_blockers?.length || 0) + (dashboard?.resolved_blockers?.length || 0) > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Team Blockers
          </h3>
          <BlockerBoard
            blockers={[
              ...(dashboard?.active_blockers || []),
              ...(dashboard?.escalated_blockers || []),
              ...(dashboard?.resolved_blockers || []),
            ]}
            onResolve={onResolveBlocker}
            onEscalate={onEscalateBlocker}
            teamMembers={teamMembers}
            isResolving={isResolvingBlocker}
            isEscalating={isEscalatingBlocker}
          />
        </div>
      )}
    </div>
  );
}
