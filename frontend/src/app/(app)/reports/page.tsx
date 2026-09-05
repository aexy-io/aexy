"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Copy,
  Calendar,
  Download,
  Clock,
  LayoutTemplate,
  Eye,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import {
  reportsApi,
  exportsApi,
  CustomReport,
  ReportTemplate,
  ScheduledReport,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3 } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { ScheduleReportModal } from "./ScheduleReportModal";
import { ReportDataView } from "./ReportDataView";

/** Row type for the scheduled reports table, enriched with the resolved report name. */
type ScheduledReportRow = ScheduledReport & { reportName: string };

export default function ReportsPage() {
  const { isAuthenticated } = useAuth();
  // Reports belong to a workspace, so every call names one; without it the
  // page would be asking "which reports?" and getting whichever answer the
  // API felt like giving.
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<CustomReport | null>(null);
  const [schedulingReport, setSchedulingReport] = useState<CustomReport | null>(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [reportsData, templatesData, schedulesData] = await Promise.all([
        reportsApi.listReports(workspaceId!).catch(() => []),
        reportsApi.listTemplates().catch(() => []),
        reportsApi.listSchedules().catch(() => []),
      ]);
      setReports(reportsData);
      setTemplates(templatesData);
      setSchedules(schedulesData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load reports. Please refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  const handleCreateFromTemplate = async (templateId: string) => {
    setCreatingFromTemplate(templateId);
    try {
      const newReport = await reportsApi.createFromTemplate(workspaceId!, templateId);
      setReports((prev) => [newReport, ...prev]);
      setShowTemplateModal(false);
      toast.success(`Created "${newReport.name}"`);
    } catch (error) {
      console.error("Failed to create report:", error);
      toast.error("Failed to create report from template.");
    } finally {
      setCreatingFromTemplate(null);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    setDeleting(reportId);
    try {
      await reportsApi.deleteReport(workspaceId!, reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast.success("Report deleted");
    } catch (error) {
      console.error("Failed to delete report:", error);
      toast.error("Failed to delete report.");
    } finally {
      setDeleting(null);
    }
  };

  const handleCloneReport = async (reportId: string, name: string) => {
    setCloning(reportId);
    try {
      const cloned = await reportsApi.cloneReport(workspaceId!, reportId, `Copy of ${name}`);
      setReports((prev) => [cloned, ...prev]);
      toast.success(`Cloned to "${cloned.name}"`);
    } catch (error) {
      console.error("Failed to clone report:", error);
      toast.error("Failed to clone report.");
    } finally {
      setCloning(null);
    }
  };

  const handleExportReport = async (reportId: string) => {
    setExporting(reportId);
    try {
      await exportsApi.createExport({
        export_type: "report",
        format: "pdf",
        config: { report_id: reportId },
      });
      toast.success("Export started — track it on the Exports page.");
    } catch (error) {
      console.error("Failed to export report:", error);
      toast.error("Failed to start export.");
    } finally {
      setExporting(null);
    }
  };

  const handleScheduleCreated = (schedule: ScheduledReport) => {
    setSchedules((prev) => [schedule, ...prev]);
    setSchedulingReport(null);
    toast.success("Report scheduled");
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "team":
        return "bg-blue-500/20 text-blue-400";
      case "performance":
        return "bg-green-500/20 text-green-400";
      case "individual":
        return "bg-purple-500/20 text-purple-400";
      case "health":
        return "bg-orange-500/20 text-orange-400";
      case "executive":
        return "bg-pink-500/20 text-pink-400";
      default:
        return "bg-muted-foreground/20 text-muted-foreground";
    }
  };

  // Enrich scheduled report rows with the resolved report name
  const scheduledReportRows: ScheduledReportRow[] = useMemo(
    () =>
      schedules.map((schedule) => ({
        ...schedule,
        reportName: reports.find((r) => r.id === schedule.report_id)?.name || "Unknown Report",
      })),
    [schedules, reports]
  );

  const scheduledReportColumns: DataTableColumn<ScheduledReportRow>[] = useMemo(
    () => [
      {
        id: "report",
        header: "Report",
        sortable: true,
        sortValue: (row) => row.reportName,
        cell: (row) => row.reportName,
      },
      {
        id: "schedule",
        header: "Schedule",
        sortable: true,
        sortValue: (row) => row.schedule,
        cell: (row) => (
          <span className="capitalize">
            {row.schedule} at {row.time_utc} UTC
          </span>
        ),
      },
      {
        id: "format",
        header: "Format",
        sortable: true,
        sortValue: (row) => row.export_format,
        cell: (row) => <span className="uppercase">{row.export_format}</span>,
      },
      {
        id: "next_run",
        header: "Next Run",
        sortable: true,
        sortValue: (row) => new Date(row.next_run_at).getTime(),
        // next_run_at is UTC from the API; toLocaleString renders in the user's tz.
        cell: (row) => new Date(row.next_run_at).toLocaleString(),
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        sortValue: (row) => (row.is_active ? "Active" : "Paused"),
        cell: (row) => (
          <span
            className={`px-2 py-0.5 rounded text-xs ${
              row.is_active
                ? "bg-green-500/20 text-green-400"
                : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            {row.is_active ? "Active" : "Paused"}
          </span>
        ),
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-7 w-28 bg-accent rounded mb-2" />
            <div className="h-4 w-64 bg-accent rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-accent rounded-lg" />
            <div className="h-9 w-28 bg-accent rounded-lg" />
          </div>
        </div>
        <div className="mb-10">
          <div className="h-5 w-28 bg-accent rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted rounded-xl p-5 border border-border">
                <div className="h-5 w-36 bg-accent rounded mb-3" />
                <div className="h-3 w-full bg-accent rounded mb-2" />
                <div className="h-3 w-2/3 bg-accent rounded mb-4" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-accent rounded-full" />
                  <div className="h-5 w-20 bg-accent rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create, manage, and schedule custom analytics reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/exports"
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-foreground hover:bg-accent transition text-sm"
          >
            <Download className="h-4 w-4" />
            Exports
          </Link>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="h-4 w-4" />
            New Report
          </button>
        </div>
      </div>

      {/* My Reports */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-foreground mb-4">My Reports</h2>
        {reports.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No reports yet"
            description="Build custom reports to visualize team performance, productivity trends, and project metrics."
            actions={[
              { label: "Create Report", onClick: () => setShowTemplateModal(true) },
            ]}
            compact
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-card rounded-xl p-5 border border-border hover:border-primary/20 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-foreground font-medium truncate flex-1">{report.name}</h3>
                  {report.is_public && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded ml-2">
                      Public
                    </span>
                  )}
                </div>
                {report.description && (
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{report.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                  <span>{report.widgets.length} widgets</span>
                  <span>·</span>
                  <span>Updated {new Date(report.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedReport(report)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <Link
                    href={`/reports/${report.id}`}
                    className="p-2 bg-accent hover:bg-muted text-foreground rounded-lg transition"
                    title="Edit report"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => setSchedulingReport(report)}
                    className="p-2 bg-accent hover:bg-muted text-foreground rounded-lg transition"
                    title="Schedule report"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleExportReport(report.id)}
                    disabled={exporting === report.id}
                    className="p-2 bg-accent hover:bg-muted text-foreground rounded-lg transition disabled:opacity-50"
                    title="Export as PDF"
                  >
                    {exporting === report.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCloneReport(report.id, report.name)}
                    disabled={cloning === report.id}
                    className="p-2 bg-accent hover:bg-muted text-foreground rounded-lg transition disabled:opacity-50"
                    title="Clone report"
                  >
                    {cloning === report.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteReport(report.id)}
                    disabled={deleting === report.id}
                    className="p-2 bg-accent hover:bg-muted text-muted-foreground hover:text-red-400 rounded-lg transition disabled:opacity-50"
                    title="Delete report"
                  >
                    {deleting === report.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled Reports */}
      {schedules.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            Scheduled Reports
          </h2>
          <DataTable
            columns={scheduledReportColumns}
            data={scheduledReportRows}
            rowKey={(row) => row.id}
            emptyTitle="No scheduled reports"
            emptyDescription="Schedule a report to receive automated deliveries."
          />
        </div>
      )}

      {/* Report Templates */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-blue-400" />
          Available Templates
        </h2>
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">No report templates available.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-card rounded-xl p-5 border border-border">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-foreground font-medium">{template.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(template.category)}`}>
                    {template.category}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm mb-3">{template.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{template.widget_count} widgets</span>
                  <button
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={creatingFromTemplate === template.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {creatingFromTemplate === template.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Create New Report</h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-muted-foreground text-sm mb-4">Choose a template to get started:</p>
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={creatingFromTemplate === template.id}
                    className="text-left bg-accent hover:bg-muted disabled:opacity-50 rounded-lg p-4 transition"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-foreground font-medium">{template.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(template.category)}`}>
                        {template.category}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-2">{template.description}</p>
                    <span className="text-xs text-muted-foreground">{template.widget_count} widgets</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report View Modal — now renders live widget data */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-border flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{selectedReport.name}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportReport(selectedReport.id)}
                  disabled={exporting === selectedReport.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  onClick={() => {
                    setSchedulingReport(selectedReport);
                    setSelectedReport(null);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule
                </button>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-muted-foreground hover:text-foreground ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {selectedReport.description && (
                <p className="text-muted-foreground mb-6">{selectedReport.description}</p>
              )}
              <ReportDataView report={selectedReport} workspaceId={workspaceId!} />
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {schedulingReport && (
        <ScheduleReportModal
          report={schedulingReport}
          workspaceId={workspaceId!}
          onClose={() => setSchedulingReport(null)}
          onCreated={handleScheduleCreated}
        />
      )}
    </div>
  );
}
