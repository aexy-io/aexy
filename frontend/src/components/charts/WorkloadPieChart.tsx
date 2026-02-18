"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface WorkloadItem {
  developer_id: string;
  developer_name: string;
  workload: number;
  percentage: number;
}

interface WorkloadDistribution {
  workloads: WorkloadItem[];
  total_workload: number;
  average_workload: number;
  imbalance_score: number;
}

interface WorkloadPieChartProps {
  data: WorkloadDistribution | null;
  isLoading?: boolean;
}

const COLORS = [
  "#10B981", // green
  "#6366F1", // indigo
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
];

export function WorkloadPieChart({ data, isLoading }: WorkloadPieChartProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-64 bg-accent rounded-lg" />
      </div>
    );
  }

  if (!data || data.workloads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No workload data available
      </div>
    );
  }

  const chartData = data.workloads.map((w) => ({
    name: w.developer_name,
    value: w.workload,
    percentage: w.percentage,
  }));

  const getImbalanceColor = (score: number) => {
    if (score < 0.2) return "text-green-400";
    if (score < 0.4) return "text-yellow-400";
    return "text-red-400";
  };

  const getImbalanceLabel = (score: number) => {
    if (score < 0.2) return "Well balanced";
    if (score < 0.4) return "Moderate imbalance";
    return "High imbalance";
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label={(entry: any) =>
              `${entry.name}: ${entry.percentage.toFixed(0)}%`
            }
            labelLine={false}
          >
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1E293B",
              border: "1px solid #374151",
              borderRadius: "8px",
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [
              `${value} activities`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mt-4 text-center">
        <div>
          <div className="text-2xl font-bold text-foreground">
            {data.total_workload}
          </div>
          <div className="text-xs text-muted-foreground">Total Activities</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">
            {data.average_workload.toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground">Avg per Developer</div>
        </div>
        <div>
          <div
            className={`text-2xl font-bold ${getImbalanceColor(
              data.imbalance_score
            )}`}
          >
            {(data.imbalance_score * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">
            {getImbalanceLabel(data.imbalance_score)}
          </div>
        </div>
      </div>
    </div>
  );
}
