"use client";

import { useState, useMemo } from "react";
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
import { insightsApi, SprintCapacityResponse, SprintCapacityDeveloper } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

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

  const developerColumns = useMemo<DataTableColumn<SprintCapacityDeveloper>[]>(
    () => [
      {
        id: "developer",
        header: "Developer",
        sortValue: (row) =>
          (row.developer_name || row.developer_id).toLowerCase(),
        cell: (row) => (
          <Link
            href={`/insights/developers/${row.developer_id}`}
            className="text-indigo-400 hover:text-indigo-300"
          >
            {row.developer_name || row.developer_id.slice(0, 12)}
          </Link>
        ),
      },
      {
        id: "commits",
        header: "Commits",
        headerClassName: "text-right",
        cellClassName: "text-right font-medium",
        sortValue: (row) => row.forecast.commits,
        cell: (row) => <>~{row.forecast.commits.toFixed(0)}</>,
      },
      {
        id: "prs",
        header: "PRs",
        headerClassName: "text-right",
        cellClassName: "text-right",
        sortValue: (row) => row.forecast.prs_merged,
        cell: (row) => <>~{row.forecast.prs_merged.toFixed(0)}</>,
      },
      {
        id: "lines",
        header: "Lines",
        headerClassName: "text-right",
        cellClassName: "text-right",
        sortValue: (row) => row.forecast.lines_added,
        cell: (row) => (
          <>
            ~{row.forecast.lines_added > 1000
              ? `${(row.forecast.lines_added / 1000).toFixed(1)}K`
              : row.forecast.lines_added.toFixed(0)}
          </>
        ),
      },
      {
        id: "story_points",
        header: "Story Pts",
        headerClassName: "text-right",
        cellClassName: "text-right",
        sortValue: (row) => row.forecast.story_points,
        cell: (row) => <>~{row.forecast.story_points.toFixed(0)}</>,
      },
      {
        id: "confidence",
        header: "Confidence",
        headerClassName: "text-right",
        cellClassName: "text-right",
        sortValue: (row) => row.confidence,
        cell: (row) => (
          <span className={confidenceColor(row.confidence)}>
            {(row.confidence * 100).toFixed(0)}%
          </span>
        ),
      },
    ],
    // confidenceColor is a stable function declared in the render scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sortedDevelopers = useMemo(
    () =>
      capacity?.per_developer
        ? [...capacity.per_developer].sort(
            (a, b) => b.forecast.commits - a.forecast.commits
          )
        : [],
    [capacity?.per_developer]
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/insights"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Gauge className="h-6 w-6 text-emerald-400" />
              Sprint Capacity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Forecast next sprint based on historical velocity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sprint length:</span>
          <select
            value={sprintDays}
            onChange={(e) => setSprintDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-sm"
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
          <div className="bg-background border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-400" />
                Team Forecast
              </h2>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{capacity.member_count} members</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground">
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
              <span className="text-xs text-muted-foreground">Team Confidence:</span>
              <span className={`text-sm font-medium ${confidenceColor(capacity.team_confidence)}`}>
                {(capacity.team_confidence * 100).toFixed(0)}%
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-xs">
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
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              Per-Developer Breakdown
            </h3>
            <DataTable
              columns={developerColumns}
              data={sortedDevelopers}
              rowKey={(row) => row.developer_id}
              compact
              emptyTitle="No developer data"
              emptyDescription="No capacity data available for individual developers"
            />
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
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{display}</p>
    </div>
  );
}
