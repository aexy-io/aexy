"use client";

import Link from "next/link";
import { Ticket, ChevronRight, BarChart3 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketStats } from "@/hooks/useTicketing";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#f59e0b",
  pending: "#a78bfa",
  resolved: "#34d399",
  closed: "#64748b",
};

export function TicketChartWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stats, isLoading } = useTicketStats(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  // Build chart data from stats
  const statusBreakdown = stats?.by_status || stats?.status_breakdown || {};
  const chartData = Object.entries(statusBreakdown).map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    count: count as number,
    fill: STATUS_COLORS[status] || "#64748b",
  }));

  const hasData = chartData.length > 0 && chartData.some((d) => d.count > 0);
  const slaCompliance = stats?.sla_compliance_rate ?? stats?.sla_compliance;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/10 rounded-lg">
            <Ticket className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Tickets</h3>
          {slaCompliance != null && (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                slaCompliance >= 90
                  ? "bg-green-500/20 text-green-400"
                  : slaCompliance >= 70
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-red-500/20 text-red-400"
              }`}
            >
              SLA {typeof slaCompliance === "number" ? `${slaCompliance}%` : slaCompliance}
            </span>
          )}
        </div>
        <Link
          href="/tickets"
          className="text-pink-400 hover:text-pink-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              Select a workspace to view tickets.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              No ticket data available yet.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="status"
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f1f5f9",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Tickets">
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
