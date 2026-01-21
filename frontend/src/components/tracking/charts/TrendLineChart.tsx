"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";

export interface TrendDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface TrendLine {
  key: string;
  name: string;
  color: string;
  showArea?: boolean;
}

interface TrendLineChartProps {
  data: TrendDataPoint[];
  lines: TrendLine[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  referenceValue?: number;
  referenceLabel?: string;
  dateFormat?: "short" | "medium" | "day";
  valueFormatter?: (value: number) => string;
  className?: string;
}

const formatDate = (dateStr: string, format: "short" | "medium" | "day") => {
  const date = new Date(dateStr);
  switch (format) {
    case "short":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "medium":
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "day":
      return date.toLocaleDateString("en-US", { weekday: "short" });
    default:
      return dateStr;
  }
};

export function TrendLineChart({
  data,
  lines,
  title,
  height = 300,
  showLegend = true,
  showGrid = true,
  referenceValue,
  referenceLabel,
  dateFormat = "short",
  valueFormatter = (v) => String(v),
  className = "",
}: TrendLineChartProps) {
  const formattedData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      formattedDate: formatDate(point.date, dateFormat),
    }));
  }, [data, dateFormat]);

  const hasAreaLines = lines.some((l) => l.showArea);

  if (data.length === 0) {
    return (
      <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
        {title && <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-slate-500">
          No trend data available
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-white mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-sm text-slate-400">{entry.name}:</span>
              <span className="text-sm text-white">{valueFormatter(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const ChartComponent = hasAreaLines ? ComposedChart : LineChart;

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={formattedData}>
          <XAxis
            dataKey="formattedDate"
            stroke="#64748b"
            fontSize={12}
            tick={{ fill: "#94a3b8" }}
            tickLine={false}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tick={{ fill: "#94a3b8" }}
            tickLine={false}
            tickFormatter={valueFormatter}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
            />
          )}
          {referenceValue !== undefined && (
            <ReferenceLine
              y={referenceValue}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{
                value: referenceLabel,
                position: "right",
                fill: "#f59e0b",
                fontSize: 12,
              }}
            />
          )}
          {lines.map((line) =>
            line.showArea ? (
              <Area
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                fill={line.color}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: line.color }}
              />
            ) : (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: line.color }}
              />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

// Preset color schemes for common metrics
export const trendColors = {
  standups: "#3b82f6", // blue
  time: "#10b981", // green
  blockers: "#ef4444", // red
  tasks: "#8b5cf6", // purple
  sentiment: "#f59e0b", // amber
  utilization: "#06b6d4", // cyan
};

// Helper to aggregate data by week
export function aggregateByWeek<T extends { date: string }>(
  data: T[],
  valueKey: keyof T
): TrendDataPoint[] {
  const weeks = new Map<string, { date: string; total: number; count: number }>();

  data.forEach((item) => {
    const date = new Date(item.date);
    // Get the Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().split("T")[0];

    const existing = weeks.get(weekKey) || { date: weekKey, total: 0, count: 0 };
    existing.total += Number(item[valueKey]) || 0;
    existing.count += 1;
    weeks.set(weekKey, existing);
  });

  return Array.from(weeks.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({
      date: w.date,
      value: w.total,
      average: Math.round(w.total / w.count),
    }));
}
