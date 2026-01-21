"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  Plug,
  Users,
  BookOpen,
  Package,
  Calendar,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Settings,
  Play,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  learningIntegrationsApi,
  IntegrationsOverview,
  HRIntegration,
  LMSIntegration,
  SCORMPackageWithStats,
  CalendarIntegration,
  HRProviderType,
  LMSProviderType,
  CalendarProviderType,
  IntegrationStatus,
} from "@/lib/api";

type TabType = "overview" | "hr" | "lms" | "scorm" | "calendar";

export default function LearningIntegrationsPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);

  // Data state
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [hrIntegrations, setHRIntegrations] = useState<HRIntegration[]>([]);
  const [lmsIntegrations, setLMSIntegrations] = useState<LMSIntegration[]>([]);
  const [scormPackages, setScormPackages] = useState<SCORMPackageWithStats[]>([]);
  const [calendarIntegrations, setCalendarIntegrations] = useState<CalendarIntegration[]>([]);

  const fetchOverview = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const data = await learningIntegrationsApi.getOverview();
      setOverview(data);
    } catch (error) {
      console.error("Failed to fetch overview:", error);
    }
  }, [currentWorkspaceId]);

  const fetchHRIntegrations = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const data = await learningIntegrationsApi.hr.list();
      setHRIntegrations(data.items);
    } catch (error) {
      console.error("Failed to fetch HR integrations:", error);
    }
  }, [currentWorkspaceId]);

  const fetchLMSIntegrations = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const data = await learningIntegrationsApi.lms.list();
      setLMSIntegrations(data.items);
    } catch (error) {
      console.error("Failed to fetch LMS integrations:", error);
    }
  }, [currentWorkspaceId]);

  const fetchSCORMPackages = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const data = await learningIntegrationsApi.scorm.listPackages();
      setScormPackages(data.items);
    } catch (error) {
      console.error("Failed to fetch SCORM packages:", error);
    }
  }, [currentWorkspaceId]);

  const fetchCalendarIntegrations = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const data = await learningIntegrationsApi.calendar.list();
      setCalendarIntegrations(data.items);
    } catch (error) {
      console.error("Failed to fetch calendar integrations:", error);
    }
  }, [currentWorkspaceId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await fetchOverview();
    setLoading(false);
  }, [fetchOverview]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === "hr") fetchHRIntegrations();
    if (activeTab === "lms") fetchLMSIntegrations();
    if (activeTab === "scorm") fetchSCORMPackages();
    if (activeTab === "calendar") fetchCalendarIntegrations();
  }, [activeTab, fetchHRIntegrations, fetchLMSIntegrations, fetchSCORMPackages, fetchCalendarIntegrations]);

  const handleTriggerHRSync = async (integrationId: string) => {
    try {
      await learningIntegrationsApi.hr.triggerSync(integrationId);
      fetchHRIntegrations();
    } catch (error) {
      console.error("Failed to trigger sync:", error);
    }
  };

  const handleDeleteHRIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return;
    try {
      await learningIntegrationsApi.hr.delete(integrationId);
      fetchHRIntegrations();
      fetchOverview();
    } catch (error) {
      console.error("Failed to delete integration:", error);
    }
  };

  const handleDeleteLMSIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return;
    try {
      await learningIntegrationsApi.lms.delete(integrationId);
      fetchLMSIntegrations();
      fetchOverview();
    } catch (error) {
      console.error("Failed to delete integration:", error);
    }
  };

  const handleDeleteSCORMPackage = async (packageId: string) => {
    if (!confirm("Are you sure you want to delete this SCORM package?")) return;
    try {
      await learningIntegrationsApi.scorm.deletePackage(packageId);
      fetchSCORMPackages();
      fetchOverview();
    } catch (error) {
      console.error("Failed to delete package:", error);
    }
  };

  const handleDeleteCalendarIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return;
    try {
      await learningIntegrationsApi.calendar.delete(integrationId);
      fetchCalendarIntegrations();
      fetchOverview();
    } catch (error) {
      console.error("Failed to delete integration:", error);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading integrations...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const getStatusColor = (status: IntegrationStatus) => {
    switch (status) {
      case "active":
        return "bg-green-900/50 text-green-400 border-green-700";
      case "inactive":
        return "bg-slate-700 text-slate-400 border-slate-600";
      case "error":
        return "bg-red-900/50 text-red-400 border-red-700";
      case "pending_setup":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-700";
      default:
        return "bg-slate-700 text-slate-400 border-slate-600";
    }
  };

  const getStatusIcon = (status: IntegrationStatus) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4" />;
      case "error":
        return <XCircle className="h-4 w-4" />;
      case "pending_setup":
        return <Clock className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getProviderLabel = (provider: HRProviderType | LMSProviderType | CalendarProviderType) => {
    const labels: Record<string, string> = {
      workday: "Workday",
      bamboohr: "BambooHR",
      sap_successfactors: "SAP SuccessFactors",
      adp: "ADP",
      custom_api: "Custom API",
      scorm_cloud: "SCORM Cloud",
      cornerstone: "Cornerstone",
      linkedin_learning: "LinkedIn Learning",
      udemy_business: "Udemy Business",
      coursera: "Coursera",
      custom: "Custom LMS",
      google_calendar: "Google Calendar",
      outlook: "Outlook",
      apple: "Apple Calendar",
    };
    return labels[provider] || provider;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl">
              <Plug className="h-7 w-7 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Learning Integrations</h1>
              <p className="text-slate-400 text-sm">Connect HR systems, LMS, SCORM, and calendars</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800/50 p-1 rounded-lg w-fit">
          {[
            { id: "overview", label: "Overview", icon: Plug },
            { id: "hr", label: "HR Systems", icon: Users },
            { id: "lms", label: "LMS", icon: BookOpen },
            { id: "scorm", label: "SCORM", icon: Package },
            { id: "calendar", label: "Calendar", icon: Calendar },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-primary-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && overview && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-900/50 rounded-lg">
                    <Users className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-slate-400 text-sm">HR Integrations</span>
                </div>
                <div className="text-2xl font-bold text-white">{overview.hr_integrations_count}</div>
                <div className="text-sm text-slate-500 mt-1">{overview.hr_integrations_active} active</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-purple-900/50 rounded-lg">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <span className="text-slate-400 text-sm">LMS Integrations</span>
                </div>
                <div className="text-2xl font-bold text-white">{overview.lms_integrations_count}</div>
                <div className="text-sm text-slate-500 mt-1">{overview.lms_integrations_active} active</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-900/50 rounded-lg">
                    <Package className="h-5 w-5 text-green-400" />
                  </div>
                  <span className="text-slate-400 text-sm">SCORM Packages</span>
                </div>
                <div className="text-2xl font-bold text-white">{overview.scorm_packages_count}</div>
                <div className="text-sm text-slate-500 mt-1">{overview.scorm_packages_active} active</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-900/50 rounded-lg">
                    <Calendar className="h-5 w-5 text-amber-400" />
                  </div>
                  <span className="text-slate-400 text-sm">Calendar Syncs</span>
                </div>
                <div className="text-2xl font-bold text-white">{overview.calendar_integrations_count}</div>
                <div className="text-sm text-slate-500 mt-1">{overview.calendar_integrations_active} active</div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Last Sync Activity</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Last HR Sync</span>
                    <span className="text-white">{formatDate(overview.last_hr_sync_at)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Last LMS Sync</span>
                    <span className="text-white">{formatDate(overview.last_lms_sync_at)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total xAPI Statements</span>
                    <span className="text-white">{overview.total_xapi_statements.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab("hr")}
                    className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                  >
                    <Users className="h-5 w-5 text-blue-400 mb-2" />
                    <div className="text-sm text-white font-medium">Add HR System</div>
                  </button>
                  <button
                    onClick={() => setActiveTab("lms")}
                    className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                  >
                    <BookOpen className="h-5 w-5 text-purple-400 mb-2" />
                    <div className="text-sm text-white font-medium">Connect LMS</div>
                  </button>
                  <button
                    onClick={() => setActiveTab("scorm")}
                    className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                  >
                    <Package className="h-5 w-5 text-green-400 mb-2" />
                    <div className="text-sm text-white font-medium">Upload SCORM</div>
                  </button>
                  <button
                    onClick={() => setActiveTab("calendar")}
                    className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                  >
                    <Calendar className="h-5 w-5 text-amber-400 mb-2" />
                    <div className="text-sm text-white font-medium">Sync Calendar</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HR Integrations Tab */}
        {activeTab === "hr" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">HR System Integrations</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition">
                <Plus className="h-4 w-4" />
                Add Integration
              </button>
            </div>

            {hrIntegrations.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No HR Integrations</h3>
                <p className="text-slate-400 mb-4">Connect your HR system to sync employee data automatically.</p>
                <p className="text-slate-500 text-sm">Supported: Workday, BambooHR, SAP SuccessFactors, ADP</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {hrIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-medium">{integration.name}</h3>
                        <p className="text-slate-400 text-sm">{getProviderLabel(integration.provider)}</p>
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${getStatusColor(integration.status)}`}>
                        {getStatusIcon(integration.status)}
                        {integration.status.replace("_", " ")}
                      </span>
                    </div>

                    {integration.description && (
                      <p className="text-slate-400 text-sm mb-3 line-clamp-2">{integration.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                      <span>Last sync: {formatDate(integration.last_sync_at)}</span>
                      {integration.last_sync_status && (
                        <span className={integration.last_sync_status === "completed" ? "text-green-400" : "text-red-400"}>
                          {integration.last_sync_status}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700">
                      <button
                        onClick={() => handleTriggerHRSync(integration.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                      >
                        <Play className="h-4 w-4" />
                        Sync Now
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteHRIntegration(integration.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LMS Integrations Tab */}
        {activeTab === "lms" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">LMS Integrations</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition">
                <Plus className="h-4 w-4" />
                Add Integration
              </button>
            </div>

            {lmsIntegrations.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                <BookOpen className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No LMS Integrations</h3>
                <p className="text-slate-400 mb-4">Connect external learning management systems to sync course completions.</p>
                <p className="text-slate-500 text-sm">Supported: SCORM Cloud, Cornerstone, LinkedIn Learning, Udemy Business, Coursera</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {lmsIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-medium">{integration.name}</h3>
                        <p className="text-slate-400 text-sm">{getProviderLabel(integration.provider)}</p>
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${getStatusColor(integration.status)}`}>
                        {getStatusIcon(integration.status)}
                        {integration.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {integration.scorm_support && (
                        <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">SCORM</span>
                      )}
                      {integration.xapi_support && (
                        <span className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded">xAPI</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                      <span>Last sync: {formatDate(integration.last_sync_at)}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700">
                      <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLMSIntegration(integration.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCORM Packages Tab */}
        {activeTab === "scorm" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">SCORM Packages</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition">
                <Plus className="h-4 w-4" />
                Upload Package
              </button>
            </div>

            {scormPackages.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                <Package className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No SCORM Packages</h3>
                <p className="text-slate-400 mb-4">Upload SCORM packages to deliver standardized e-learning content.</p>
                <p className="text-slate-500 text-sm">Supported: SCORM 1.2, SCORM 2004 (2nd, 3rd, 4th editions)</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scormPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-medium line-clamp-1">{pkg.title}</h3>
                        <p className="text-slate-400 text-xs">{pkg.version}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded border ${pkg.is_active ? "bg-green-900/50 text-green-400 border-green-700" : "bg-slate-700 text-slate-400 border-slate-600"}`}>
                        {pkg.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {pkg.description && (
                      <p className="text-slate-400 text-sm mb-3 line-clamp-2">{pkg.description}</p>
                    )}

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                        <div className="text-lg font-bold text-white">{pkg.total_enrollments}</div>
                        <div className="text-xs text-slate-400">Enrolled</div>
                      </div>
                      <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                        <div className="text-lg font-bold text-green-400">{pkg.completed_count}</div>
                        <div className="text-xs text-slate-400">Completed</div>
                      </div>
                      <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                        <div className="text-lg font-bold text-blue-400">
                          {pkg.average_score !== null ? `${(pkg.average_score).toFixed(0)}%` : "-"}
                        </div>
                        <div className="text-xs text-slate-400">Avg Score</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700">
                      {pkg.launch_url && (
                        <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition">
                          <ExternalLink className="h-4 w-4" />
                          Launch
                        </button>
                      )}
                      <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSCORMPackage(pkg.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Calendar Tab */}
        {activeTab === "calendar" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Calendar Integrations</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition">
                <Plus className="h-4 w-4" />
                Connect Calendar
              </button>
            </div>

            {calendarIntegrations.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                <Calendar className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Calendar Integrations</h3>
                <p className="text-slate-400 mb-4">Connect your calendar to sync learning events and deadlines.</p>
                <p className="text-slate-500 text-sm">Supported: Google Calendar, Outlook, Apple Calendar</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {calendarIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-medium">{getProviderLabel(integration.provider)}</h3>
                        {integration.calendar_id && (
                          <p className="text-slate-400 text-sm truncate">{integration.calendar_id}</p>
                        )}
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${getStatusColor(integration.status)}`}>
                        {getStatusIcon(integration.status)}
                        {integration.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {integration.sync_learning_sessions && (
                        <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">Sessions</span>
                      )}
                      {integration.sync_deadlines && (
                        <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-400 rounded">Deadlines</span>
                      )}
                      {integration.sync_certifications && (
                        <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">Certifications</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                      <span>Last sync: {formatDate(integration.last_sync_at)}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700">
                      <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCalendarIntegration(integration.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
