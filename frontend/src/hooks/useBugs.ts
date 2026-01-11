"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  bugsApi,
  Bug,
  BugCreate,
  BugUpdate,
  BugStatus,
  BugSeverity,
  BugPriority,
} from "@/lib/api";

// List bugs for a workspace
export function useBugs(
  workspaceId: string | null,
  params?: {
    project_id?: string;
    story_id?: string;
    release_id?: string;
    status?: BugStatus;
    severity?: BugSeverity;
    priority?: BugPriority;
    assignee_id?: string;
    is_regression?: boolean;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: Bug[]; total: number }>({
    queryKey: ["bugs", workspaceId, params],
    queryFn: () => bugsApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: BugCreate) => bugsApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (bugId: string) => bugsApi.delete(workspaceId!, bugId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  return {
    bugs: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createBug: createMutation.mutateAsync,
    deleteBug: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Single bug with full details
export function useBug(workspaceId: string | null, bugId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: bug,
    isLoading,
    error,
    refetch,
  } = useQuery<Bug>({
    queryKey: ["bug", workspaceId, bugId],
    queryFn: () => bugsApi.get(workspaceId!, bugId!),
    enabled: !!workspaceId && !!bugId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: BugUpdate) => bugsApi.update(workspaceId!, bugId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
    },
  });

  // Status transitions
  const confirmMutation = useMutation({
    mutationFn: () => bugsApi.confirm(workspaceId!, bugId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  const fixMutation = useMutation({
    mutationFn: (fixedVersion?: string) => bugsApi.fix(workspaceId!, bugId!, fixedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => bugsApi.verify(workspaceId!, bugId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (resolution?: string) => bugsApi.close(workspaceId!, bugId!, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (reason?: string) => bugsApi.reopen(workspaceId!, bugId!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug", workspaceId, bugId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["bugStats", workspaceId] });
    },
  });

  return {
    bug,
    isLoading,
    error,
    refetch,
    updateBug: updateMutation.mutateAsync,
    confirm: confirmMutation.mutateAsync,
    fix: fixMutation.mutateAsync,
    verify: verifyMutation.mutateAsync,
    close: closeMutation.mutateAsync,
    reopen: reopenMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isFixing: fixMutation.isPending,
    isVerifying: verifyMutation.isPending,
    isClosing: closeMutation.isPending,
    isReopening: reopenMutation.isPending,
  };
}

// Bug statistics
export function useBugStats(workspaceId: string | null, projectId?: string) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    total: number;
    by_status: Record<BugStatus, number>;
    by_severity: Record<BugSeverity, number>;
    by_priority: Record<BugPriority, number>;
    regressions: number;
    avg_resolution_hours?: number;
  }>({
    queryKey: ["bugStats", workspaceId, projectId],
    queryFn: () => bugsApi.getStats(workspaceId!, projectId),
    enabled: !!workspaceId,
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}
