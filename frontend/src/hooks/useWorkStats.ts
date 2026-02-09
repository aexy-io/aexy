"use client";

import { useQuery } from "@tanstack/react-query";
import { workStatsApi, WorkspaceGitHubAnalytics } from "@/lib/work-stats-api";

export function useWorkspaceGitHubAnalytics(
  workspaceId: string | null,
  days: number = 30
) {
  return useQuery<WorkspaceGitHubAnalytics>({
    queryKey: ["work-stats", "github-analytics", workspaceId, days],
    queryFn: () => workStatsApi.getGitHubAnalytics(workspaceId!, days),
    enabled: !!workspaceId,
  });
}
