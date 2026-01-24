"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { uptimeApi, UptimeMonitor, UptimeCheck, MonitorStats, UptimeIncident } from "@/lib/uptime-api";
import Link from "next/link";
import {
  ArrowLeft,
  MonitorCheck,
  Globe,
  Server,
  Wifi,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  RefreshCw,
  Settings,
} from "lucide-react";

const CHECK_TYPE_ICONS = {
  http: Globe,
  tcp: Server,
  websocket: Wifi,
};

const STATUS_COLORS = {
  up: { bg: "bg-emerald-900/30", text: "text-emerald-400", label: "Up" },
  down: { bg: "bg-red-900/30", text: "text-red-400", label: "Down" },
  degraded: { bg: "bg-amber-900/30", text: "text-amber-400", label: "Degraded" },
  paused: { bg: "bg-slate-700/50", text: "text-slate-400", label: "Paused" },
};

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const monitorId = params.monitorId as string;

  const [monitor, setMonitor] = useState<UptimeMonitor | null>(null);
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [checks, setChecks] = useState<UptimeCheck[]>([]);
  const [incidents, setIncidents] = useState<UptimeIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<UptimeCheck | null>(null);

  useEffect(() => {
    if (currentWorkspace?.id && monitorId) {
      loadData();
    }
  }, [currentWorkspace?.id, monitorId]);

  const loadData = async () => {
    if (!currentWorkspace?.id || !monitorId) return;

    try {
      const [monitorData, statsData, checksData, incidentsData] = await Promise.all([
        uptimeApi.monitors.get(currentWorkspace.id, monitorId),
        uptimeApi.monitors.getStats(currentWorkspace.id, monitorId),
        uptimeApi.monitors.getChecks(currentWorkspace.id, monitorId, { limit: 50 }),
        uptimeApi.incidents.list(currentWorkspace.id, { monitor_id: monitorId, limit: 10 }),
      ]);

      setMonitor(monitorData);
      setStats(statsData);
      setChecks(checksData.checks);
      setIncidents(incidentsData.incidents);
    } catch (error) {
      console.error("Failed to load monitor data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!currentWorkspace?.id || !monitorId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await uptimeApi.monitors.test(currentWorkspace.id, monitorId);
      setTestResult(result);
      loadData(); // Refresh data
    } catch (error) {
      console.error("Failed to run test:", error);
    } finally {
      setTesting(false);
    }
  };

  const handlePause = async () => {
    if (!currentWorkspace?.id || !monitorId) return;
    try {
      await uptimeApi.monitors.pause(currentWorkspace.id, monitorId);
      loadData();
    } catch (error) {
      console.error("Failed to pause monitor:", error);
    }
  };

  const handleResume = async () => {
    if (!currentWorkspace?.id || !monitorId) return;
    try {
      await uptimeApi.monitors.resume(currentWorkspace.id, monitorId);
      loadData();
    } catch (error) {
      console.error("Failed to resume monitor:", error);
    }
  };

  const handleDelete = async () => {
    if (!currentWorkspace?.id || !monitorId) return;
    if (!confirm("Are you sure you want to delete this monitor? This cannot be undone.")) return;

    try {
      await uptimeApi.monitors.delete(currentWorkspace.id, monitorId);
      router.push("/uptime/monitors");
    } catch (error) {
      console.error("Failed to delete monitor:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <p className="text-white">Monitor not found.</p>
        <Link href="/uptime/monitors" className="text-emerald-400 hover:underline mt-2 inline-block">
          Back to Monitors
        </Link>
      </div>
    );
  }

  const Icon = CHECK_TYPE_ICONS[monitor.check_type] || Globe;
  const statusStyle = STATUS_COLORS[monitor.current_status];

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/uptime/monitors"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Monitors
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${statusStyle.bg}`}>
                <Icon className={`h-6 w-6 ${statusStyle.text}`} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  {monitor.name}
                  <span className={`px-2 py-1 rounded text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                    {statusStyle.label}
                  </span>
                </h1>
                <p className="text-slate-400 mt-1 flex items-center gap-2">
                  <span className="uppercase text-xs font-medium">{monitor.check_type}</span>
                  {monitor.url && (
                    <a
                      href={monitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white transition flex items-center gap-1"
                    >
                      {monitor.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {monitor.host && (
                    <span>
                      {monitor.host}:{monitor.port}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition disabled:opacity-50"
              >
                {testing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Test Now
              </button>
              {monitor.is_active ? (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 rounded-lg hover:bg-amber-600/30 transition"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              )}
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`mb-6 p-4 rounded-xl border ${
              testResult.is_up
                ? "bg-emerald-900/20 border-emerald-500/30"
                : "bg-red-900/20 border-red-500/30"
            }`}
          >
            <div className="flex items-center gap-3">
              {testResult.is_up ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <div>
                <p className={testResult.is_up ? "text-emerald-400" : "text-red-400"}>
                  Test {testResult.is_up ? "Passed" : "Failed"}
                  {testResult.response_time_ms && ` - ${testResult.response_time_ms}ms`}
                  {testResult.status_code && ` (HTTP ${testResult.status_code})`}
                </p>
                {testResult.error_message && (
                  <p className="text-red-400 text-sm">{testResult.error_message}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Uptime (24h)</p>
              <p className="text-2xl font-bold text-white">{stats.uptime_percentage_24h.toFixed(2)}%</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Uptime (7d)</p>
              <p className="text-2xl font-bold text-white">{stats.uptime_percentage_7d.toFixed(2)}%</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Uptime (30d)</p>
              <p className="text-2xl font-bold text-white">{stats.uptime_percentage_30d.toFixed(2)}%</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Avg Response (24h)</p>
              <p className="text-2xl font-bold text-white">
                {stats.avg_response_time_24h != null ? `${stats.avg_response_time_24h}ms` : "-"}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Incidents (24h)</p>
              <p className="text-2xl font-bold text-white">{stats.incidents_24h}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm text-slate-400">Total Incidents</p>
              <p className="text-2xl font-bold text-white">{stats.total_incidents}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Checks */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent Checks</h2>
              <Link
                href="/uptime/history"
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                View All
              </Link>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {checks.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No checks recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {checks.slice(0, 15).map((check) => (
                    <div key={check.id} className="p-3 flex items-center gap-3">
                      {check.is_up ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300">{formatDate(check.checked_at)}</p>
                        {check.error_message && (
                          <p className="text-xs text-red-400 truncate">{check.error_message}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {check.response_time_ms != null && (
                          <span className="text-sm text-slate-400">{check.response_time_ms}ms</span>
                        )}
                        {check.status_code && (
                          <span
                            className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                              check.status_code >= 200 && check.status_code < 300
                                ? "bg-emerald-900/30 text-emerald-400"
                                : "bg-red-900/30 text-red-400"
                            }`}
                          >
                            {check.status_code}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Incidents */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent Incidents</h2>
              <Link
                href="/uptime/incidents"
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                View All
              </Link>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {incidents.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No incidents recorded.</div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {incidents.map((incident) => (
                    <Link
                      key={incident.id}
                      href={`/uptime/incidents/${incident.id}`}
                      className="p-4 block hover:bg-slate-700/50 transition"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            incident.status === "ongoing"
                              ? "bg-red-900/30 text-red-400"
                              : incident.status === "acknowledged"
                              ? "bg-amber-900/30 text-amber-400"
                              : "bg-emerald-900/30 text-emerald-400"
                          }`}
                        >
                          {incident.status}
                        </span>
                        <span className="text-xs text-slate-500">{formatDate(incident.started_at)}</span>
                      </div>
                      <p className="text-sm text-slate-400 truncate">
                        {incident.last_error_message || incident.first_error_message || "No details"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="mt-6 bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Check Interval</p>
              <p className="text-white">{monitor.check_interval_seconds}s</p>
            </div>
            <div>
              <p className="text-slate-500">Timeout</p>
              <p className="text-white">{monitor.timeout_seconds}s</p>
            </div>
            <div>
              <p className="text-slate-500">Failure Threshold</p>
              <p className="text-white">{monitor.consecutive_failures_threshold} failures</p>
            </div>
            <div>
              <p className="text-slate-500">Consecutive Failures</p>
              <p className={monitor.consecutive_failures > 0 ? "text-red-400" : "text-white"}>
                {monitor.consecutive_failures}
              </p>
            </div>
            {monitor.check_type === "http" && (
              <>
                <div>
                  <p className="text-slate-500">HTTP Method</p>
                  <p className="text-white">{monitor.http_method}</p>
                </div>
                <div>
                  <p className="text-slate-500">Expected Status Codes</p>
                  <p className="text-white">{monitor.expected_status_codes?.join(", ") || "200"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Verify SSL</p>
                  <p className="text-white">{monitor.verify_ssl ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Follow Redirects</p>
                  <p className="text-white">{monitor.follow_redirects ? "Yes" : "No"}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-slate-500">Notify on Recovery</p>
              <p className="text-white">{monitor.notify_on_recovery ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-slate-500">Notification Channels</p>
              <p className="text-white">
                {monitor.notification_channels?.length > 0
                  ? monitor.notification_channels.join(", ")
                  : "None configured"}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
