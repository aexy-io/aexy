"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { uptimeApi, UptimeMonitor, UptimeIncident, WorkspaceUptimeStats } from "@/lib/uptime-api";
import Link from "next/link";
import {
  MonitorCheck,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ChevronRight,
  Pause,
  Globe,
  Server,
  Wifi,
} from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  up: { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-500" },
  down: { bg: "bg-red-900/30", text: "text-red-400", dot: "bg-red-500" },
  degraded: { bg: "bg-amber-900/30", text: "text-amber-400", dot: "bg-amber-500" },
  paused: { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500" },
  unknown: { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500" },
};

const DEFAULT_STATUS_STYLE = { bg: "bg-slate-700/50", text: "text-slate-400", dot: "bg-slate-500" };

const CHECK_TYPE_ICONS = {
  http: Globe,
  tcp: Server,
  websocket: Wifi,
};

export default function UptimeDashboard() {
  const { currentWorkspace } = useWorkspace();
  const [monitors, setMonitors] = useState<UptimeMonitor[]>([]);
  const [incidents, setIncidents] = useState<UptimeIncident[]>([]);
  const [stats, setStats] = useState<WorkspaceUptimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadData();
    }
  }, [currentWorkspace?.id]);

  const loadData = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const [monitorsData, incidentsData, statsData] = await Promise.all([
        uptimeApi.monitors.list(currentWorkspace.id),
        uptimeApi.incidents.list(currentWorkspace.id, { status: "ongoing", limit: 5 }),
        uptimeApi.stats.getWorkspaceStats(currentWorkspace.id),
      ]);

      setMonitors(monitorsData?.monitors || []);
      setIncidents(incidentsData?.incidents || []);
      setStats(statsData || null);
    } catch (error) {
      console.error("Failed to load uptime data:", error);
      setMonitors([]);
      setIncidents([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <MonitorCheck className="h-7 w-7 text-emerald-400" />
              Uptime Monitoring
            </h1>
            <p className="text-slate-400 mt-1">
              Monitor your endpoints and track incidents
            </p>
          </div>
          <Link
            href="/uptime/monitors?create=true"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium"
          >
            <Plus className="h-4 w-4" />
            New Monitor
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-900/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.monitors_up}</p>
                  <p className="text-sm text-slate-400">Monitors Up</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-900/30">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.monitors_down}</p>
                  <p className="text-sm text-slate-400">Monitors Down</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-900/30">
                  <Activity className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.ongoing_incidents}</p>
                  <p className="text-sm text-slate-400">Active Incidents</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-900/30">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.incidents_24h}</p>
                  <p className="text-sm text-slate-400">Incidents (24h)</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-900/30">
                  <MonitorCheck className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {stats.avg_uptime_24h != null ? `${stats.avg_uptime_24h.toFixed(1)}%` : "-"}
                  </p>
                  <p className="text-sm text-slate-400">Avg Uptime (24h)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monitors */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Monitors</h2>
                <Link
                  href="/uptime/monitors"
                  className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  View all <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {monitors.length === 0 ? (
                <div className="p-8 text-center">
                  <MonitorCheck className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No monitors yet</h3>
                  <p className="text-slate-400 mb-4">
                    Create your first monitor to start tracking uptime
                  </p>
                  <Link
                    href="/uptime/monitors?create=true"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Create Monitor
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {monitors.slice(0, 8).map((monitor) => {
                    const Icon = CHECK_TYPE_ICONS[monitor.check_type] || Globe;
                    const statusStyle = STATUS_COLORS[monitor.current_status] || DEFAULT_STATUS_STYLE;

                    return (
                      <Link
                        key={monitor.id}
                        href={`/uptime/monitors/${monitor.id}`}
                        className="p-4 flex items-center gap-4 hover:bg-slate-700/50 transition"
                      >
                        <div className={`w-3 h-3 rounded-full ${statusStyle.dot} ${monitor.current_status === "down" ? "animate-pulse" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{monitor.name}</div>
                          <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                            <Icon className="h-3.5 w-3.5" />
                            <span className="uppercase text-xs">{monitor.check_type}</span>
                            {monitor.url && (
                              <span className="truncate max-w-[200px]">{monitor.url}</span>
                            )}
                            {monitor.host && (
                              <span>{monitor.host}:{monitor.port}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-medium ${statusStyle.text}`}>
                            {monitor.uptime_percentage_24h != null
                              ? `${monitor.uptime_percentage_24h.toFixed(1)}%`
                              : "-"}
                          </span>
                          {monitor.last_response_time_ms != null && (
                            <p className="text-xs text-slate-500">{monitor.last_response_time_ms}ms</p>
                          )}
                        </div>
                        {!monitor.is_active && (
                          <Pause className="h-4 w-4 text-slate-500" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active Incidents */}
          <div>
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Active Incidents</h2>
                <Link
                  href="/uptime/incidents"
                  className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  View all <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {incidents.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-slate-400">All systems operational</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {incidents.map((incident) => (
                    <Link
                      key={incident.id}
                      href={`/uptime/incidents/${incident.id}`}
                      className="p-4 block hover:bg-slate-700/50 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500 mt-2 animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">
                            {incident.monitor?.name || "Unknown Monitor"}
                          </div>
                          <p className="text-sm text-slate-400 truncate">
                            {incident.last_error_message || incident.first_error_message}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <Clock className="h-3 w-3" />
                            <span>Duration: {formatDuration(incident.started_at)}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="mt-4 bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Quick Links</h3>
              <div className="space-y-2">
                <Link
                  href="/uptime/monitors"
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition"
                >
                  <MonitorCheck className="h-4 w-4" />
                  All Monitors
                </Link>
                <Link
                  href="/uptime/incidents"
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Incident History
                </Link>
                <Link
                  href="/uptime/history"
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition"
                >
                  <Activity className="h-4 w-4" />
                  Check History
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
