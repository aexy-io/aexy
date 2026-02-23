"use client";

import { useState } from "react";
import { UserCheck, Clock, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMRoutingRules, useGTMSLADashboard } from "@/hooks/useGTM";

const STRATEGY_COLORS: Record<string, string> = {
  round_robin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  load_balanced: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  priority: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  skill_based: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export default function RoutingPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { rules, isLoading: rulesLoading } = useGTMRoutingRules(workspaceId);
  const { dashboard, isLoading: dashLoading } = useGTMSLADashboard(workspaceId);

  const isLoading = rulesLoading || dashLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading routing data...</span>
        </div>
      </div>
    );
  }

  const safeRules = rules ?? [];
  const safeDash = dashboard ?? {
    total_assignments: 0,
    avg_response_time_minutes: 0,
    sla_breach_rate: 0,
    pending_count: 0,
    metrics: [],
  };

  const breachPct = (safeDash.sla_breach_rate * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <UserCheck className="w-7 h-7 text-indigo-400" />
              Routing & SLA
            </h1>
            <p className="text-zinc-400 mt-1">
              Lead assignment rules, response SLAs, and breach tracking
            </p>
          </div>
          <button className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <UserCheck className="w-4 h-4" />
              Total Assignments
            </div>
            <p className="text-3xl font-bold text-white">
              {safeDash.total_assignments.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Clock className="w-4 h-4" />
              Avg Response
            </div>
            <p className="text-3xl font-bold text-white">
              {safeDash.avg_response_time_minutes.toFixed(0)}
              <span className="text-lg font-normal text-zinc-400 ml-1">min</span>
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <AlertTriangle className="w-4 h-4" />
              SLA Breach Rate
            </div>
            <p
              className={`text-3xl font-bold ${
                safeDash.sla_breach_rate > 0.1 ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {breachPct}%
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Clock className="w-4 h-4" />
              Pending
            </div>
            <p className="text-3xl font-bold text-amber-400">
              {safeDash.pending_count}
            </p>
          </div>
        </div>

        {/* Routing Rules Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Routing Rules</h3>
            <span className="text-sm text-zinc-400">{safeRules.length} rules</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Name", "Priority", "Strategy", "SLA (min)", "Status"].map((h) => (
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
                {safeRules.map((rule: any) => (
                  <tr key={rule.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-zinc-200 font-medium">
                      {rule.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                      {rule.priority}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          STRATEGY_COLORS[rule.strategy] ?? STRATEGY_COLORS.round_robin
                        }`}
                      >
                        {rule.strategy?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
                      {rule.sla_minutes ?? "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          rule.is_active
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {safeRules.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-500">
              No routing rules configured yet.
            </div>
          )}
        </div>

        {/* SLA Metrics Summary */}
        {(safeDash.metrics ?? []).length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">SLA Metrics by Rule</h3>
            <div className="space-y-3">
              {(safeDash.metrics ?? []).map((m: any) => {
                const breachRate = ((m.breach_rate ?? 0) * 100).toFixed(1);
                return (
                  <div
                    key={m.rule_id ?? m.name}
                    className="flex items-center gap-4 py-2 border-b border-white/5 last:border-0"
                  >
                    <span className="text-sm text-zinc-300 flex-1">{m.name}</span>
                    <span className="text-xs text-zinc-500">
                      {m.total_assignments ?? 0} assignments
                    </span>
                    <span className="text-xs text-zinc-500">
                      Avg {m.avg_response_minutes?.toFixed(0) ?? "—"} min
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        parseFloat(breachRate) > 10
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {breachRate}% breach
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
