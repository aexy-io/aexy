"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ChevronDown } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMAnalytics } from "@/hooks/useGTM";

const PERIOD_OPTIONS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  archived: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const ATTRIBUTION_MODELS = [
  { label: "First Touch", value: "first_touch" },
  { label: "Last Touch", value: "last_touch" },
  { label: "Linear", value: "linear" },
  { label: "U-Shaped", value: "u_shaped" },
  { label: "Time Decay", value: "time_decay" },
];

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function rateColor(rate: number): string {
  if (rate >= 0.3) return "text-emerald-400";
  if (rate >= 0.1) return "text-amber-400";
  return "text-muted-foreground";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: "#18181b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#fff",
  },
  itemStyle: { color: "#a1a1aa" },
};

export default function GTMAnalyticsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const [days, setDays] = useState(30);
  const [attributionModel, setAttributionModel] = useState("linear");
  const [periodOpen, setPeriodOpen] = useState(false);

  const {
    pipeline,
    channels,
    sequences,
    trends,
    attribution,
    isLoading,
    refetch,
  } = useGTMAnalytics(workspaceId, { days, attribution_model: attributionModel });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GTM Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline, channel performance, and attribution insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(!periodOpen)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
            >
              {PERIOD_OPTIONS.find((p) => p.value === days)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-muted border border-border rounded-lg shadow-xl z-20 py-1">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setDays(opt.value);
                      setPeriodOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                      days === opt.value ? "text-indigo-400" : "text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pipeline Funnel */}
      {pipeline && (
        <div className="bg-muted/50 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Pipeline Funnel</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Total leads: <span className="text-foreground font-medium">{pipeline.total_leads}</span>
              </span>
              <span className="text-muted-foreground">
                New this period: <span className="text-emerald-400 font-medium">{pipeline.period_new}</span>
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipeline.stages} layout="vertical" margin={{ left: 100, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis
                  dataKey="stage"
                  type="category"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  width={90}
                />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(value: number | undefined, _name: string, props: unknown) => [
                    `${value ?? 0} (${(((props as { payload?: { conversion_rate?: number } })?.payload?.conversion_rate ?? 0) * 100).toFixed(1)}% conv.)`,
                    "Count",
                  ]}
                />
                <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Channel Performance */}
      {channels && channels.channels.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Channel Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Channel", "Sent", "Delivered", "Opened", "Clicked", "Replied", "Bounced", "Open Rate", "Reply Rate"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-xs text-muted-foreground uppercase tracking-wide text-left pb-3 pr-4 font-medium"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {channels.channels.map((ch) => (
                  <tr key={ch.channel} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 pr-4 text-sm font-medium text-foreground capitalize">
                      {ch.channel}
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.total_sent}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.delivered}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.opened}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.clicked}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.replied}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{ch.bounced}</td>
                    <td className={`py-3 pr-4 text-sm font-medium ${rateColor(ch.open_rate)}`}>
                      {formatRate(ch.open_rate)}
                    </td>
                    <td className={`py-3 pr-4 text-sm font-medium ${rateColor(ch.reply_rate)}`}>
                      {formatRate(ch.reply_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sequence Comparison */}
      {sequences && sequences.sequences.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Sequence Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Sequence", "Status", "Enrolled", "Completed", "Replied", "Reply Rate", "Completion Rate"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-xs text-muted-foreground uppercase tracking-wide text-left pb-3 pr-4 font-medium"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sequences.sequences.map((seq) => (
                  <tr key={seq.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 pr-4 text-sm font-medium text-foreground">{seq.name}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={seq.status} />
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{seq.enrolled_count}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{seq.completed_count}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{seq.replied_count}</td>
                    <td className={`py-3 pr-4 text-sm font-medium ${rateColor(seq.reply_rate)}`}>
                      {formatRate(seq.reply_rate)}
                    </td>
                    <td className={`py-3 pr-4 text-sm font-medium ${rateColor(seq.completion_rate)}`}>
                      {formatRate(seq.completion_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trends — 2x2 sparkline grid */}
      {trends && (
        <div className="bg-muted/50 border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Trends</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Visitors", data: trends.visitors, color: "#818cf8" },
              { label: "New Leads", data: trends.leads, color: "#34d399" },
              { label: "Emails Sent", data: trends.emails_sent, color: "#60a5fa" },
              { label: "Replies", data: trends.replies, color: "#a78bfa" },
            ].map((chart) => (
              <div
                key={chart.label}
                className="bg-muted/30 border border-border/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{chart.label}</span>
                  {chart.data.length > 0 && (
                    <span className="text-lg font-semibold text-foreground">
                      {chart.data[chart.data.length - 1].count}
                    </span>
                  )}
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart.data}>
                      <defs>
                        <linearGradient id={`grad-${chart.label}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chart.color} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={chart.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip
                        {...chartTooltipStyle}
                        labelFormatter={(label: string) => label}
                        formatter={(value: number | undefined) => [value ?? 0, chart.label]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={chart.color}
                        strokeWidth={2}
                        fill={`url(#grad-${chart.label})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attribution */}
      {attribution && attribution.channels.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Attribution</h2>
            <select
              value={attributionModel}
              onChange={(e) => setAttributionModel(e.target.value)}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {ATTRIBUTION_MODELS.map((m) => (
                <option key={m.value} value={m.value} className="bg-muted">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attribution.channels} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="channel"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(value: number | undefined, _name: string, props: unknown) => [
                    `${value ?? 0} (${((props as { payload?: { percentage?: number } })?.payload?.percentage ?? 0).toFixed(1)}%)`,
                    "Conversions",
                  ]}
                />
                <Bar dataKey="attributed_conversions" fill="#818cf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
