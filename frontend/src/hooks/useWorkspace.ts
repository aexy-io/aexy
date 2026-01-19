"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { workspaceApi, WorkspaceListItem, Workspace, CustomTaskStatus, StatusCategory, WorkspacePendingInvite, WorkspaceAppSettings } from "@/lib/api";

const CURRENT_WORKSPACE_KEY = "current_workspace_id";

export function useWorkspace() {
  const queryClient = useQueryClient();
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // Load current workspace ID from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(CURRENT_WORKSPACE_KEY);
      if (stored) {
        setCurrentWorkspaceId(stored);
      }
    }
  }, []);

  // Fetch all workspaces the user is a member of
  const {
    data: workspaces,
    isLoading: workspacesLoading,
    error: workspacesError,
    refetch: refetchWorkspaces,
  } = useQuery<WorkspaceListItem[]>({
    queryKey: ["workspaces"],
    queryFn: workspaceApi.list,
    retry: 1,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });

  // Auto-select first workspace if none selected and workspaces are loaded
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !currentWorkspaceId) {
      const firstWorkspace = workspaces[0];
      setCurrentWorkspaceId(firstWorkspace.id);
      localStorage.setItem(CURRENT_WORKSPACE_KEY, firstWorkspace.id);
    }
  }, [workspaces, currentWorkspaceId]);

  // Verify stored workspace ID is valid
  useEffect(() => {
    if (workspaces && currentWorkspaceId) {
      const exists = workspaces.some((w) => w.id === currentWorkspaceId);
      if (!exists && workspaces.length > 0) {
        // Stored workspace no longer exists, switch to first available
        const firstWorkspace = workspaces[0];
        setCurrentWorkspaceId(firstWorkspace.id);
        localStorage.setItem(CURRENT_WORKSPACE_KEY, firstWorkspace.id);
      }
    }
  }, [workspaces, currentWorkspaceId]);

  // Fetch current workspace details
  const {
    data: currentWorkspace,
    isLoading: currentWorkspaceLoading,
    error: currentWorkspaceError,
  } = useQuery<Workspace>({
    queryKey: ["workspace", currentWorkspaceId],
    queryFn: () => workspaceApi.get(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
    retry: 1,
  });

  // Switch workspace
  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      localStorage.setItem(CURRENT_WORKSPACE_KEY, workspaceId);
      // Invalidate workspace-specific queries when switching
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    [queryClient]
  );

  // Create workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: workspaceApi.create,
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // Auto-switch to newly created workspace
      switchWorkspace(newWorkspace.id);
    },
  });

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: Parameters<typeof workspaceApi.update>[1] }) =>
      workspaceApi.update(workspaceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", variables.workspaceId] });
    },
  });

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: workspaceApi.delete,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // If deleted workspace was current, clear selection
      if (deletedId === currentWorkspaceId) {
        setCurrentWorkspaceId(null);
        localStorage.removeItem(CURRENT_WORKSPACE_KEY);
      }
    },
  });

  return {
    // Workspace list
    workspaces: workspaces || [],
    workspacesLoading,
    workspacesError,
    refetchWorkspaces,

    // Current workspace
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    currentWorkspaceError,

    // Actions
    switchWorkspace,
    createWorkspace: createWorkspaceMutation.mutateAsync,
    updateWorkspace: updateWorkspaceMutation.mutateAsync,
    deleteWorkspace: deleteWorkspaceMutation.mutateAsync,

    // Mutation states
    isCreating: createWorkspaceMutation.isPending,
    isUpdating: updateWorkspaceMutation.isPending,
    isDeleting: deleteWorkspaceMutation.isPending,

    // Computed
    hasWorkspaces: (workspaces?.length || 0) > 0,
    isOwner: typeof window !== "undefined"
      ? currentWorkspace?.owner_id === localStorage.getItem("developer_id")
      : false,
  };
}

