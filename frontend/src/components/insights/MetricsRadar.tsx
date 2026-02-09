"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

export interface RadarDataPoint {
  metric: string;
  fullMark: number;
  [key: string]: string | number;
}

interface MetricsRadarProps {
  data: RadarDataPoint[];
  developers: { id: string; name: string }[];
  height?: number;
}

export function MetricsRadar({
  data,
  developers,
  height = 350,
}: MetricsRadarProps) {
  if (!data.length || !developers.length) {
    return (
      <div
        className="flex items-center justify-center text-slate-500 text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          tick={{ fill: "#64748b", fontSize: 10 }}
          axisLine={false}
        />
        {developers.map((dev, i) => (
          <Radar
            key={dev.id}
            name={dev.name}
            dataKey={dev.id}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        <Legend
          wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 8 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            color: "#f8fafc",
            fontSize: 12,
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
