"use client";

import { useQuery } from "@tanstack/react-query";
import {
  workspaceEmailApi,
  WorkspaceEmailStats,
  PaginatedWorkspaceEmailLogs,
} from "@/lib/api";

/**
 * Hook to fetch workspace email delivery statistics.
 * Requires Enterprise tier.
 */
export function useWorkspaceEmailStats(
  workspaceId: string | null,
  developerId: string | null
) {
  return useQuery<WorkspaceEmailStats>({
    queryKey: ["workspace-email-stats", workspaceId],
    queryFn: () => workspaceEmailApi.getEmailStats(workspaceId!, developerId!),
    enabled: !!workspaceId && !!developerId,
    staleTime: 60 * 1000, // Cache for 1 minute
    retry: 1,
  });
}

/**
 * Hook to fetch workspace email logs.
 * Requires Enterprise tier.
 */
export function useWorkspaceEmailLogs(
  workspaceId: string | null,
  developerId: string | null,
  params?: {
    page?: number;
    per_page?: number;
    status_filter?: string;
  }
) {
  return useQuery<PaginatedWorkspaceEmailLogs>({
    queryKey: ["workspace-email-logs", workspaceId, params],
    queryFn: () => workspaceEmailApi.getEmailLogs(workspaceId!, developerId!, params),
    enabled: !!workspaceId && !!developerId,
    staleTime: 30 * 1000, // Cache for 30 seconds
    retry: 1,
  });
}
