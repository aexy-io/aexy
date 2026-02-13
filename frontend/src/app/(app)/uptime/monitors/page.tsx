"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  uptimeApi,
  UptimeMonitor,
  UptimeMonitorCreate,
  UptimeMonitorStatus,
  UptimeCheckType,
} from "@/lib/uptime-api";
import {
  MonitorCheck,
  Plus,
  Search,
  Filter,
  Globe,
  Server,
  Wifi,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Settings,
  ExternalLink,
  X,
  AlertTriangle,
} from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  up: { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-500", label: "Up" },
  down: { bg: "bg-red-900/30", text: "text-red-400", dot: "bg-red-500", label: "Down" },
  degraded: { bg: "bg-amber-900/30", text: "text-amber-400", dot: "bg-amber-500", label: "Degraded" },
  paused: { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500", label: "Paused" },
  unknown: { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500", label: "Unknown" },
};

const DEFAULT_STATUS_STYLE = { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500", label: "Unknown" };

const CHECK_TYPE_ICONS: Record<UptimeCheckType, typeof Globe> = {
  http: Globe,
  tcp: Server,
  websocket: Wifi,
};

const INTERVALS = [
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
];

export default function MonitorsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const [monitors, setMonitors] = useState<UptimeMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UptimeMonitorStatus | "all">("all");
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get("create") === "true");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Create form state
  const [formData, setFormData] = useState<Partial<UptimeMonitorCreate>>({
    name: "",
    check_type: "http",
    url: "",
    host: "",
    port: 80,
    http_method: "GET",
    expected_status_codes: [200, 201, 204],
    verify_ssl: true,
    follow_redirects: true,
    check_interval_seconds: 300,
    timeout_seconds: 30,
    consecutive_failures_threshold: 3,
    notification_channels: [],
    notify_on_recovery: true,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadMonitors();
    }
  }, [currentWorkspace?.id]);

  const loadMonitors = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await uptimeApi.monitors.list(currentWorkspace.id);
      setMonitors(data?.monitors || []);
    } catch (error) {
      console.error("Failed to load monitors:", error);
      setMonitors([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace?.id) return;

    setCreating(true);
    setCreateError(null);

    try {
      const createData: UptimeMonitorCreate = {
        name: formData.name!,
        check_type: formData.check_type!,
        ...(formData.check_type === "http" || formData.check_type === "websocket"
          ? { url: formData.url }
          : { host: formData.host, port: formData.port }),
        http_method: formData.http_method,
        expected_status_codes: formData.expected_status_codes,
        verify_ssl: formData.verify_ssl,
        follow_redirects: formData.follow_redirects,
        check_interval_seconds: formData.check_interval_seconds,
        timeout_seconds: formData.timeout_seconds,
        consecutive_failures_threshold: formData.consecutive_failures_threshold,
        notification_channels: formData.notification_channels,
        notify_on_recovery: formData.notify_on_recovery,
      };

      await uptimeApi.monitors.create(currentWorkspace.id, createData);
      setShowCreateModal(false);
      loadMonitors();
      // Reset form
      setFormData({
        name: "",
        check_type: "http",
        url: "",
        host: "",
        port: 80,
        http_method: "GET",
        expected_status_codes: [200, 201, 204],
        verify_ssl: true,
        follow_redirects: true,
        check_interval_seconds: 300,
        timeout_seconds: 30,
        consecutive_failures_threshold: 3,
        notification_channels: [],
        notify_on_recovery: true,
      });
    } catch (error: any) {
      setCreateError(error.response?.data?.detail || "Failed to create monitor");
    } finally {
      setCreating(false);
    }
  };

  const handlePause = async (monitorId: string) => {
    if (!currentWorkspace?.id) return;
    try {
      await uptimeApi.monitors.pause(currentWorkspace.id, monitorId);
      loadMonitors();
    } catch (error) {
      console.error("Failed to pause monitor:", error);
    }
    setMenuOpen(null);
  };

  const handleResume = async (monitorId: string) => {
    if (!currentWorkspace?.id) return;
    try {
      await uptimeApi.monitors.resume(currentWorkspace.id, monitorId);
      loadMonitors();
    } catch (error) {
      console.error("Failed to resume monitor:", error);
    }
    setMenuOpen(null);
  };

  const handleDelete = async (monitorId: string) => {
    if (!currentWorkspace?.id) return;
    if (!confirm("Are you sure you want to delete this monitor?")) return;

    try {
      await uptimeApi.monitors.delete(currentWorkspace.id, monitorId);
      loadMonitors();
    } catch (error) {
      console.error("Failed to delete monitor:", error);
    }
    setMenuOpen(null);
  };

  const filteredMonitors = monitors.filter((monitor) => {
    const matchesSearch =
      !searchQuery ||
      monitor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      monitor.url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      monitor.host?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || monitor.current_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <MonitorCheck className="h-7 w-7 text-emerald-400" />
              Monitors
            </h1>
            <p className="text-slate-400 mt-1">
              {monitors.length} monitor{monitors.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium"
          >
            <Plus className="h-4 w-4" />
            New Monitor
          </button>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search monitors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-400">Status:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    statusFilter === "all"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  }`}
                >
                  All
                </button>
                {(Object.keys(STATUS_COLORS) as UptimeMonitorStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      statusFilter === status
                        ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                  >
                    {STATUS_COLORS[status].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Monitor List */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          {filteredMonitors.length === 0 ? (
            <div className="p-8 text-center">
              <MonitorCheck className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                {monitors.length === 0
                  ? "No monitors yet. Create your first monitor to start tracking uptime."
                  : "No monitors match your filters."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredMonitors.map((monitor) => {
                const Icon = CHECK_TYPE_ICONS[monitor.check_type] || Globe;
                const statusStyle = STATUS_COLORS[monitor.current_status] || DEFAULT_STATUS_STYLE;

                return (
                  <div
                    key={monitor.id}
                    className="p-4 flex items-center gap-4 hover:bg-slate-700/50 transition"
                  >
                    <div
                      className={`w-3 h-3 rounded-full ${statusStyle.dot} ${
                        monitor.current_status === "down" ? "animate-pulse" : ""
                      }`}
                    />
                    <button
                      onClick={() => router.push(`/uptime/monitors/${monitor.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-medium text-white truncate">{monitor.name}</div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="uppercase text-xs">{monitor.check_type}</span>
                        {monitor.url && (
                          <span className="truncate max-w-[300px]">{monitor.url}</span>
                        )}
                        {monitor.host && (
                          <span>
                            {monitor.host}:{monitor.port}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="text-center px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <span className="text-sm font-medium text-white">
                        {monitor.uptime_percentage_24h != null
                          ? `${monitor.uptime_percentage_24h.toFixed(2)}%`
                          : "-"}
                      </span>
                      <p className="text-xs text-slate-500">24h uptime</p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <span className="text-sm font-medium text-white">
                        {monitor.last_response_time_ms != null ? `${monitor.last_response_time_ms}ms` : "-"}
                      </span>
                      <p className="text-xs text-slate-500">Response</p>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === monitor.id ? null : monitor.id)}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuOpen === monitor.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10">
                          <button
                            onClick={() => router.push(`/uptime/monitors/${monitor.id}`)}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Settings className="h-4 w-4" />
                            View Details
                          </button>
                          {monitor.url && (
                            <a
                              href={monitor.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Open URL
                            </a>
                          )}
                          {monitor.is_active ? (
                            <button
                              onClick={() => handlePause(monitor.id)}
                              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Pause className="h-4 w-4" />
                              Pause Monitoring
                            </button>
                          ) : (
                            <button
                              onClick={() => handleResume(monitor.id)}
                              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                            >
                              <Play className="h-4 w-4" />
                              Resume Monitoring
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(monitor.id)}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Create Monitor</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateMonitor} className="p-4 space-y-4">
                {createError && (
                  <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My API Monitor"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Check Type</label>
                  <div className="flex gap-2">
                    {(["http", "tcp", "websocket"] as UptimeCheckType[]).map((type) => {
                      const Icon = CHECK_TYPE_ICONS[type];
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({ ...formData, check_type: type })}
                          className={`flex-1 p-3 rounded-lg border flex flex-col items-center gap-1 transition ${
                            formData.check_type === type
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                              : "border-slate-700 text-slate-400 hover:border-slate-600"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs uppercase">{type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(formData.check_type === "http" || formData.check_type === "websocket") && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">URL</label>
                    <input
                      type="url"
                      required
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder={
                        formData.check_type === "websocket"
                          ? "wss://example.com/socket"
                          : "https://api.example.com/health"
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                {formData.check_type === "tcp" && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-1">Host</label>
                      <input
                        type="text"
                        required
                        value={formData.host}
                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                        placeholder="db.example.com"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                      <input
                        type="number"
                        required
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                        placeholder="5432"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {formData.check_type === "http" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">HTTP Method</label>
                    <select
                      value={formData.http_method}
                      onChange={(e) => setFormData({ ...formData, http_method: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="HEAD">HEAD</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Check Interval</label>
                  <select
                    value={formData.check_interval_seconds}
                    onChange={(e) =>
                      setFormData({ ...formData, check_interval_seconds: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {INTERVALS.map((interval) => (
                      <option key={interval.value} value={interval.value}>
                        {interval.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Failures before alert
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.consecutive_failures_threshold}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        consecutive_failures_threshold: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Number of consecutive failures before creating an incident
                  </p>
                </div>

                {formData.check_type === "http" && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.verify_ssl}
                        onChange={(e) => setFormData({ ...formData, verify_ssl: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      Verify SSL
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.follow_redirects}
                        onChange={(e) => setFormData({ ...formData, follow_redirects: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      Follow Redirects
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.notify_on_recovery}
                    onChange={(e) => setFormData({ ...formData, notify_on_recovery: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  Notify on recovery
                </label>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-slate-300 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {creating && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    )}
                    Create Monitor
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
