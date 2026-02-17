"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DeveloperTrend {
  developer_id: string;
  commits: number[];
  prs_merged: number[];
  reviews: number[];
}

interface ProductivityData {
  periods: string[];
  developer_trends: DeveloperTrend[];
  overall_trend: string;
}

interface ProductivityChartProps {
  data: ProductivityData | null;
  isLoading?: boolean;
  showMetrics?: ("commits" | "prs" | "reviews")[];
}

export function ProductivityChart({
  data,
  isLoading,
  showMetrics = ["commits", "prs", "reviews"],
}: ProductivityChartProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-72 bg-accent rounded-lg" />
      </div>
    );
  }

  if (!data || data.periods.length === 0) {
    return (
      <div className="flex items-center justify-center h-72 text-muted-foreground">
        No productivity data available
      </div>
    );
  }

  // Aggregate data across all developers per period
  const chartData = data.periods.map((period, idx) => {
    const periodData: { name: string; commits: number; prs: number; reviews: number } = {
      name: period,
      commits: 0,
      prs: 0,
      reviews: 0,
    };

    data.developer_trends.forEach((dev) => {
      periodData.commits += dev.commits[idx] || 0;
      periodData.prs += dev.prs_merged[idx] || 0;
      periodData.reviews += dev.reviews[idx] || 0;
    });

    return periodData;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="name"
            stroke="#9CA3AF"
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
          />
          <YAxis stroke="#9CA3AF" tick={{ fill: "#9CA3AF", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1E293B",
              border: "1px solid #374151",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#F3F4F6" }}
            itemStyle={{ color: "#F3F4F6" }}
          />
          <Legend
            wrapperStyle={{ paddingTop: "10px" }}
            iconType="circle"
          />
          {showMetrics.includes("commits") && (
            <Line
              type="monotone"
              dataKey="commits"
              name="Commits"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: "#10B981", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#10B981" }}
            />
          )}
          {showMetrics.includes("prs") && (
            <Line
              type="monotone"
              dataKey="prs"
              name="PRs Merged"
              stroke="#6366F1"
              strokeWidth={2}
              dot={{ fill: "#6366F1", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#6366F1" }}
            />
          )}
          {showMetrics.includes("reviews") && (
            <Line
              type="monotone"
              dataKey="reviews"
              name="Reviews"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={{ fill: "#F59E0B", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#F59E0B" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Trend indicator */}
      <div className="flex items-center justify-end mt-2 text-sm">
        <span className="text-muted-foreground mr-2">Overall trend:</span>
        <span
          className={`font-medium ${
            data.overall_trend === "increasing"
              ? "text-green-400"
              : data.overall_trend === "decreasing"
              ? "text-red-400"
              : "text-muted-foreground"
          }`}
        >
          {data.overall_trend}
        </span>
      </div>
    </div>
  );
}
