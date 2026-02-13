"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
} from "lucide-react";
import { StandupCard } from "@/components/tracking";
import {
  MetricCard,
  ExportMenu,
  ExportFormat,
  exportToCSV,
  exportToJSON,
  SentimentIndicator,
} from "@/components/tracking/shared";
import { useTeamStandups, useTeamTrackingDashboard, useExportStandups } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { Standup } from "@/lib/api";

export default function TeamStandupsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams, isLoading: teamsLoading } = useTeams(workspaceId);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedStandup, setSelectedStandup] = useState<Standup | null>(null);

  const exportStandups = useExportStandups();

  // Auto-select first team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Fetch team standups for selected date
  const dateStr = selectedDate.toISOString().split("T")[0];
  const { data: standups, isLoading } = useTeamStandups(
    selectedTeamId || "",
    dateStr
  );

  // Fetch team dashboard for member info
  const { data: teamDashboard } = useTeamTrackingDashboard(selectedTeamId || "");

  // Get selected team info
  const selectedTeam = useMemo(() => {
    return teams.find((t) => t.id === selectedTeamId);
  }, [teams, selectedTeamId]);

  // Calculate stats
  const stats = useMemo(() => {
    const teamMembers = teamDashboard?.standup_completion?.length || selectedTeam?.member_count || 0;
    const submitted = standups?.length || 0;
    const participationRate = teamMembers > 0 ? (submitted / teamMembers) * 100 : 0;

    const sentimentScores = (standups || [])
      .filter((s) => s.sentiment_score !== null && s.sentiment_score !== undefined)
      .map((s) => s.sentiment_score as number);

    const avgSentiment =
      sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

    const withBlockers = (standups || []).filter(
      (s) => s.blockers_summary && s.blockers_summary.trim() !== ""
    ).length;

    return {
      teamMembers,
      submitted,
      participationRate,
      avgSentiment,
      withBlockers,
      notSubmitted: teamMembers - submitted,
    };
  }, [standups, selectedTeam]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const navigateDate = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
    setSelectedStandup(null);
  };

  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const handleExport = async (format: ExportFormat) => {
    if (format === "csv" || format === "json") {
      const exportData = (standups || []).map((s) => ({
        date: s.standup_date,
        developer: s.developer_name || "Unknown",
        yesterday: s.yesterday_summary || "",
        today: s.today_plan || "",
        blockers: s.blockers_summary || "",
        sentiment: s.sentiment_score ? Math.round(s.sentiment_score * 100) : "",
        source: s.source,
      }));

      if (format === "csv") {
        exportToCSV(exportData, `team_standups_${dateStr}`);
      } else {
        exportToJSON(exportData, `team_standups_${dateStr}`);
      }
    } else {
      await exportStandups.mutateAsync({
        startDate: dateStr,
        endDate: dateStr,
        format,
        teamId: selectedTeamId || undefined,
      });
    }
  };

  // Get members who haven't submitted - use team dashboard standup_completion
  const membersWithoutStandup = useMemo(() => {
    if (!teamDashboard?.standup_completion || !standups) return [];

    const submittedIds = new Set(standups.map((s) => s.developer_id));
    return teamDashboard.standup_completion.filter(
      (m) => !submittedIds.has(m.developer_id)
    );
  }, [teamDashboard?.standup_completion, standups]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking/standups")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Standups
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Users className="h-8 w-8 text-purple-400" />
                Team Standups
              </h1>
              <p className="text-slate-400 mt-2">
                View and manage team standup submissions
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Team Selector */}
              {teams.length > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <select
                    value={selectedTeamId || ""}
                    onChange={(e) => {
                      setSelectedTeamId(e.target.value);
                      setSelectedStandup(null);
                    }}
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
              <ExportMenu
                onExport={handleExport}
                options={["csv", "json"]}
                loading={exportStandups.isPending}
              />
            </div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <button
            onClick={() => navigateDate("prev")}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
          >
            <ChevronLeft className="h-5 w-5 text-slate-400" />
          </button>
          <div className="flex items-center gap-3 px-6 py-3 bg-slate-800 border border-slate-700 rounded-lg">
            <Calendar className="h-5 w-5 text-purple-400" />
            <span className="text-white font-medium">{formatDate(selectedDate)}</span>
            {isToday && (
              <span className="px-2 py-0.5 text-xs bg-purple-900/30 text-purple-400 rounded">
                Today
              </span>
            )}
          </div>
          <button
            onClick={() => navigateDate("next")}
            disabled={isToday}
            className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>
          {!isToday && (
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setSelectedStandup(null);
              }}
              className="px-3 py-2 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-900/20 rounded-lg transition"
            >
              Go to Today
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <MetricCard
            title="Team Members"
            value={stats.teamMembers}
            icon={Users}
            iconColor="text-purple-400"
            iconBgColor="bg-purple-900/30"
            loading={teamsLoading}
          />
          <MetricCard
            title="Submitted"
            value={stats.submitted}
            subtitle={`${Math.round(stats.participationRate)}% participation`}
            icon={CheckCircle2}
            iconColor="text-green-400"
            iconBgColor="bg-green-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="Not Submitted"
            value={stats.notSubmitted}
            icon={XCircle}
            iconColor="text-red-400"
            iconBgColor="bg-red-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="With Blockers"
            value={stats.withBlockers}
            icon={AlertTriangle}
            iconColor="text-amber-400"
            iconBgColor="bg-amber-900/30"
            loading={isLoading}
          />
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h4 className="text-sm text-slate-400 mb-3">Team Sentiment</h4>
            {stats.avgSentiment !== null ? (
              <SentimentIndicator
                score={stats.avgSentiment}
                showLabel
                showEmoji
                size="lg"
              />
            ) : (
              <p className="text-slate-500 text-sm">No data</p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Standups List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              Submitted Standups ({stats.submitted})
            </h2>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-slate-700 rounded-full" />
                      <div className="h-4 bg-slate-700 rounded w-1/3" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-slate-700 rounded w-3/4" />
                      <div className="h-3 bg-slate-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : standups && standups.length > 0 ? (
              <div className="space-y-4">
                {standups.map((standup) => (
                  <div
                    key={standup.id}
                    className={`cursor-pointer transition ${
                      selectedStandup?.id === standup.id
                        ? "ring-2 ring-purple-500 rounded-xl"
                        : ""
                    }`}
                    onClick={() => setSelectedStandup(standup)}
                  >
                    <StandupCard standup={standup} showAuthor />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
                <MessageSquare className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No standups submitted for this date</p>
              </div>
            )}

            {/* Members without standups */}
            {membersWithoutStandup.length > 0 && (
              <div className="mt-6">
                <h3 className="text-md font-semibold text-slate-400 mb-3 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400" />
                  Not Submitted ({membersWithoutStandup.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {membersWithoutStandup.map((member) => (
                    <div
                      key={member.developer_id}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                    >
                      {member.developer_avatar ? (
                        <img
                          src={member.developer_avatar}
                          alt={member.developer_name || ""}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                          <User className="h-3 w-3 text-slate-400" />
                        </div>
                      )}
                      <span className="text-sm text-slate-300">
                        {member.developer_name || "Unknown"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Selected Standup Details */}
          <div className="lg:col-span-1">
            {selectedStandup ? (
              <div className="sticky top-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="text-lg font-semibold text-white">Standup Details</h3>
                  <button
                    onClick={() => setSelectedStandup(null)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
                    Close
                  </button>
                </div>
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
                  {/* Author */}
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
                    {selectedStandup.developer_avatar ? (
                      <img
                        src={selectedStandup.developer_avatar}
                        alt={selectedStandup.developer_name || ""}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                        <User className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">
                        {selectedStandup.developer_name || "Unknown"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Submitted at{" "}
                        {new Date(selectedStandup.submitted_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {/* Sentiment */}
                  {selectedStandup.sentiment_score !== null &&
                    selectedStandup.sentiment_score !== undefined && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-2">Sentiment</p>
                        <SentimentIndicator
                          score={selectedStandup.sentiment_score}
                          showLabel
                          showEmoji
                        />
                      </div>
                    )}

                  {/* Yesterday */}
                  <div>
                    <p className="text-xs text-slate-500 uppercase mb-1">Yesterday</p>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">
                      {selectedStandup.yesterday_summary || "—"}
                    </p>
                  </div>

                  {/* Today */}
                  <div>
                    <p className="text-xs text-slate-500 uppercase mb-1">Today</p>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">
                      {selectedStandup.today_plan || "—"}
                    </p>
                  </div>

                  {/* Blockers */}
                  {selectedStandup.blockers_summary && (
                    <div>
                      <p className="text-xs text-amber-500 uppercase mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Blockers
                      </p>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">
                        {selectedStandup.blockers_summary}
                      </p>
                    </div>
                  )}

                  {/* Parsed Tasks */}
                  {selectedStandup.parsed_tasks &&
                    selectedStandup.parsed_tasks.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-2">
                          Parsed Tasks
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedStandup.parsed_tasks.map((task, i) => {
                            let taskText: string;
                            if (typeof task === "string") {
                              taskText = task;
                            } else if (typeof task === "object" && task !== null) {
                              const taskObj = task as Record<string, unknown>;
                              taskText = typeof taskObj.title === "string"
                                ? taskObj.title
                                : JSON.stringify(task);
                            } else {
                              taskText = String(task);
                            }
                            return (
                              <span
                                key={i}
                                className="px-2 py-0.5 text-xs bg-blue-900/30 text-blue-400 rounded"
                              >
                                {taskText}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Source */}
                  <div className="pt-4 border-t border-slate-700">
                    <p className="text-xs text-slate-500">
                      Source: <span className="text-slate-400">{selectedStandup.source}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
                <MessageSquare className="h-8 w-8 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">
                  Click on a standup to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
