"use client";

import { useState } from "react";
import { Bell, Plus, Loader2, RefreshCw, Filter, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMAlertConfigs, useGTMAlertLogs } from "@/hooks/useGTM";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  slack: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  webhook: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  sms: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const EVENT_TYPES = [
  "visitor_identified", "lead_scored", "sequence_reply", "health_decline",
  "competitor_change", "intent_signal", "sla_breach", "handoff_created",
];

export default function AlertsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const queryClient = useQueryClient();

  const [logPage, setLogPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEventType, setFormEventType] = useState(EVENT_TYPES[0]);
  const [formChannel, setFormChannel] = useState("email");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { configs, isLoading: configsLoading, refetch: refetchConfigs } =
    useGTMAlertConfigs(workspaceId);
  const { logs, total: logsTotal, isLoading: logsLoading } =
    useGTMAlertLogs(workspaceId, { page: logPage });

  const isLoading = configsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading alerts...</span>
        </div>
      </div>
    );
  }

  const safeConfigs = configs ?? [];
  const safeLogs = logs ?? [];
  const activeCount = safeConfigs.filter((c: any) => c.is_active).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Bell className="w-7 h-7 text-indigo-400" />
              Alerts & Notifications
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure alert rules and monitor delivery across all channels
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchConfigs()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => { setShowModal(true); setFormName(""); setFormEventType(EVENT_TYPES[0]); setFormChannel("email"); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Alert
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Bell className="w-4 h-4" />
              Total Configs
            </div>
            <p className="text-3xl font-bold text-foreground">
              {safeConfigs.length}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Filter className="w-4 h-4" />
              Active
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              {activeCount}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <RefreshCw className="w-4 h-4" />
              Recent Alerts
            </div>
            <p className="text-3xl font-bold text-foreground">
              {logsTotal ?? safeLogs.length}
            </p>
          </div>
        </div>

        {/* Alert Configs Table */}
        <div className="bg-muted/50 border border-border rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Alert Configurations</h3>
            <span className="text-sm text-muted-foreground">{safeConfigs.length} rules</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  {["Name", "Event Type", "Channel", "Status", "Created"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {safeConfigs.map((cfg: any) => (
                  <tr key={cfg.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground font-medium">
                      {cfg.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                      {cfg.event_type}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          CHANNEL_COLORS[cfg.channel_type] ?? CHANNEL_COLORS.webhook
                        }`}
                      >
                        {cfg.channel_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          cfg.is_active
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
                        }`}
                      >
                        {cfg.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {cfg.created_at
                        ? new Date(cfg.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {safeConfigs.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No alert configurations yet. Create your first alert rule to get started.
            </div>
          )}
        </div>

        {/* Alert Logs Table */}
        <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Alert Logs</h3>
            <span className="text-sm text-muted-foreground">{logsTotal ?? safeLogs.length} entries</span>
          </div>
          {logsLoading ? (
            <div className="px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading logs...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Event Type", "Channel", "Status", "Sent At"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {safeLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                        {log.event_type}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            CHANNEL_COLORS[log.channel_type] ?? CHANNEL_COLORS.webhook
                          }`}
                        >
                          {log.channel_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            DELIVERY_STATUS_COLORS[log.delivery_status] ??
                            DELIVERY_STATUS_COLORS.pending
                          }`}
                        >
                          {log.delivery_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {log.sent_at
                          ? new Date(log.sent_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!logsLoading && safeLogs.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No alert logs yet. Logs will appear here once alerts are triggered.
            </div>
          )}
          {(logsTotal ?? 0) > 25 && (
            <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Page {logPage}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={logPage <= 1}
                  className="px-3 py-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground text-sm transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setLogPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* New Alert Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">New Alert</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. High-value visitor alert" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Event Type</label>
                  <select value={formEventType} onChange={(e) => setFormEventType(e.target.value)} className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Channel</label>
                  <select value={formChannel} onChange={(e) => setFormChannel(e.target.value)} className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                    <option value="email">Email</option>
                    <option value="slack">Slack</option>
                    <option value="webhook">Webhook</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  disabled={!formName.trim() || creating}
                  onClick={async () => {
                    if (!workspaceId || !formName.trim()) return;
                    setCreating(true);
                    setFormError(null);
                    try {
                      await gtmApi.alerts.createConfig(workspaceId, { name: formName.trim(), event_type: formEventType, channel_type: formChannel, is_active: true });
                      queryClient.invalidateQueries({ queryKey: ["gtmAlertConfigs", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to create alert");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Alert
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
