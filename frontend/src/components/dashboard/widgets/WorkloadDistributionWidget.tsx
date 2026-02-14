"use client";

import Link from "next/link";
import { BarChart3, ChevronRight, Users } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function WorkloadDistributionWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { members, isLoading: membersLoading } = useTeamMembers(
    currentWorkspace?.id || null,
    defaultTeamId
  );

  const developerIds = (members || []).map((m: any) => m.developer_id || m.id);

  const { data: workload, isLoading: workloadLoading } = useQuery({
    queryKey: ["workloadDistribution", developerIds],
    queryFn: () => analyticsApi.getWorkloadDistribution(developerIds),
    enabled: developerIds.length > 0,
  });

  const isLoading = membersLoading || workloadLoading;

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  const workloads = workload?.workloads || [];
  const hasData = workloads.length > 0;
  const imbalanceScore = workload?.imbalance_score;

  const chartData = workloads.map((w: any) => ({
    name: (w.developer_name || "Unknown").split(" ")[0],
    workload: w.workload,
    percentage: w.percentage,
  }));

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Workload</h3>
          {imbalanceScore != null && imbalanceScore > 0.5 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
              Imbalanced
            </span>
          )}
        </div>
        <Link
          href="/insights"
          className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 transition"
        >
          View details <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace || !defaultTeamId ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              {!currentWorkspace
                ? "Select a workspace to view workload."
                : "Create a team to track workload."}
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">
              No workload data available yet.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#334155"
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f1f5f9",
                }}
                formatter={(value: any) => [`${value} tasks`, "Workload"]}
              />
              <Bar
                dataKey="workload"
                fill="#818cf8"
                radius={[0, 4, 4, 0]}
                name="Workload"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
