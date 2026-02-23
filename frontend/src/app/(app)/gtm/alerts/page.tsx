"use client";

import { useState } from "react";
import { Bell, Plus, Loader2, RefreshCw, Filter } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMAlertConfigs, useGTMAlertLogs } from "@/hooks/useGTM";

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  slack: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  webhook: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  sms: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function AlertsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [logPage, setLogPage] = useState(1);

  const { configs, isLoading: configsLoading, refetch: refetchConfigs } =
    useGTMAlertConfigs(workspaceId);
  const { logs, total: logsTotal, isLoading: logsLoading } =
    useGTMAlertLogs(workspaceId, { page: logPage });

  const isLoading = configsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading alerts...</span>
        </div>
      </div>
    );
  }

  const safeConfigs = configs ?? [];
  const safeLogs = logs ?? [];
  const activeCount = safeConfigs.filter((c: any) => c.is_active).length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="w-7 h-7 text-indigo-400" />
              Alerts & Notifications
            </h1>
            <p className="text-zinc-400 mt-1">
              Configure alert rules and monitor delivery across all channels
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchConfigs()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              New Alert
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Bell className="w-4 h-4" />
              Total Configs
            </div>
            <p className="text-3xl font-bold text-white">
              {safeConfigs.length}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Filter className="w-4 h-4" />
              Active
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              {activeCount}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <RefreshCw className="w-4 h-4" />
              Recent Alerts
            </div>
            <p className="text-3xl font-bold text-white">
              {logsTotal ?? safeLogs.length}
            </p>
          </div>
        </div>

        {/* Alert Configs Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Alert Configurations</h3>
            <span className="text-sm text-zinc-400">{safeConfigs.length} rules</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Name", "Event Type", "Channel", "Status", "Created"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {safeConfigs.map((cfg: any) => (
                  <tr key={cfg.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-zinc-200 font-medium">
                      {cfg.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
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
                            : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {cfg.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
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
            <div className="px-6 py-12 text-center text-zinc-500">
              No alert configurations yet. Create your first alert rule to get started.
            </div>
          )}
        </div>

        {/* Alert Logs Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Alert Logs</h3>
            <span className="text-sm text-zinc-400">{logsTotal ?? safeLogs.length} entries</span>
          </div>
          {logsLoading ? (
            <div className="px-6 py-12 flex items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading logs...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Event Type", "Channel", "Status", "Sent At"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {safeLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
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
                      <td className="px-6 py-4 text-sm text-zinc-500">
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
            <div className="px-6 py-12 text-center text-zinc-500">
              No alert logs yet. Logs will appear here once alerts are triggered.
            </div>
          )}
          {(logsTotal ?? 0) > 25 && (
            <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-sm text-zinc-500">Page {logPage}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  disabled={logPage <= 1}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 text-sm transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setLogPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-400 text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