// Hook for workspace members
export function useWorkspaceMembers(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: members,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => workspaceApi.getMembers(workspaceId!, true),
    enabled: !!workspaceId,
  });

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role?: string }) =>
      workspaceApi.inviteMember(workspaceId!, email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ developerId, role }: { developerId: string; role: string }) =>
      workspaceApi.updateMemberRole(workspaceId!, developerId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (developerId: string) => workspaceApi.removeMember(workspaceId!, developerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });

  return {
    members: members || [],
    isLoading,
    error,
    refetch,
    inviteMember: inviteMutation.mutateAsync,
    updateMemberRole: updateRoleMutation.mutateAsync,
    removeMember: removeMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

// Hook for workspace billing
export function useWorkspaceBilling(workspaceId: string | null) {
  const {
    data: billingStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["workspaceBilling", workspaceId],
    queryFn: () => workspaceApi.getBillingStatus(workspaceId!),
    enabled: !!workspaceId,
  });

  const {
    data: seatUsage,
    isLoading: seatUsageLoading,
  } = useQuery({
    queryKey: ["workspaceSeatUsage", workspaceId],
    queryFn: () => workspaceApi.getSeatUsage(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    billingStatus,
    seatUsage,
    isLoading: isLoading || seatUsageLoading,
    error,
    refetch,
  };
}

// Hook for custom task statuses
export function useCustomTaskStatuses(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: statuses,
    isLoading,
    error,
    refetch,
  } = useQuery<CustomTaskStatus[]>({
    queryKey: ["customTaskStatuses", workspaceId],
    queryFn: () => workspaceApi.getTaskStatuses(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      category?: StatusCategory;
      color?: string;
      icon?: string;
      is_default?: boolean;
    }) => workspaceApi.createTaskStatus(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ statusId, data }: {
      statusId: string;
      data: {
        name?: string;
        category?: StatusCategory;
        color?: string;
        icon?: string;
        is_default?: boolean;
      };
    }) => workspaceApi.updateTaskStatus(workspaceId!, statusId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (statusId: string) => workspaceApi.deleteTaskStatus(workspaceId!, statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) => workspaceApi.reorderTaskStatuses(workspaceId!, statusIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
  });

  // Group statuses by category for kanban display
  const statusesByCategory = statuses?.reduce((acc, status) => {
    if (!acc[status.category]) {
      acc[status.category] = [];
    }
    acc[status.category].push(status);
    return acc;
  }, {} as Record<StatusCategory, CustomTaskStatus[]>) || {};

  return {
    statuses: statuses || [],
    statusesByCategory,
    isLoading,
    error,
    refetch,
    createStatus: createMutation.mutateAsync,
    updateStatus: updateMutation.mutateAsync,
    deleteStatus: deleteMutation.mutateAsync,
    reorderStatuses: reorderMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
  };
}

// Hook for pending invites
export function usePendingInvites(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: pendingInvites,
    isLoading,
    error,
    refetch,
  } = useQuery<WorkspacePendingInvite[]>({
    queryKey: ["pendingInvites", workspaceId],
    queryFn: () => workspaceApi.getPendingInvites(workspaceId!),
    enabled: !!workspaceId,
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => workspaceApi.revokePendingInvite(workspaceId!, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (inviteId: string) => workspaceApi.resendPendingInvite(workspaceId!, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
    },
  });

  return {
    pendingInvites: pendingInvites || [],
    isLoading,
    error,
    refetch,
    revokeInvite: revokeMutation.mutateAsync,
    resendInvite: resendMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
    isResending: resendMutation.isPending,
  };
}

// Hook for workspace app settings
export function useWorkspaceAppSettings(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: appSettings,
    isLoading,
    error,
    refetch,
  } = useQuery<WorkspaceAppSettings>({
    queryKey: ["workspaceAppSettings", workspaceId],
    queryFn: () => workspaceApi.getAppSettings(workspaceId!),
    enabled: !!workspaceId,
  });

  const updateMutation = useMutation({
    mutationFn: (apps: Record<string, boolean>) => workspaceApi.updateAppSettings(workspaceId!, apps),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceAppSettings", workspaceId] });
    },
  });

  const updateMemberPermissionsMutation = useMutation({
    mutationFn: ({ developerId, appPermissions }: { developerId: string; appPermissions: Record<string, boolean> }) =>
      workspaceApi.updateMemberAppPermissions(workspaceId!, developerId, appPermissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
  });

  return {
    appSettings: appSettings || {
      hiring: true,
      tracking: true,
      oncall: true,
      sprints: true,
      documents: true,
      ticketing: true,
    },
    isLoading,
    error,
    refetch,
    updateAppSettings: updateMutation.mutateAsync,
    updateMemberPermissions: updateMemberPermissionsMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isUpdatingMember: updateMemberPermissionsMutation.isPending,
  };
}
