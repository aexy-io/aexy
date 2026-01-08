"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  GitBranch,
  BarChart3,
  Users,
  FileText,
  Plus,
  Trash2,
  Copy,
  Calendar,
  Download,
  Clock,
  LogOut,
  GraduationCap,
  Lightbulb,
  LayoutTemplate,
  Eye,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  reportsApi,
  CustomReport,
  ReportTemplate,
  ScheduledReport,
} from "@/lib/api";

export default function ReportsPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<CustomReport | null>(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsData, templatesData, schedulesData] = await Promise.all([
        reportsApi.listReports().catch(() => []),
        reportsApi.listTemplates().catch(() => []),
        reportsApi.listSchedules().catch(() => []),
      ]);
      setReports(reportsData);
      setTemplates(templatesData);
      setSchedules(schedulesData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  const handleCreateFromTemplate = async (templateId: string) => {
    setCreatingFromTemplate(templateId);
    try {
      const newReport = await reportsApi.createFromTemplate(templateId);
      setReports((prev) => [newReport, ...prev]);
      setShowTemplateModal(false);
    } catch (error) {
      console.error("Failed to create report:", error);
    } finally {
      setCreatingFromTemplate(null);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      await reportsApi.deleteReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (error) {
      console.error("Failed to delete report:", error);
    }
  };

  const handleCloneReport = async (reportId: string, name: string) => {
    try {
      const cloned = await reportsApi.cloneReport(reportId, `Copy of ${name}`);
      setReports((prev) => [cloned, ...prev]);
    } catch (error) {
      console.error("Failed to clone report:", error);
    }
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
        return "bg-slate-500/20 text-slate-400";
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Aexy</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/analytics"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
              <Link
                href="/insights"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Lightbulb className="h-4 w-4" />
                Insights
              </Link>
              <Link
                href="/reports"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Reports
              </Link>
              <Link
                href="/learning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/hiring"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Hiring
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.avatar_url && (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-white">{user?.name || user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary-400" />
              Custom Reports
            </h1>
            <p className="text-slate-400 mt-1">
              Create, manage, and schedule custom analytics reports
            </p>
          </div>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition"
          >
            <Plus className="h-4 w-4" />
            New Report
          </button>
        </div>

        {/* My Reports */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4">My Reports</h2>
          {reports.length === 0 ? (
            <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                No reports yet
              </h3>
              <p className="text-slate-400 mb-4">
                Create your first report from a template to get started
              </p>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
                Create Report
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-white font-medium truncate flex-1">
                      {report.name}
                    </h3>
                    {report.is_public && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded ml-2">
                        Public
                      </span>
                    )}
                  </div>
                  {report.description && (
                    <p className="text-slate-400 text-sm mb-3 line-clamp-2">
                      {report.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                    <span>{report.widgets.length} widgets</span>
                    <span>•</span>
                    <span>
                      Updated {new Date(report.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedReport(report)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </button>
                    <button
                      onClick={() => handleCloneReport(report.id, report.name)}
                      className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                      title="Clone report"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="p-2 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white rounded-lg transition"
                      title="Delete report"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scheduled Reports */}
        {schedules.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-400" />
              Scheduled Reports
            </h2>
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                      Report
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                      Schedule
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                      Format
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                      Next Run
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => {
                    const report = reports.find(
                      (r) => r.id === schedule.report_id
                    );
                    return (
                      <tr
                        key={schedule.id}
                        className="border-t border-slate-700"
                      >
                        <td className="px-4 py-3 text-white">
                          {report?.name || "Unknown Report"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 capitalize">
                          {schedule.schedule} at {schedule.time_utc} UTC
                        </td>
                        <td className="px-4 py-3 text-slate-300 uppercase">
                          {schedule.export_format}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {new Date(schedule.next_run_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              schedule.is_active
                                ? "bg-green-500/20 text-green-400"
                                : "bg-slate-500/20 text-slate-400"
                            }`}
                          >
                            {schedule.is_active ? "Active" : "Paused"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report Templates */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary-400" />
            Available Templates
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-slate-800 rounded-xl p-5 border border-slate-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-white font-medium">{template.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(
                      template.category
                    )}`}
                  >
                    {template.category}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-3">
                  {template.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {template.widget_count} widgets
                  </span>
                  <button
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={creatingFromTemplate === template.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-800 text-white text-sm rounded-lg transition"
                  >
                    {creatingFromTemplate === template.id ? (
                      <>Creating...</>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        Use Template
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                Create New Report
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-slate-400 mb-4">
                Choose a template to get started:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={creatingFromTemplate === template.id}
                    className="text-left bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg p-4 transition"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-medium">{template.name}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${getCategoryColor(
                          template.category
                        )}`}
                      >
                        {template.category}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-2">
                      {template.description}
                    </p>
                    <span className="text-xs text-slate-500">
                      {template.widget_count} widgets
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report View Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                {selectedReport.name}
              </h2>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition">
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition">
                  <Calendar className="h-4 w-4" />
                  Schedule
                </button>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-slate-400 hover:text-white ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {selectedReport.description && (
                <p className="text-slate-400 mb-6">{selectedReport.description}</p>
              )}

              <h3 className="text-white font-medium mb-4">Widgets</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {selectedReport.widgets.map((widget, idx) => (
                  <div
                    key={widget.id || idx}
                    className="bg-slate-700 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-white font-medium">{widget.title}</h4>
                      <span className="text-xs text-slate-400 uppercase">
                        {widget.type.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      Metric: {widget.metric.replace("_", " ")}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      Position: ({widget.position.x}, {widget.position.y}) •
                      Size: {widget.position.w}x{widget.position.h}
                    </p>
                  </div>
                ))}
              </div>

              {selectedReport.filters && Object.keys(selectedReport.filters).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-white font-medium mb-3">Filters</h3>
                  <div className="bg-slate-700 rounded-lg p-4 text-sm text-slate-300">
                    <pre>{JSON.stringify(selectedReport.filters, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
