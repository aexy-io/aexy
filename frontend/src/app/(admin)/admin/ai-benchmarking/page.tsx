"use client";

import { useState } from "react";
import {
  Bot,
  Cpu,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAIBenchmarking } from "@/hooks/useAIFeedback";
import { useAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="bg-muted rounded-xl border border-border p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {subtitle && (
            <p className="text-muted-foreground text-xs mt-1">{subtitle}</p>
          )}
        </div>
        <div className="p-2.5 bg-accent rounded-lg">
          <Icon className={cn("h-5 w-5", iconColor || "text-foreground")} />
        </div>
      </div>
    </div>
  );
}

const CHART_COLORS = {
  ask: "#a855f7",
  agent: "#3b82f6",
  automation: "#22c55e",
  input: "#a855f7",
  output: "#f59e0b",
  up: "#22c55e",
  down: "#ef4444",
};

export default function AIBenchmarkingPage() {
  const { isAdmin } = useAdmin();
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState("day");

  const { data, isLoading, error } = useAIBenchmarking(
    { days, group_by: groupBy },
    isAdmin,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <AlertCircle className="h-5 w-5 mr-2" />
        Failed to load benchmarking data
      </div>
    );
  }

  const askAi = data?.ask_ai;
  const agents = data?.agents;
  const automations = data?.automations;
  const feedback = data?.feedback;
  const volumeTrend = data?.volume_trend || [];

  const formatLatency = (ms: number | null | undefined) => {
    if (ms == null) return "N/A";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Build feedback distribution data
  const feedbackDistribution = (feedback?.by_entity_type || []).map((t) => ({
    type: t.entity_type.replace("_", " "),
    thumbs_up: t.thumbs_up,
    thumbs_down: t.thumbs_down,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Benchmarking</h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics across Ask AI, Agents, and Automations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm rounded-lg border border-border bg-muted px-3 py-1.5 text-foreground"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="text-sm rounded-lg border border-border bg-muted px-3 py-1.5 text-foreground"
          >
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ask AI"
          value={askAi?.total_conversations || 0}
          subtitle={`${askAi?.total_messages || 0} messages, ${formatLatency(askAi?.avg_latency_ms)} avg`}
          icon={Bot}
          iconColor="text-purple-400"
        />
        <StatCard
          title="Agent Executions"
          value={agents?.total_executions || 0}
          subtitle={agents?.success_rate != null ? `${agents.success_rate}% success` : "No data"}
          icon={Cpu}
          iconColor="text-blue-400"
        />
        <StatCard
          title="Automation Runs"
          value={automations?.total_runs || 0}
          subtitle={automations?.success_rate != null ? `${automations.success_rate}% success` : "No data"}
          icon={Zap}
          iconColor="text-emerald-400"
        />
        <StatCard
          title="Satisfaction"
          value={feedback?.satisfaction_rate != null ? `${feedback.satisfaction_rate}%` : "N/A"}
          subtitle={`${feedback?.thumbs_up || 0} up / ${feedback?.thumbs_down || 0} down`}
          icon={ThumbsUp}
          iconColor="text-amber-400"
        />
      </div>

      {/* Volume Trend + Feedback Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Volume Trend */}
        <div className="bg-muted rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Volume Trend (All AI)</h3>
          {volumeTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={volumeTrend.map((v) => ({ ...v, date: formatDate(v.date) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="ask_messages"
                  name="Ask AI"
                  stroke={CHART_COLORS.ask}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="agent_executions"
                  name="Agents"
                  stroke={CHART_COLORS.agent}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="automation_runs"
                  name="Automations"
                  stroke={CHART_COLORS.automation}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              No volume data yet
            </div>
          )}
        </div>

        {/* Feedback Distribution */}
        <div className="bg-muted rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Feedback Distribution</h3>
          {feedbackDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={feedbackDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="type" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="thumbs_up" name="Thumbs Up" fill={CHART_COLORS.up} radius={[4, 4, 0, 0]} />
                <Bar dataKey="thumbs_down" name="Thumbs Down" fill={CHART_COLORS.down} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              No feedback data yet
            </div>
          )}
        </div>
      </div>

      {/* Token Usage + Tool Success Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Usage */}
        <div className="bg-muted rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Token Usage (Ask AI)</h3>
          {(askAi?.token_usage_series?.length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={(askAi?.token_usage_series || []).map((t) => ({ ...t, date: formatDate(t.date) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number | undefined) => (value ?? 0).toLocaleString()}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="input_tokens"
                  name="Input Tokens"
                  stackId="1"
                  stroke={CHART_COLORS.input}
                  fill={CHART_COLORS.input}
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="output_tokens"
                  name="Output Tokens"
                  stackId="1"
                  stroke={CHART_COLORS.output}
                  fill={CHART_COLORS.output}
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              No token data yet
            </div>
          )}
        </div>

        {/* Tool Success Rates */}
        <div className="bg-muted rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Tool Success Rates</h3>
          {(askAi?.tool_usage?.length || 0) > 0 ? (
            <div className="space-y-3 max-h-[250px] overflow-y-auto">
              {askAi?.tool_usage?.map((tool) => (
                <div key={tool.tool_name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground font-medium truncate">{tool.tool_name}</span>
                    <span className="text-muted-foreground">{tool.call_count} calls / {tool.success_rate}%</span>
                  </div>
                  <div className="h-2 bg-accent rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        tool.success_rate >= 90 ? "bg-emerald-500" : tool.success_rate >= 70 ? "bg-yellow-500" : "bg-red-500",
                      )}
                      style={{ width: `${tool.success_rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              No tool usage data yet
            </div>
          )}
        </div>
      </div>

      {/* Agent Performance + Automation by Module */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent Performance */}
        <div className="bg-muted rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Agent Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left px-5 py-2">Agent</th>
                  <th className="text-right px-5 py-2">Runs</th>
                  <th className="text-right px-5 py-2">Success %</th>
                  <th className="text-right px-5 py-2">Avg Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(agents?.top_agents?.length || 0) > 0 ? (
                  agents?.top_agents?.map((agent) => (
                    <tr key={agent.name}>
                      <td className="px-5 py-2.5 text-foreground font-medium">{agent.name}</td>
                      <td className="px-5 py-2.5 text-right text-muted-foreground">{agent.executions}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={cn(
                          agent.success_rate >= 90 ? "text-emerald-400" : agent.success_rate >= 70 ? "text-yellow-400" : "text-red-400",
                        )}>
                          {agent.success_rate}%
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right text-muted-foreground">
                        {formatLatency(agent.avg_duration_ms)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No agent data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Automation by Module */}
        <div className="bg-muted rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Automation by Module</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left px-5 py-2">Module</th>
                  <th className="text-right px-5 py-2">Runs</th>
                  <th className="text-right px-5 py-2">Success %</th>
                  <th className="text-right px-5 py-2">Avg Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(automations?.by_module?.length || 0) > 0 ? (
                  automations?.by_module?.map((mod) => (
                    <tr key={mod.module}>
                      <td className="px-5 py-2.5 text-foreground font-medium capitalize">{mod.module}</td>
                      <td className="px-5 py-2.5 text-right text-muted-foreground">{mod.runs}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={cn(
                          mod.success_rate >= 90 ? "text-emerald-400" : mod.success_rate >= 70 ? "text-yellow-400" : "text-red-400",
                        )}>
                          {mod.success_rate}%
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right text-muted-foreground">
                        {formatLatency(mod.avg_duration_ms)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No automation data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Negative Feedback */}
      <div className="bg-muted rounded-xl border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Negative Feedback</h3>
        </div>
        <div className="divide-y divide-border">
          {(feedback?.recent_negative?.length || 0) > 0 ? (
            feedback?.recent_negative?.map((fb) => (
              <div key={fb.id} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-red-400 bg-red-400/10">
                      <ThumbsDown className="h-3 w-3" />
                      {fb.entity_type.replace("_", " ")}
                    </span>
                    {fb.tags && (
                      <span className="text-xs text-muted-foreground">{fb.tags}</span>
                    )}
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{fb.comment}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {fb.created_at
                    ? formatDistanceToNow(new Date(fb.created_at), { addSuffix: true })
                    : ""}
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm">
              No negative feedback yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
