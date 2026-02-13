"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Users, RefreshCw } from "lucide-react";
import { TrackingAnalyticsDashboard } from "@/components/tracking";
import {
  DateRangePicker,
  getDefaultDateRange,
  DateRange,
  ExportMenu,
  ExportFormat,
  exportToJSON,
} from "@/components/tracking/shared";
import {
  useTeamTrackingDashboard,
  useTeamAnalytics,
  useMyStandups,
  useMyTimeEntries,
  useActiveBlockers,
} from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";

export default function TrackingAnalyticsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams, isLoading: teamsLoading } = useTeams(workspaceId);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange("last_30_days"));

  // Auto-select first team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Fetch data
  const teamDashboard = useTeamTrackingDashboard(selectedTeamId || "");
  const teamAnalytics = useTeamAnalytics(selectedTeamId || "", {
    startDate: dateRange.startDate.toISOString().split("T")[0],
    endDate: dateRange.endDate.toISOString().split("T")[0],
  });
  const standups = useMyStandups({ limit: 100 });
  const timeEntries = useMyTimeEntries({
    start: dateRange.startDate.toISOString().split("T")[0],
    end: dateRange.endDate.toISOString().split("T")[0],
  });
  const blockers = useActiveBlockers(selectedTeamId || undefined);

  const isLoading =
    teamsLoading ||
    teamDashboard.isLoading ||
    standups.isLoading ||
    timeEntries.isLoading ||
    blockers.isLoading;

  const handleExport = async (format: ExportFormat) => {
    if (format === "json") {
      const exportData = {
        dateRange: {
          start: dateRange.startDate.toISOString(),
          end: dateRange.endDate.toISOString(),
        },
        team: teams.find((t) => t.id === selectedTeamId)?.name || "Unknown",
        analytics: teamAnalytics.data,
        dashboard: teamDashboard.data,
        standups: standups.data?.standups?.length || 0,
        timeEntries: timeEntries.data?.entries?.length || 0,
        blockers: blockers.data?.blockers?.length || 0,
      };
      exportToJSON(exportData, `team_analytics_${dateRange.startDate.toISOString().split("T")[0]}`);
    }
  };

  const handleRefresh = () => {
    teamDashboard.refetch();
    teamAnalytics.refetch();
    standups.refetch();
    timeEntries.refetch();
    blockers.refetch();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tracking
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-purple-400" />
                Team Analytics
              </h1>
              <p className="text-slate-400 mt-2">
                Team productivity metrics and insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Team Selector */}
              {teams.length > 1 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <select
                    value={selectedTeamId || ""}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 text-slate-400 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={["this_week", "last_week", "this_month", "last_30_days", "last_90_days"]}
          />
          <ExportMenu
            onExport={handleExport}
            options={["json"]}
          />
        </div>

        {/* No Team Warning */}
        {teams.length === 0 && !teamsLoading && (
          <div className="mb-8 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl">
            <p className="text-amber-400 text-sm">
              You need to be part of a team to view team analytics. Please contact your workspace admin to be added to a team.
            </p>
          </div>
        )}

        {/* Analytics Dashboard */}
        {selectedTeamId && (
          <TrackingAnalyticsDashboard
            analytics={teamAnalytics.data}
            teamDashboard={teamDashboard.data}
            standups={standups.data?.standups || []}
            timeEntries={timeEntries.data?.entries || []}
            blockers={blockers.data?.blockers || []}
            isLoading={isLoading}
          />
        )}

        {/* Insights Section */}
        {!isLoading && teamDashboard.data && (
          <div className="mt-8 bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Insights</h3>
            <ul className="space-y-3">
              {teamDashboard.data.participation_rate < 80 && (
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 mt-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-slate-300">
                    Standup participation is at {Math.round(teamDashboard.data.participation_rate)}%.
                    Consider sending reminders to improve engagement.
                  </span>
                </li>
              )}
              {teamDashboard.data.active_blockers && teamDashboard.data.active_blockers.length > 3 && (
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 mt-2 rounded-full bg-red-400 shrink-0" />
                  <span className="text-slate-300">
                    There are {teamDashboard.data.active_blockers.length} active blockers.
                    Consider a team sync to address these.
                  </span>
                </li>
              )}
              {teamDashboard.data.participation_rate >= 90 && (
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 mt-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-slate-300">
                    Great standup participation! The team is staying engaged.
                  </span>
                </li>
              )}
              {teamDashboard.data.active_blockers?.length === 0 && (
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 mt-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-slate-300">
                    No active blockers. The team is operating smoothly.
                  </span>
                </li>
              )}
              {standups.data?.standups && standups.data.standups.length > 0 && (
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 mt-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-slate-300">
                    {standups.data.standups.length} standups submitted in the selected period.
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
