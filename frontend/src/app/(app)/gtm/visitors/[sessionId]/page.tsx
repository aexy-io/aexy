"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Globe,
  MapPin,
  Clock,
  Eye,
  MousePointerClick,
  FileText,
  ExternalLink,
  Loader2,
  RefreshCw,
  Link2,
  Fingerprint,
  Activity,
  Shield,
  Hash,
  Wifi,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMVisitorDetail } from "@/hooks/useGTM";
import {
  gtmApi,
  VisitorSessionDetail,
  BehavioralEvent,
  VisitorIdentification,
  IdentificationStatus,
} from "@/lib/api";

function StatusBadge({ status }: { status: IdentificationStatus }) {
  const styles: Record<string, string> = {
    identified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    anonymous: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    resolved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
        styles[status] || styles.anonymous
      }`}
    >
      {status}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventIcon({ eventType }: { eventType: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    page_view: <Eye className="w-4 h-4" />,
    click: <MousePointerClick className="w-4 h-4" />,
    form_submit: <FileText className="w-4 h-4" />,
    scroll: <Activity className="w-4 h-4" />,
    download: <ExternalLink className="w-4 h-4" />,
    identify: <Fingerprint className="w-4 h-4" />,
    session_start: <Globe className="w-4 h-4" />,
    session_end: <Clock className="w-4 h-4" />,
    heartbeat: <Activity className="w-4 h-4" />,
    page_exit: <ExternalLink className="w-4 h-4" />,
  };

  return (
    <div className="flex items-center justify-center w-8 h-8 bg-muted/50 border border-border rounded-full flex-shrink-0">
      {iconMap[eventType] || <Hash className="w-4 h-4" />}
    </div>
  );
}

function EventTimeline({ events }: { events: BehavioralEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No behavioral events recorded.</p>
      </div>
    );
  }

  const sortedEvents = [...events].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  return (
    <div className="space-y-0">
      {sortedEvents.map((event, index) => {
        const isLast = index === sortedEvents.length - 1;
        const properties = event.properties || {};

        return (
          <div key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <EventIcon eventType={event.event_type} />
              {!isLast && (
                <div className="w-px h-full bg-border min-h-[2rem]" />
              )}
            </div>
            <div className="pb-6 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-foreground text-sm font-medium capitalize">
                  {event.event_type.replace(/_/g, " ")}
                </span>
                <span className="text-muted-foreground text-xs flex-shrink-0">
                  {formatTimestamp(event.occurred_at)}
                </span>
              </div>
              {event.page_url && (
                <p className="text-muted-foreground text-sm truncate">
                  {event.page_url}
                </p>
              )}
              {Object.keys(properties).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(properties).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-2 py-0.5 bg-muted/50 border border-border/50 rounded text-xs text-muted-foreground"
                    >
                      <span className="text-muted-foreground">{key}:</span>{" "}
                      <span className="text-muted-foreground ml-1">
                        {String(value)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GTMVisitorDetailPage() {
  const { currentWorkspace } = useWorkspace();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const workspaceId = currentWorkspace?.id || null;

  const { session, isLoading, error, refetch } = useGTMVisitorDetail(
    workspaceId,
    sessionId
  );

  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const detail = session as VisitorSessionDetail | undefined;
  const identification: VisitorIdentification | null =
    detail?.identification ?? null;
  const events: BehavioralEvent[] = detail?.events ?? [];

  async function handleIdentify() {
    if (!workspaceId) return;
    setIsIdentifying(true);
    try {
      await gtmApi.visitors.identify(workspaceId, sessionId);
      refetch();
    } finally {
      setIsIdentifying(false);
    }
  }

  async function handleLinkToCRM() {
    if (!workspaceId || !identification) return;
    setIsLinking(true);
    try {
      await gtmApi.visitors.link(workspaceId, sessionId, {
        record_id: "",
      });
      refetch();
    } finally {
      setIsLinking(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-muted/50 border border-red-500/20 rounded-xl p-8 max-w-md text-center">
          <p className="text-red-400 font-medium mb-2">
            {error ? "Failed to load session" : "Session not found"}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {(error as Error)?.message ||
              "The requested visitor session could not be found."}
          </p>
          <div className="flex items-center gap-3 justify-center">
            <Link
              href="/gtm/visitors"
              className="inline-flex items-center gap-2 px-4 py-2 bg-border hover:bg-muted text-foreground rounded-lg text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Visitors
            </Link>
            {error && (
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-border hover:bg-muted text-foreground rounded-lg text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/gtm/visitors"
              className="flex items-center justify-center w-9 h-9 bg-muted/50 hover:bg-muted border border-border rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Session Detail</h1>
              <p className="text-muted-foreground text-sm font-mono mt-0.5">
                {detail.anonymous_id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleIdentify}
              disabled={
                isIdentifying ||
                detail.identification_status !== "anonymous"
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isIdentifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4" />
              )}
              Identify
            </button>
            <button
              onClick={handleLinkToCRM}
              disabled={isLinking || !identification}
              className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              Link to CRM
            </button>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Session Info + Company */}
          <div className="lg:col-span-1 space-y-6">
            {/* Session Info Card */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-indigo-400" />
                Session Info
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <StatusBadge status={detail.identification_status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Anonymous ID</span>
                  <span className="text-foreground text-sm font-mono truncate max-w-[160px]">
                    {detail.anonymous_id}
                  </span>
                </div>
                {detail.ip_address && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">IP Address</span>
                    <span className="text-foreground text-sm font-mono">
                      {detail.ip_address}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Pages Viewed</span>
                  <span className="text-foreground text-sm">
                    {detail.page_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Duration</span>
                  <span className="text-foreground text-sm">
                    {formatDuration(detail.duration_seconds)}
                  </span>
                </div>
                <div className="border-t border-border/50 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">First Seen</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(detail.started_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Last Seen</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(detail.last_activity_at)}
                    </span>
                  </div>
                </div>
                {detail.first_page_url && (
                  <div className="border-t border-border/50 pt-4">
                    <span className="text-muted-foreground text-sm block mb-1">
                      Entry Page
                    </span>
                    <span className="text-muted-foreground text-xs break-all">
                      {detail.first_page_url}
                    </span>
                  </div>
                )}
                {(detail.utm_source || detail.utm_medium || detail.utm_campaign) && (
                  <div className="border-t border-border/50 pt-4 space-y-2">
                    <span className="text-muted-foreground text-sm block">UTM</span>
                    {detail.utm_source && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Source</span>
                        <span className="text-muted-foreground text-xs">{detail.utm_source}</span>
                      </div>
                    )}
                    {detail.utm_medium && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Medium</span>
                        <span className="text-muted-foreground text-xs">{detail.utm_medium}</span>
                      </div>
                    )}
                    {detail.utm_campaign && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Campaign</span>
                        <span className="text-muted-foreground text-xs">{detail.utm_campaign}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Company Card */}
            {identification && (
              <div className="bg-muted/50 border border-border rounded-xl p-6">
                <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Identified Company
                </h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-foreground font-semibold text-lg">
                      {identification.company_name}
                    </p>
                    {identification.domain && (
                      <a
                        href={`https://${identification.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-sm inline-flex items-center gap-1 transition-colors"
                      >
                        {identification.domain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="space-y-3">
                    {identification.industry && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Industry</span>
                        <span className="text-foreground text-sm">
                          {identification.industry}
                        </span>
                      </div>
                    )}
                    {identification.employee_range && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">
                          Employees
                        </span>
                        <span className="text-foreground text-sm">
                          {identification.employee_range}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border/50 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-muted-foreground text-sm">Confidence</span>
                      <span className="text-emerald-400 text-sm font-medium">
                        {identification.confidence}%
                      </span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${identification.confidence}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-3">
                    <span className="text-muted-foreground text-xs">
                      Provider: {identification.provider_name}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* No identification */}
            {!identification &&
              detail.identification_status === "anonymous" && (
                <div className="bg-muted/50 border border-border rounded-xl p-6 text-center">
                  <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-medium mb-1">
                    Not yet identified
                  </p>
                  <p className="text-muted-foreground text-xs mb-4">
                    Click the Identify button to resolve this visitor to a
                    company.
                  </p>
                  <button
                    onClick={handleIdentify}
                    disabled={isIdentifying}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {isIdentifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    Identify Visitor
                  </button>
                </div>
              )}
          </div>

          {/* Right Column: Event Timeline */}
          <div className="lg:col-span-2">
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Event Timeline
                </h2>
                <span className="text-muted-foreground text-sm">
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </span>
              </div>
              <EventTimeline events={events} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
