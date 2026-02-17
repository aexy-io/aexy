"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  Plus,
  BarChart3,
  Columns,
  Filter,
  Search,
  X,
  Clock,
} from "lucide-react";
import {
  BlockerBoard,
  BlockerReportForm,
  SLAIndicator,
  BlockerAnalyticsDashboard,
} from "@/components/tracking";
import {
  MetricCard,
  metricPresets,
  FilterPanel,
  FilterConfig,
  FilterValues,
  ExportMenu,
  ExportFormat,
  exportToCSV,
  exportToJSON,
} from "@/components/tracking/shared";
import {
  useActiveBlockers,
  useReportBlocker,
  useResolveBlocker,
  useEscalateBlocker,
  useExportBlockers,
} from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { Blocker } from "@/lib/api";

type ViewMode = "board" | "analytics";

export default function BlockersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const { data: blockersData, isLoading } = useActiveBlockers();
  const reportBlocker = useReportBlocker();
  const resolveBlocker = useResolveBlocker();
  const escalateBlocker = useEscalateBlocker();
  const exportBlockers = useExportBlockers();

  const handleSubmit = async (data: Parameters<typeof reportBlocker.mutateAsync>[0]) => {
    await reportBlocker.mutateAsync(data);
    setShowForm(false);
  };

  // Get all blockers from response
  const blockers = blockersData?.blockers || [];

  // Filter blockers
  const filteredBlockers = useMemo(() => {
    let result = [...blockers];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.description.toLowerCase().includes(query) ||
          b.resolution_notes?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filterValues.status) {
      result = result.filter((b) => b.status === filterValues.status);
    }

    // Severity filter
    if (filterValues.severity) {
      result = result.filter((b) => b.severity === filterValues.severity);
    }

    // Category filter
    if (filterValues.category) {
      result = result.filter((b) => b.category === filterValues.category);
    }

    // SLA status filter
    if (filterValues.slaStatus) {
      const now = Date.now();
      result = result.filter((b) => {
        if (b.status === "resolved") return filterValues.slaStatus === "resolved";
        const hours = (now - new Date(b.reported_at).getTime()) / (1000 * 60 * 60);
        if (filterValues.slaStatus === "breached") return hours >= 24;
        if (filterValues.slaStatus === "at_risk") return hours >= 18 && hours < 24;
        return hours < 18;
      });
    }

    return result;
  }, [blockers, searchQuery, filterValues]);

  // Stats
  const stats = useMemo(() => {
    const active = blockers.filter((b) => b.status === "active");
    const escalated = blockers.filter((b) => b.status === "escalated");
    const resolved = blockers.filter((b) => b.status === "resolved");

    // Calculate SLA breached count
    const now = Date.now();
    const breachedSla = active.filter((b) => {
      const hours = (now - new Date(b.reported_at).getTime()) / (1000 * 60 * 60);
      return hours >= 24;
    }).length;

    // Average age of active blockers
    const avgAge = active.length > 0
      ? active.reduce((sum, b) => {
          return sum + (now - new Date(b.reported_at).getTime()) / (1000 * 60 * 60);
        }, 0) / active.length
      : 0;

    return {
      total: blockers.length,
      active: active.length,
      escalated: escalated.length,
      resolved: resolved.length,
      breachedSla,
      avgAgeHours: avgAge,
    };
  }, [blockers]);

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const handleExport = async (format: ExportFormat) => {
    if (format === "csv" || format === "json") {
      const exportData = filteredBlockers.map((b) => ({
        description: b.description,
        severity: b.severity,
        category: b.category,
        status: b.status,
        reported_at: b.reported_at,
        resolution_notes: b.resolution_notes || "",
        escalation_notes: b.escalation_notes || "",
      }));

      if (format === "csv") {
        exportToCSV(exportData, "blockers_export");
      } else {
        exportToJSON(exportData, "blockers_export");
      }
    } else {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      await exportBlockers.mutateAsync({
        startDate: startDate.toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        format,
      });
    }
  };

  const filterConfigs: FilterConfig[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Escalated", value: "escalated" },
        { label: "Resolved", value: "resolved" },
      ],
    },
    {
      key: "severity",
      label: "Severity",
      type: "select",
      options: [
        { label: "Critical", value: "critical" },
        { label: "High", value: "high" },
        { label: "Medium", value: "medium" },
        { label: "Low", value: "low" },
      ],
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: [
        { label: "Technical", value: "technical" },
        { label: "Dependency", value: "dependency" },
        { label: "Resource", value: "resource" },
        { label: "External", value: "external" },
        { label: "Process", value: "process" },
        { label: "Other", value: "other" },
      ],
    },
    {
      key: "slaStatus",
      label: "SLA Status",
      type: "select",
      options: [
        { label: "On Track", value: "on_track" },
        { label: "At Risk", value: "at_risk" },
        { label: "Breached", value: "breached" },
        { label: "Resolved", value: "resolved" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <AlertTriangle className="h-8 w-8 text-red-400" />
                Blockers
              </h1>
              <p className="text-muted-foreground mt-2">
                Track and manage blockers with SLA tracking
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              <Plus className="h-4 w-4" />
              Report Blocker
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <MetricCard
            title="Active"
            value={stats.active}
            subtitle="Needs attention"
            icon={AlertTriangle}
            {...metricPresets.blocker}
            loading={isLoading}
          />
          <MetricCard
            title="Escalated"
            value={stats.escalated}
            subtitle="Waiting for help"
            icon={AlertTriangle}
            iconColor="text-purple-400"
            iconBgColor="bg-purple-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="Resolved"
            value={stats.resolved}
            subtitle="Completed"
            icon={AlertTriangle}
            iconColor="text-green-400"
            iconBgColor="bg-green-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="SLA Breached"
            value={stats.breachedSla}
            subtitle="> 24 hours old"
            icon={Clock}
            iconColor="text-amber-400"
            iconBgColor="bg-amber-900/30"
            loading={isLoading}
          />
          <MetricCard
            title="Avg Age"
            value={formatHours(stats.avgAgeHours)}
            subtitle="Active blockers"
            icon={Clock}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-900/30"
            loading={isLoading}
          />
        </div>

        {/* View Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "board"
                  ? "bg-red-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns className="h-4 w-4" />
              <span className="text-sm">Board</span>
            </button>
            <button
              onClick={() => setViewMode("analytics")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition ${
                viewMode === "analytics"
                  ? "bg-red-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span className="text-sm">Analytics</span>
            </button>
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search blockers..."
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-red-500"
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

          {/* Export */}
          <ExportMenu
            onExport={handleExport}
            options={["csv", "json"]}
            loading={exportBlockers.isPending}
          />
        </div>

        {/* Filters (only for board view) */}
        {viewMode === "board" && (
          <FilterPanel
            filters={filterConfigs}
            values={filterValues}
            onChange={setFilterValues}
            collapsible
            defaultExpanded={false}
            className="mb-6"
          />
        )}

        {/* Report Form */}
        {showForm && (
          <div className="mb-8">
            <BlockerReportForm
              onSubmit={handleSubmit}
              isSubmitting={reportBlocker.isPending}
            />
          </div>
        )}

        {/* Content based on view mode */}
        {viewMode === "board" && (
          <BlockerBoard
            blockers={filteredBlockers}
            isLoading={isLoading}
            onResolve={async (blockerId, notes) => {
              await resolveBlocker.mutateAsync({ blockerId, notes });
            }}
            onEscalate={async (blockerId, escalateToId, notes) => {
              await escalateBlocker.mutateAsync({ blockerId, escalateToId, notes });
            }}
            isResolving={resolveBlocker.isPending}
            isEscalating={escalateBlocker.isPending}
          />
        )}

        {viewMode === "analytics" && (
          <BlockerAnalyticsDashboard
            blockers={blockers}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
