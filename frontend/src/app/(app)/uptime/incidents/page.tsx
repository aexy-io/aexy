"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { uptimeApi, UptimeIncident, UptimeIncidentStatus } from "@/lib/uptime-api";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  Eye,
  MessageSquare,
} from "lucide-react";

const STATUS_COLORS: Record<UptimeIncidentStatus, { bg: string; text: string; dot: string; label: string }> = {
  ongoing: { bg: "bg-red-900/30", text: "text-red-400", dot: "bg-red-500", label: "Ongoing" },
  acknowledged: { bg: "bg-amber-900/30", text: "text-amber-400", dot: "bg-amber-500", label: "Acknowledged" },
  resolved: { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-500", label: "Resolved" },
};

export default function IncidentsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [incidents, setIncidents] = useState<UptimeIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<UptimeIncidentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadIncidents();
    }
  }, [currentWorkspace?.id, statusFilter]);

  const loadIncidents = async () => {
    if (!currentWorkspace?.id) return;

    setLoading(true);
    try {
      const data = await uptimeApi.incidents.list(currentWorkspace.id, {
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 50,
      });
      setIncidents(data?.incidents || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error("Failed to load incidents:", error);
      setIncidents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (incidentId: string) => {
    if (!currentWorkspace?.id) return;
    try {
      await uptimeApi.incidents.acknowledge(currentWorkspace.id, incidentId);
      loadIncidents();
    } catch (error) {
      console.error("Failed to acknowledge incident:", error);
    }
  };

  const handleResolve = async (incidentId: string) => {
    if (!currentWorkspace?.id) return;
    const notes = prompt("Resolution notes (optional):");
    try {
      await uptimeApi.incidents.resolve(currentWorkspace.id, incidentId, notes || undefined);
      loadIncidents();
    } catch (error) {
      console.error("Failed to resolve incident:", error);
    }
  };

  const formatDuration = (startedAt: string, resolvedAt?: string | null) => {
    const start = new Date(startedAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ${diffMins % 60}m`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
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

  const filteredIncidents = incidents.filter((incident) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      incident.monitor?.name?.toLowerCase().includes(query) ||
      incident.first_error_message?.toLowerCase().includes(query) ||
      incident.last_error_message?.toLowerCase().includes(query)
    );
  });

  if (loading && incidents.length === 0) {
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
              <AlertTriangle className="h-7 w-7 text-amber-400" />
              Incidents
            </h1>
            <p className="text-slate-400 mt-1">
              {total} incident{total !== 1 ? "s" : ""} total
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {incidents.filter((i) => i.status === "ongoing").length}
                </p>
                <p className="text-sm text-slate-400">Ongoing</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-900/30">
                <Eye className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {incidents.filter((i) => i.status === "acknowledged").length}
                </p>
                <p className="text-sm text-slate-400">Acknowledged</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-900/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {incidents.filter((i) => i.status === "resolved").length}
                </p>
                <p className="text-sm text-slate-400">Resolved</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search incidents..."
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
                {(Object.keys(STATUS_COLORS) as UptimeIncidentStatus[]).map((status) => (
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

        {/* Incidents List */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-slate-400">
                {incidents.length === 0 ? "No incidents recorded yet." : "No incidents match your filters."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredIncidents.map((incident) => {
                const statusStyle = STATUS_COLORS[incident.status];

                return (
                  <div key={incident.id} className="p-4 hover:bg-slate-700/50 transition">
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-3 h-3 rounded-full mt-1.5 ${statusStyle.dot} ${
                          incident.status === "ongoing" ? "animate-pulse" : ""
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/uptime/monitors/${incident.monitor_id}`}
                            className="font-medium text-white hover:text-emerald-400 transition"
                          >
                            {incident.monitor?.name || "Unknown Monitor"}
                          </Link>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                          >
                            {statusStyle.label}
                          </span>
                          {incident.ticket_id && (
                            <Link
                              href={`/tickets/${incident.ticket_id}`}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-purple-900/30 text-purple-400 flex items-center gap-1 hover:bg-purple-900/50 transition"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ticket
                            </Link>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 mb-2">
                          {incident.last_error_message || incident.first_error_message || "No error message"}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Started: {formatDate(incident.started_at)}
                          </span>
                          <span>
                            Duration: {formatDuration(incident.started_at, incident.resolved_at)}
                          </span>
                          <span>
                            Checks: {incident.failed_checks}/{incident.total_checks}
                          </span>
                        </div>
                        {incident.resolution_notes && (
                          <div className="mt-2 p-2 bg-slate-900/50 rounded text-sm text-slate-400 flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{incident.resolution_notes}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {incident.status === "ongoing" && (
                          <>
                            <button
                              onClick={() => handleAcknowledge(incident.id)}
                              className="px-3 py-1.5 text-sm bg-amber-600/20 text-amber-400 rounded-lg hover:bg-amber-600/30 transition"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => handleResolve(incident.id)}
                              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                        {incident.status === "acknowledged" && (
                          <button
                            onClick={() => handleResolve(incident.id)}
                            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                          >
                            Resolve
                          </button>
                        )}
                        <Link
                          href={`/uptime/incidents/${incident.id}`}
                          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
