"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useBillingHistory, formatCurrency, formatNumber } from "@/hooks/useBillingUsage";
import { Loader2 } from "lucide-react";

interface UsageTrendChartProps {
  months?: number;
  className?: string;
}

export function UsageTrendChart({ months = 6, className = "" }: UsageTrendChartProps) {
  const { data, isLoading, error } = useBillingHistory(months);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Reverse to show oldest first (chronological order)
    return [...data].reverse().map((entry) => {
      const date = new Date(entry.period_start);
      return {
        name: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        cost: entry.total_cost_cents / 100, // Convert to dollars
        requests: entry.total_requests,
        tokens: entry.total_tokens,
        month: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Usage Trend</h3>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      </div>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Usage Trend</h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground">
            {error ? "Failed to load usage data" : "No usage data available yet"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-foreground mb-4">Usage Trend</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickFormatter={(value) => formatNumber(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{ color: "#f1f5f9", fontWeight: "600", marginBottom: "4px" }}
              formatter={((value: number, name: string) => {
                if (name === "cost") {
                  return [formatCurrency(value * 100), "Cost"];
                }
                return [formatNumber(value), name === "requests" ? "Requests" : "Tokens"];
              }) as never}
              labelFormatter={(label, payload) => {
                if (payload && payload[0]) {
                  return payload[0].payload.month;
                }
                return label;
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  cost: "Cost ($)",
                  requests: "Requests",
                };
                return <span className="text-foreground text-sm">{labels[value] || value}</span>;
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="cost"
              stroke="#22c55e"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorCost)"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="requests"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRequests)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default UsageTrendChart;
