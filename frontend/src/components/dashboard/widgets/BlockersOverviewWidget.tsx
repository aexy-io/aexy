"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  AlertCircle,
  ArrowUp,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useActiveBlockers } from "@/hooks/useTracking";

function getSeverityBadge(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "high":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "medium":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    default:
      return "bg-slate-700/50 text-slate-400 border-slate-600/30";
  }
}

export function BlockersOverviewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { data: blockerData, isLoading } = useActiveBlockers(
    defaultTeamId || undefined
  );

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const blockers = blockerData?.blockers || [];
  const activeCount = blockerData?.active_count || 0;
  const escalatedCount = blockerData?.escalated_count || 0;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Blockers</h3>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
        <Link
          href="/tracking"
          className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Select a workspace to view blockers.
            </p>
          </div>
        ) : blockers.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              No active blockers. Your team is unblocked!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary row */}
            {escalatedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg mb-2">
                <ArrowUp className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-400 text-xs font-medium">
                  {escalatedCount} escalated
                </span>
              </div>
            )}

            {/* Blocker list */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {blockers.slice(0, 8).map((blocker: any) => (
                <div
                  key={blocker.id}
                  className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 transition"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {blocker.description || blocker.title || "Untitled blocker"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${getSeverityBadge(
                          blocker.severity
                        )}`}
                      >
                        {blocker.severity || "unknown"}
                      </span>
                      {blocker.reported_by_name && (
                        <span className="text-slate-500 text-xs truncate">
                          {blocker.reported_by_name}
                        </span>
                      )}
                      {blocker.created_at && (
                        <span className="text-slate-600 text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(blocker.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
