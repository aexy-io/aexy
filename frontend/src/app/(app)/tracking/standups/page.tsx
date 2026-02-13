"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageSquare,
  Plus,
  Users,
  Calendar,
  List,
  Search,
  Filter,
  X,
} from "lucide-react";
import {
  StandupForm,
  StandupTimeline,
  StandupCalendarView,
  ParticipationCalendar,
  StandupStreak,
  StandupCard,
} from "@/components/tracking";
import {
  MetricCard,
  metricPresets,
  DateRangePicker,
  getDefaultDateRange,
  DateRange,
  FilterPanel,
  FilterConfig,
  FilterValues,
  ExportMenu,
  ExportFormat,
  exportToCSV,
  exportToJSON,
  SentimentIndicator,
  TeamSentimentOverview,
} from "@/components/tracking/shared";
import { useMyStandups, useSubmitStandup, useExportStandups } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { Standup } from "@/lib/api";
import { Shield } from "lucide-react";

type ViewMode = "list" | "calendar" | "heatmap";

export default function StandupsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace, isOwner } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { teams, isLoading: teamsLoading } = useTeams(workspaceId);

  // Check if user has admin/manager role (workspace owner or admin)
  // For now, we show team view to all authenticated users so managers can check team standups
  const canViewTeamStandups = true; // In production, this could be: isOwner || user has team lead role
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange("last_30_days"));
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [selectedStandup, setSelectedStandup] = useState<Standup | null>(null);

  const { data: standupsData, isLoading } = useMyStandups({ limit: 100 });
  const submitStandup = useSubmitStandup();
  const exportStandups = useExportStandups();

  // Auto-select first team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Find today's standup if it exists
  const todayStandup = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return standupsData?.standups?.find((s) => s.standup_date === today) || null;
  }, [standupsData?.standups]);

  const hasTodayStandup = !!todayStandup;

  // Filter standups based on search and filters
  const filteredStandups = useMemo(() => {
    let standups = standupsData?.standups || [];

    // Date range filter
    standups = standups.filter((s) => {
      const date = new Date(s.standup_date);
      return date >= dateRange.startDate && date <= dateRange.endDate;
    });

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      standups = standups.filter(
        (s) =>
          s.yesterday_summary?.toLowerCase().includes(query) ||
          s.today_plan?.toLowerCase().includes(query) ||
          s.blockers_summary?.toLowerCase().includes(query)
      );
    }

    // Has blockers filter
    if (filterValues.hasBlockers) {
      standups = standups.filter((s) => s.blockers_summary && s.blockers_summary.trim() !== "");
    }

    // Sentiment filter
    if (filterValues.sentiment) {
      standups = standups.filter((s) => {
        if (!s.sentiment_score) return false;
        if (filterValues.sentiment === "positive") return s.sentiment_score >= 0.6;
        if (filterValues.sentiment === "neutral") return s.sentiment_score >= 0.4 && s.sentiment_score < 0.6;
        if (filterValues.sentiment === "negative") return s.sentiment_score < 0.4;
        return true;
      });
    }

    return standups;
  }, [standupsData?.standups, dateRange, searchQuery, filterValues]);

  // Calculate stats
  const stats = useMemo(() => {
    const standups = filteredStandups;
    const sentimentScores = standups
      .filter((s) => s.sentiment_score !== null && s.sentiment_score !== undefined)
      .map((s) => s.sentiment_score as number);

    const avgSentiment =
      sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

    const withBlockers = standups.filter(
      (s) => s.blockers_summary && s.blockers_summary.trim() !== ""
    ).length;

    return {
      total: standups.length,
      avgSentiment,
      sentimentScores,
      withBlockers,
    };
  }, [filteredStandups]);

  const handleSubmit = async (data: Parameters<typeof submitStandup.mutateAsync>[0]) => {
    await submitStandup.mutateAsync(data);
    setShowForm(false);
  };

  const handleExport = async (format: ExportFormat) => {
    if (format === "csv" || format === "json") {
      // Client-side export
      const exportData = filteredStandups.map((s) => ({
        date: s.standup_date,
        yesterday: s.yesterday_summary || "",
        today: s.today_plan || "",
        blockers: s.blockers_summary || "",
        sentiment: s.sentiment_score ? Math.round(s.sentiment_score * 100) : "",
        source: s.source,
      }));

      if (format === "csv") {
        exportToCSV(exportData, `standups_${dateRange.startDate.toISOString().split("T")[0]}`);
      } else {
        exportToJSON(exportData, `standups_${dateRange.startDate.toISOString().split("T")[0]}`);
      }
    } else {
      // Server-side PDF export
      await exportStandups.mutateAsync({
        startDate: dateRange.startDate.toISOString().split("T")[0],
        endDate: dateRange.endDate.toISOString().split("T")[0],
        format,
        teamId: selectedTeamId || undefined,
      });
    }
  };

  const handleDateSelect = (date: Date, standup?: Standup) => {
    if (standup) {
      setSelectedStandup(standup);
    }
  };

  const filterConfigs: FilterConfig[] = [
    {
      key: "hasBlockers",
      label: "Has Blockers",
      type: "boolean",
    },
    {
      key: "sentiment",
      label: "Sentiment",
      type: "select",
      options: [
        { label: "Positive", value: "positive" },
        { label: "Neutral", value: "neutral" },
        { label: "Negative", value: "negative" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tracking
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-info" />
                Standups
              </h1>
              <p className="text-muted-foreground mt-2">
                Your standup history and submissions
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Team View Link */}
              {canViewTeamStandups && (
                <button
                  onClick={() => router.push("/tracking/standups/team")}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  <Shield className="h-4 w-4" />
                  Team View
                </button>
              )}
              {/* Team Selector */}
              {teams.length > 1 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedTeamId || ""}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
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
                onClick={() => setShowForm(!showForm)}
                disabled={!selectedTeamId}
                className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  hasTodayStandup ? "bg-success hover:bg-success/90" : "bg-primary hover:bg-primary/90"
                }`}
              >
                <Plus className="h-4 w-4" />
                {hasTodayStandup ? "Edit Today's Standup" : "New Standup"}
              </button>
            </div>
          </div>
        </div>

        {/* Standup Form */}
        {showForm && selectedTeamId && (
          <div className="mb-8">
            <StandupForm
              onSubmit={handleSubmit}
              isSubmitting={submitStandup.isPending}
              teamId={selectedTeamId}
              initialData={todayStandup}
            />
          </div>
        )}

        {/* No Team Warning */}
        {teams.length === 0 && !teamsLoading && (
          <div className="mb-8 p-4 bg-warning/10 border border-warning/30 rounded-xl">
            <p className="text-warning text-sm">
              You need to be part of a team to submit standups. Please contact your workspace admin to be added to a team.
            </p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Total Standups"
            value={stats.total}
            subtitle="In selected period"
            icon={MessageSquare}
            {...metricPresets.standup}
            loading={isLoading}
          />
          <StandupStreak standups={filteredStandups} className="md:col-span-1" />
          <div className="bg-card rounded-xl border border-border p-6">
            <h4 className="text-sm text-muted-foreground mb-3">Team Sentiment</h4>
            {stats.avgSentiment !== null ? (
              <SentimentIndicator
                score={stats.avgSentiment}
                showLabel
                showEmoji
                size="lg"
              />
            ) : (
              <p className="text-muted-foreground text-sm">No sentiment data</p>
            )}
          </div>
          <MetricCard
            title="With Blockers"
            value={stats.withBlockers}
            subtitle={`${Math.round((stats.withBlockers / Math.max(stats.total, 1)) * 100)}% of standups`}
            icon={Filter}
            iconColor="text-warning"
            iconBgColor="bg-warning/10"
            loading={isLoading}
          />
        </div>

        {/* View Controls & Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-card rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
              <span className="text-sm">List</span>
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Calendar</span>
            </button>
            <button
              onClick={() => setViewMode("heatmap")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "heatmap"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Heatmap</span>
            </button>
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search standups..."
              className="w-full pl-10 pr-4 py-2 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Date Range & Export */}
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              presets={["this_week", "last_week", "this_month", "last_30_days", "last_90_days"]}
            />
            <ExportMenu
              onExport={handleExport}
              options={["csv", "json"]}
              loading={exportStandups.isPending}
            />
          </div>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filterConfigs}
          values={filterValues}
          onChange={setFilterValues}
          collapsible
          defaultExpanded={false}
          className="mb-6"
        />

        {/* Content based on view mode */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={viewMode === "list" ? "lg:col-span-3" : "lg:col-span-2"}>
            {viewMode === "list" && (
              <StandupTimeline
                standups={filteredStandups}
                isLoading={isLoading}
              />
            )}

            {viewMode === "calendar" && (
              <StandupCalendarView
                standups={filteredStandups}
                onSelectDate={handleDateSelect}
              />
            )}

            {viewMode === "heatmap" && (
              <ParticipationCalendar
                standups={standupsData?.standups || []}
                weeks={52}
              />
            )}
          </div>

          {/* Sidebar for calendar/heatmap views */}
          {viewMode !== "list" && (
            <div className="lg:col-span-1 space-y-6">
              {/* Selected Standup */}
              {selectedStandup ? (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <h3 className="text-lg font-semibold text-foreground">Selected Standup</h3>
                    <button
                      onClick={() => setSelectedStandup(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <StandupCard standup={selectedStandup} />
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    Click on a day in the calendar to view the standup details
                  </p>
                </div>
              )}

              {/* Sentiment Overview */}
              {stats.sentimentScores.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Sentiment Overview</h3>
                  <TeamSentimentOverview scores={stats.sentimentScores} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
