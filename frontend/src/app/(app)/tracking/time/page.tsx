"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Plus,
  Calendar,
  TrendingUp,
  List,
  Grid3X3,
  PieChart,
  BarChart3,
} from "lucide-react";
import { TimeLogForm, TimeEntryList, WeeklyTimesheetView } from "@/components/tracking";
import {
  MetricCard,
  metricPresets,
  DateRangePicker,
  getDefaultDateRange,
  DateRange,
  ExportMenu,
  ExportFormat,
  exportToCSV,
  exportToJSON,
} from "@/components/tracking/shared";
import {
  TimeBreakdownChart,
  groupTimeByProject,
  groupTimeByDate,
  UtilizationGauge,
  HeatmapCalendar,
  timeEntriesToHeatmap,
} from "@/components/tracking/charts";
import { useMyTimeEntries, useLogTime, useExportTimesheet } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";

type ViewMode = "list" | "timesheet" | "charts";
type GroupBy = "date" | "project" | "none";
type ChartType = "project" | "daily" | "heatmap";

export default function TimeTrackingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [chartType, setChartType] = useState<ChartType>("project");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange("this_month"));

  const { data: timeData, isLoading } = useMyTimeEntries({
    start: dateRange.startDate.toISOString().split("T")[0],
    end: dateRange.endDate.toISOString().split("T")[0],
  });
  const logTime = useLogTime();
  const exportTimesheet = useExportTimesheet();

  const handleSubmit = async (data: Parameters<typeof logTime.mutateAsync>[0]) => {
    await logTime.mutateAsync(data);
    setShowForm(false);
  };

  // Calculate stats
  const stats = useMemo(() => {
    const entries = timeData?.entries || [];
    const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEntries = entries.filter(
      (e) => new Date(e.entry_date).toDateString() === today.toDateString()
    );
    const todayMinutes = todayEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeekEntries = entries.filter((e) => new Date(e.entry_date) >= weekAgo);
    const weekMinutes = thisWeekEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

    // Count unique days with entries
    const uniqueDays = new Set(entries.map((e) => e.entry_date.split("T")[0])).size;

    // Average per day (only counting days with entries)
    const avgPerDay = uniqueDays > 0 ? totalMinutes / uniqueDays : 0;

    return {
      totalMinutes,
      todayMinutes,
      weekMinutes,
      totalEntries: entries.length,
      todayEntries: todayEntries.length,
      weekEntries: thisWeekEntries.length,
      uniqueDays,
      avgPerDay,
    };
  }, [timeData?.entries]);

  // Chart data
  const chartData = useMemo(() => {
    const entries = timeData?.entries || [];
    return {
      byProject: groupTimeByProject(entries),
      byDate: groupTimeByDate(entries),
      heatmap: timeEntriesToHeatmap(entries),
    };
  }, [timeData?.entries]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleExport = async (format: ExportFormat) => {
    const entries = timeData?.entries || [];

    if (format === "csv" || format === "json") {
      const exportData = entries.map((e) => ({
        date: e.entry_date,
        task: e.task?.title || "Unassigned",
        duration_minutes: e.duration_minutes,
        duration_hours: (e.duration_minutes / 60).toFixed(2),
        description: e.description || "",
        source: e.source,
      }));

      if (format === "csv") {
        exportToCSV(exportData, `timesheet_${dateRange.startDate.toISOString().split("T")[0]}`);
      } else {
        exportToJSON(exportData, `timesheet_${dateRange.startDate.toISOString().split("T")[0]}`);
      }
    } else {
      await exportTimesheet.mutateAsync({
        startDate: dateRange.startDate.toISOString().split("T")[0],
        endDate: dateRange.endDate.toISOString().split("T")[0],
        format,
      });
    }
  };

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
                <Clock className="h-8 w-8 text-green-400" />
                Time Tracking
              </h1>
              <p className="text-muted-foreground mt-2">
                Log and view your time entries
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Plus className="h-4 w-4" />
              Log Time
            </button>
          </div>
        </div>

        {/* Time Log Form */}
        {showForm && (
          <div className="mb-8">
            <TimeLogForm
              onSubmit={handleSubmit}
              isSubmitting={logTime.isPending}
            />
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Today"
            value={formatDuration(stats.todayMinutes)}
            subtitle={`${stats.todayEntries} entries`}
            icon={Calendar}
            {...metricPresets.time}
            loading={isLoading}
          />
          <MetricCard
            title="This Week"
            value={formatDuration(stats.weekMinutes)}
            subtitle={`${stats.weekEntries} entries`}
            icon={TrendingUp}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="Total in Period"
            value={formatDuration(stats.totalMinutes)}
            subtitle={`${stats.uniqueDays} days logged`}
            icon={Clock}
            iconColor="text-purple-400"
            iconBgColor="bg-purple-900/30"
            loading={isLoading}
          />
          <UtilizationGauge
            value={stats.weekMinutes / 60}
            target={40}
            title="Weekly Target"
            size="sm"
          />
        </div>

        {/* View Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "list"
                  ? "bg-green-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
              <span className="text-sm">List</span>
            </button>
            <button
              onClick={() => setViewMode("timesheet")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "timesheet"
                  ? "bg-green-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="text-sm">Timesheet</span>
            </button>
            <button
              onClick={() => setViewMode("charts")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "charts"
                  ? "bg-green-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PieChart className="h-4 w-4" />
              <span className="text-sm">Charts</span>
            </button>
          </div>

          {/* List grouping (only for list view) */}
          {viewMode === "list" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-green-500"
              >
                <option value="date">Date</option>
                <option value="project">Project</option>
                <option value="none">None</option>
              </select>
            </div>
          )}

          {/* Chart type (only for charts view) */}
          {viewMode === "charts" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value as ChartType)}
                className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-green-500"
              >
                <option value="project">By Project</option>
                <option value="daily">By Day</option>
                <option value="heatmap">Heatmap</option>
              </select>
            </div>
          )}

          <div className="flex-1" />

          {/* Date Range & Export */}
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              presets={["this_week", "last_week", "this_month", "last_30_days"]}
            />
            <ExportMenu
              onExport={handleExport}
              options={["csv", "json"]}
              loading={exportTimesheet.isPending}
            />
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === "list" && (
          <TimeEntryList
            entries={timeData?.entries || []}
            isLoading={isLoading}
          />
        )}

        {viewMode === "timesheet" && (
          <WeeklyTimesheetView
            entries={timeData?.entries || []}
            targetHoursPerDay={8}
          />
        )}

        {viewMode === "charts" && (
          <div className="space-y-6">
            {chartType === "project" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TimeBreakdownChart
                  data={chartData.byProject}
                  type="pie"
                  title="Time by Project"
                  height={300}
                />
                <TimeBreakdownChart
                  data={chartData.byProject}
                  type="bar"
                  title="Time by Project (Bar)"
                  height={300}
                />
              </div>
            )}

            {chartType === "daily" && (
              <TimeBreakdownChart
                data={chartData.byDate}
                type="bar"
                title="Time by Day"
                height={400}
              />
            )}

            {chartType === "heatmap" && (
              <HeatmapCalendar
                data={chartData.heatmap}
                weeks={26}
                title="Time Logged (Last 6 Months)"
                valueFormatter={(v) => formatDuration(v)}
              />
            )}

            {/* Summary stats below charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted rounded-xl border border-border p-6">
                <h4 className="text-sm text-muted-foreground mb-2">Average Per Day</h4>
                <p className="text-2xl font-bold text-foreground">{formatDuration(stats.avgPerDay)}</p>
                <p className="text-xs text-muted-foreground mt-1">across {stats.uniqueDays} working days</p>
              </div>
              <div className="bg-muted rounded-xl border border-border p-6">
                <h4 className="text-sm text-muted-foreground mb-2">Most Time On</h4>
                {chartData.byProject[0] ? (
                  <>
                    <p className="text-2xl font-bold text-foreground truncate">{chartData.byProject[0].name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDuration(chartData.byProject[0].value)}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No data</p>
                )}
              </div>
              <div className="bg-muted rounded-xl border border-border p-6">
                <h4 className="text-sm text-muted-foreground mb-2">Projects Worked On</h4>
                <p className="text-2xl font-bold text-foreground">{chartData.byProject.length}</p>
                <p className="text-xs text-muted-foreground mt-1">in selected period</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
