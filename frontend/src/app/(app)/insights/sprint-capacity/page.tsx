"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Gauge,
  Users,
  GitCommit,
  GitPullRequest,
  Code,
  Target,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { insightsApi, SprintCapacityResponse } from "@/lib/api";

export default function SprintCapacityPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [sprintDays, setSprintDays] = useState(14);

  const { data: capacity, isLoading } = useQuery<SprintCapacityResponse>({
    queryKey: ["sprintCapacity", currentWorkspaceId, sprintDays],
    queryFn: () =>
      insightsApi.getSprintCapacity(currentWorkspaceId!, {
        sprint_length_days: sprintDays,
        periods_back: 4,
      }),
    enabled: !!currentWorkspaceId,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const confidenceColor = (c: number) =>
    c >= 0.7 ? "text-green-400" : c >= 0.4 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/insights"
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Gauge className="h-6 w-6 text-emerald-400" />
              Sprint Capacity
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Forecast next sprint based on historical velocity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Sprint length:</span>
          <select
            value={sprintDays}
            onChange={(e) => setSprintDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
          >
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={21}>3 weeks</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      )}

      {capacity && (
        <>
          {/* Team Forecast */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-400" />
                Team Forecast
              </h2>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <span className="text-sm text-zinc-400">{capacity.member_count} members</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                  {sprintDays}-day sprint
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <ForecastCard
                icon={GitCommit}
                label="Commits"
                value={capacity.team_forecast.commits}
              />
              <ForecastCard
                icon={GitPullRequest}
                label="PRs Merged"
                value={capacity.team_forecast.prs_merged}
              />
              <ForecastCard
                icon={Code}
                label="Lines Added"
                value={capacity.team_forecast.lines_added}
                formatK
              />
              <ForecastCard
                icon={Target}
                label="Story Points"
                value={capacity.team_forecast.story_points}
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400">Team Confidence:</span>
              <span className={`text-sm font-medium ${confidenceColor(capacity.team_confidence)}`}>
                {(capacity.team_confidence * 100).toFixed(0)}%
              </span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden max-w-xs">
                <div
                  className={`h-full rounded-full ${
                    capacity.team_confidence >= 0.7
                      ? "bg-green-500"
                      : capacity.team_confidence >= 0.4
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${capacity.team_confidence * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Per-Developer Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              Per-Developer Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-zinc-400 text-xs border-b border-zinc-800">
                    <th className="text-left py-2 font-medium">Developer</th>
                    <th className="text-right py-2 font-medium">Commits</th>
                    <th className="text-right py-2 font-medium">PRs</th>
                    <th className="text-right py-2 font-medium">Lines</th>
                    <th className="text-right py-2 font-medium">Story Pts</th>
                    <th className="text-right py-2 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity.per_developer
                    .sort((a, b) => b.forecast.commits - a.forecast.commits)
                    .map((dev) => (
                      <tr key={dev.developer_id} className="border-b border-zinc-800/50">
                        <td className="py-2">
                          <Link
                            href={`/insights/developers/${dev.developer_id}`}
                            className="text-indigo-400 hover:text-indigo-300"
                          >
                            {dev.developer_name || dev.developer_id.slice(0, 12)}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-white font-medium">
                          ~{dev.forecast.commits.toFixed(0)}
                        </td>
                        <td className="py-2 text-right text-zinc-300">
                          ~{dev.forecast.prs_merged.toFixed(0)}
                        </td>
                        <td className="py-2 text-right text-zinc-300">
                          ~{dev.forecast.lines_added > 1000
                            ? `${(dev.forecast.lines_added / 1000).toFixed(1)}K`
                            : dev.forecast.lines_added.toFixed(0)}
                        </td>
                        <td className="py-2 text-right text-zinc-300">
                          ~{dev.forecast.story_points.toFixed(0)}
                        </td>
                        <td className="py-2 text-right">
                          <span className={`${confidenceColor(dev.confidence)}`}>
                            {(dev.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ForecastCard({
  icon: Icon,
  label,
  value,
  formatK,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  formatK?: boolean;
}) {
  const display = formatK && value > 1000 ? `~${(value / 1000).toFixed(1)}K` : `~${value.toFixed(0)}`;
  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-zinc-400" />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{display}</p>
    </div>
  );
}
