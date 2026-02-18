"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface TimeBreakdownItem {
  name: string;
  value: number; // minutes
  color?: string;
}

interface TimeBreakdownChartProps {
  data: TimeBreakdownItem[];
  type?: "pie" | "bar";
  title?: string;
  height?: number;
  showLegend?: boolean;
  className?: string;
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: TimeBreakdownItem }> }) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="bg-muted border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-sm text-muted-foreground">{formatDuration(item.value)}</p>
      </div>
    );
  }
  return null;
};

export function TimeBreakdownChart({
  data,
  type = "pie",
  title,
  height = 300,
  showLegend = true,
  className = "",
}: TimeBreakdownChartProps) {
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      color: item.color || COLORS[index % COLORS.length],
    }));
  }, [data]);

  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

  if (data.length === 0) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        {title && <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          No time data available
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <span className="text-sm text-muted-foreground">Total: {formatDuration(total)}</span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {type === "pie" ? (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {showLegend && (
              <Legend
                verticalAlign="bottom"
                formatter={(value) => <span className="text-foreground text-sm">{value}</span>}
              />
            )}
          </PieChart>
        ) : (
          <BarChart data={chartData} layout="vertical">
            <XAxis
              type="number"
              tickFormatter={formatDuration}
              stroke="#64748b"
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              stroke="#64748b"
              fontSize={12}
              tick={{ fill: "#94a3b8" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Helper to group time entries by project/task
export function groupTimeByProject(
  entries: Array<{ task?: { id: string; title: string }; duration_minutes: number }>
): TimeBreakdownItem[] {
  const grouped = new Map<string, { name: string; value: number }>();

  entries.forEach((entry) => {
    const key = entry.task?.id || "unassigned";
    const name = entry.task?.title || "Unassigned";
    const existing = grouped.get(key) || { name, value: 0 };
    grouped.set(key, { ...existing, value: existing.value + entry.duration_minutes });
  });

  return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
}

// Helper to group time entries by date
export function groupTimeByDate(
  entries: Array<{ entry_date: string; duration_minutes: number }>
): TimeBreakdownItem[] {
  const grouped = new Map<string, { name: string; value: number }>();

  entries.forEach((entry) => {
    const date = new Date(entry.entry_date);
    const key = entry.entry_date;
    const name = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const existing = grouped.get(key) || { name, value: 0 };
    grouped.set(key, { ...existing, value: existing.value + entry.duration_minutes });
  });

  // Sort by date
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, item]) => item);
}
