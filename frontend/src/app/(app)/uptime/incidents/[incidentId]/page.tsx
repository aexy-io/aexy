"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { uptimeApi, UptimeIncident } from "@/lib/uptime-api";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ExternalLink,
  Eye,
  Globe,
  Server,
  Wifi,
} from "lucide-react";

const CHECK_TYPE_ICONS = {
  http: Globe,
  tcp: Server,
  websocket: Wifi,
};

const STATUS_COLORS = {
  ongoing: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", label: "Ongoing" },
  acknowledged: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400", label: "Acknowledged" },
  resolved: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400", label: "Resolved" },
};

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const incidentId = params.incidentId as string;

  const [incident, setIncident] = useState<UptimeIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id && incidentId) {
      loadIncident();
    }
  }, [currentWorkspace?.id, incidentId]);

  const loadIncident = async () => {
    if (!currentWorkspace?.id || !incidentId) return;

    try {
      const data = await uptimeApi.incidents.get(currentWorkspace.id, incidentId);
      setIncident(data || null);
      setResolutionNotes(data?.resolution_notes || "");
      setRootCause(data?.root_cause || "");
    } catch (error) {
      console.error("Failed to load incident:", error);
      setIncident(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!currentWorkspace?.id || !incidentId) return;
    try {
      await uptimeApi.incidents.acknowledge(currentWorkspace.id, incidentId);
      loadIncident();
    } catch (error) {
      console.error("Failed to acknowledge incident:", error);
    }
  };

  const handleResolve = async () => {
    if (!currentWorkspace?.id || !incidentId) return;
    try {
      await uptimeApi.incidents.resolve(currentWorkspace.id, incidentId, resolutionNotes || undefined);
      loadIncident();
    } catch (error) {
      console.error("Failed to resolve incident:", error);
    }
  };

  const handleSaveNotes = async () => {
    if (!currentWorkspace?.id || !incidentId) return;
    setSaving(true);
    try {
      await uptimeApi.incidents.update(currentWorkspace.id, incidentId, {
        root_cause: rootCause || undefined,
        resolution_notes: resolutionNotes || undefined,
      });
      loadIncident();
    } catch (error) {
      console.error("Failed to save notes:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (startedAt: string, resolvedAt?: string | null) => {
    const start = new Date(startedAt);
    const end = resolvedAt ? new Date(resolvedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ${diffMins % 60}m`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    if (diffMins > 0) return `${diffMins}m ${diffSecs % 60}s`;
    return `${diffSecs}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen bg-background p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <p className="text-foreground">Incident not found.</p>
        <Link href="/uptime/incidents" className="text-emerald-400 hover:underline mt-2 inline-block">
          Back to Incidents
        </Link>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[incident.status];
  const Icon = incident.monitor ? CHECK_TYPE_ICONS[incident.monitor.check_type] : Globe;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/uptime/incidents"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
                {incident.ticket_id && (
                  <Link
                    href={`/tickets/${incident.ticket_id}`}
                    className="px-3 py-1 rounded-full text-sm font-medium bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Ticket
                  </Link>
                )}
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Incident for {incident.monitor?.name || "Unknown Monitor"}
              </h1>
              {incident.monitor && (
                <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="uppercase text-xs">{incident.monitor.check_type}</span>
                  {incident.monitor.url && <span>{incident.monitor.url}</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {incident.status === "ongoing" && (
                <>
                  <button
                    onClick={handleAcknowledge}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 rounded-lg hover:bg-amber-600/30 transition"
                  >
                    <Eye className="h-4 w-4" />
                    Acknowledge
                  </button>
                  <button
                    onClick={handleResolve}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Resolve
                  </button>
                </>
              )}
              {incident.status === "acknowledged" && (
                <button
                  onClick={handleResolve}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Resolve
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-muted rounded-xl border border-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timeline
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5" />
              <div>
                <p className="text-foreground font-medium">Incident Started</p>
                <p className="text-sm text-muted-foreground">{formatDate(incident.started_at)}</p>
              </div>
            </div>

            {incident.acknowledged_at && (
              <div className="flex items-start gap-4">
                <div className="w-3 h-3 rounded-full bg-amber-500 mt-1.5" />
                <div>
                  <p className="text-foreground font-medium">Acknowledged</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(incident.acknowledged_at)}
                    {incident.acknowledged_by && (
                      <span> by {incident.acknowledged_by.name || incident.acknowledged_by.email}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {incident.resolved_at ? (
              <div className="flex items-start gap-4">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5" />
                <div>
                  <p className="text-foreground font-medium">Resolved</p>
                  <p className="text-sm text-muted-foreground">{formatDate(incident.resolved_at)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse mt-1.5" />
                <div>
                  <p className="text-foreground font-medium">Ongoing</p>
                  <p className="text-sm text-muted-foreground">Duration: {formatDuration(incident.started_at)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {formatDuration(incident.started_at, incident.resolved_at)}
                </p>
                <p className="text-sm text-muted-foreground">Total Duration</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{incident.total_checks}</p>
                <p className="text-sm text-muted-foreground">Total Checks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{incident.failed_checks}</p>
                <p className="text-sm text-muted-foreground">Failed Checks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Details */}
        <div className="bg-muted rounded-xl border border-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Error Details
          </h2>
          <div className="space-y-4">
            {incident.first_error_message && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">First Error</p>
                <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-mono">
                  {incident.first_error_message}
                </p>
              </div>
            )}
            {incident.last_error_message && incident.last_error_message !== incident.first_error_message && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Last Error</p>
                <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-mono">
                  {incident.last_error_message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-muted rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Post-Mortem Notes
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Root Cause</label>
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="What caused this incident?"
                className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Resolution Notes</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="How was this incident resolved?"
                className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={3}
              />
            </div>
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Notes"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
