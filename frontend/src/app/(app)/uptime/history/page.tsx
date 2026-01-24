"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { uptimeApi, UptimeMonitor, UptimeCheck } from "@/lib/uptime-api";
import Link from "next/link";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Server,
  Wifi,
  ChevronDown,
  Activity,
  AlertTriangle,
} from "lucide-react";

const CHECK_TYPE_ICONS = {
  http: Globe,
  tcp: Server,
  websocket: Wifi,
};

export default function HistoryPage() {
  const { currentWorkspace } = useWorkspace();
  const [monitors, setMonitors] = useState<UptimeMonitor[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [checks, setChecks] = useState<UptimeCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChecks, setLoadingChecks] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadMonitors();
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (selectedMonitorId && currentWorkspace?.id) {
      loadChecks();
    }
  }, [selectedMonitorId, currentWorkspace?.id]);

  const loadMonitors = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await uptimeApi.monitors.list(currentWorkspace.id);
      setMonitors(data.monitors);
      if (data.monitors.length > 0 && !selectedMonitorId) {
        setSelectedMonitorId(data.monitors[0].id);
      }
    } catch (error) {
      console.error("Failed to load monitors:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadChecks = async () => {
    if (!currentWorkspace?.id || !selectedMonitorId) return;

    setLoadingChecks(true);
    try {
      const data = await uptimeApi.monitors.getChecks(currentWorkspace.id, selectedMonitorId, {
        limit: 100,
      });
      setChecks(data.checks);
    } catch (error) {
      console.error("Failed to load checks:", error);
    } finally {
      setLoadingChecks(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId);

  // Calculate stats for selected monitor
  const successfulChecks = checks.filter((c) => c.is_up).length;
  const failedChecks = checks.filter((c) => !c.is_up).length;
  const avgResponseTime =
    checks.length > 0
      ? Math.round(
          checks.filter((c) => c.response_time_ms != null).reduce((sum, c) => sum + (c.response_time_ms || 0), 0) /
            checks.filter((c) => c.response_time_ms != null).length
        )
      : null;

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <History className="h-7 w-7 text-blue-400" />
              Check History
            </h1>
            <p className="text-slate-400 mt-1">View individual check results for your monitors</p>
          </div>
        </div>

        {monitors.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
            <Activity className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No monitors configured yet.</p>
            <Link
              href="/uptime/monitors?create=true"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
            >
              Create Your First Monitor
            </Link>
          </div>
        ) : (
          <>
            {/* Monitor Selector */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-slate-300">Select Monitor:</label>
                <div className="relative flex-1 max-w-md">
                  <select
                    value={selectedMonitorId || ""}
                    onChange={(e) => setSelectedMonitorId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {monitors.map((monitor) => {
                      const Icon = CHECK_TYPE_ICONS[monitor.check_type] || Globe;
                      return (
                        <option key={monitor.id} value={monitor.id}>
                          [{monitor.check_type.toUpperCase()}] {monitor.name}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Stats for Selected Monitor */}
            {selectedMonitor && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-900/30">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{successfulChecks}</p>
                      <p className="text-sm text-slate-400">Successful</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-900/30">
                      <XCircle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{failedChecks}</p>
                      <p className="text-sm text-slate-400">Failed</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-900/30">
                      <Clock className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">
                        {avgResponseTime != null ? `${avgResponseTime}ms` : "-"}
                      </p>
                      <p className="text-sm text-slate-400">Avg Response</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-900/30">
                      <Activity className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">
                        {checks.length > 0
                          ? `${((successfulChecks / checks.length) * 100).toFixed(1)}%`
                          : "-"}
                      </p>
                      <p className="text-sm text-slate-400">Success Rate</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Checks Table */}
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Recent Checks</h2>
              </div>

              {loadingChecks ? (
                <div className="p-8 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
                </div>
              ) : checks.length === 0 ? (
                <div className="p-8 text-center">
                  <Clock className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No checks recorded yet for this monitor.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Checked At
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Response Time
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Status Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          SSL Expiry
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Error
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {checks.map((check) => (
                        <tr key={check.id} className="hover:bg-slate-700/50 transition">
                          <td className="px-4 py-3">
                            {check.is_up ? (
                              <span className="flex items-center gap-2 text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                                Up
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 text-red-400">
                                <XCircle className="h-4 w-4" />
                                Down
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {formatDate(check.checked_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {check.response_time_ms != null ? `${check.response_time_ms}ms` : "-"}
                          </td>
                          <td className="px-4 py-3">
                            {check.status_code != null ? (
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  check.status_code >= 200 && check.status_code < 300
                                    ? "bg-emerald-900/30 text-emerald-400"
                                    : check.status_code >= 400
                                    ? "bg-red-900/30 text-red-400"
                                    : "bg-amber-900/30 text-amber-400"
                                }`}
                              >
                                {check.status_code}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {check.ssl_expiry_days != null ? (
                              <span
                                className={`${
                                  check.ssl_expiry_days <= 7
                                    ? "text-red-400"
                                    : check.ssl_expiry_days <= 30
                                    ? "text-amber-400"
                                    : "text-slate-300"
                                }`}
                              >
                                {check.ssl_expiry_days}d
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {check.error_message ? (
                              <div className="flex items-start gap-2 max-w-xs">
                                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                                <span className="text-sm text-red-400 truncate" title={check.error_message}>
                                  {check.error_type && (
                                    <span className="font-medium">[{check.error_type}] </span>
                                  )}
                                  {check.error_message}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
