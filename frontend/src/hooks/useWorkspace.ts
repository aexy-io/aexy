"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { workspaceApi, WorkspaceListItem, Workspace, CustomTaskStatus, StatusCategory, WorkspacePendingInvite, WorkspaceAppSettings } from "@/lib/api";
import { useAuth } from "./useAuth";

const CURRENT_WORKSPACE_KEY = "current_workspace_id";

export function useWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load current workspace ID from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(CURRENT_WORKSPACE_KEY);
      if (stored) {
        setCurrentWorkspaceId(stored);
      }
      setIsInitialized(true);
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
  // Wait for isInitialized to ensure localStorage has been checked first
  useEffect(() => {
    if (!isInitialized) return;
    if (workspaces && workspaces.length > 0 && !currentWorkspaceId) {
      const firstWorkspace = workspaces[0];
      setCurrentWorkspaceId(firstWorkspace.id);
      localStorage.setItem(CURRENT_WORKSPACE_KEY, firstWorkspace.id);
    }
  }, [workspaces, currentWorkspaceId, isInitialized]);

  // Verify stored workspace ID is valid
  useEffect(() => {
    if (!isInitialized) return;
    if (workspaces && currentWorkspaceId) {
      const exists = workspaces.some((w) => w.id === currentWorkspaceId);
      if (!exists && workspaces.length > 0) {
        // Stored workspace no longer exists, switch to first available
        const firstWorkspace = workspaces[0];
        setCurrentWorkspaceId(firstWorkspace.id);
        localStorage.setItem(CURRENT_WORKSPACE_KEY, firstWorkspace.id);
      }
    }
  }, [workspaces, currentWorkspaceId, isInitialized]);

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
      toast.success("Workspace created");
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // Auto-switch to newly created workspace
      switchWorkspace(newWorkspace.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create workspace");
    },
  });

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: Parameters<typeof workspaceApi.update>[1] }) =>
      workspaceApi.update(workspaceId, data),
    onSuccess: (_, variables) => {
      toast.success("Workspace updated");
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", variables.workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update workspace");
    },
  });

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: workspaceApi.delete,
    onSuccess: (_, deletedId) => {
      toast.success("Workspace deleted");
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // If deleted workspace was current, clear selection
      if (deletedId === currentWorkspaceId) {
        setCurrentWorkspaceId(null);
        localStorage.removeItem(CURRENT_WORKSPACE_KEY);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete workspace");
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
      ? !!(user?.id && currentWorkspace?.owner_id === user.id)
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
      toast.success("Member invited");
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to invite member");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ developerId, role }: { developerId: string; role: string }) =>
      workspaceApi.updateMemberRole(workspaceId!, developerId, role),
    onSuccess: () => {
      toast.success("Member role updated");
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update member role");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (developerId: string) => workspaceApi.removeMember(workspaceId!, developerId),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (developerId: string) => workspaceApi.resendMemberInvite(workspaceId!, developerId),
    onSuccess: () => {
      toast.success("Invite resent");
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to resend invite");
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
    resendMemberInvite: resendInviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemoving: removeMutation.isPending,
    isResendingInvite: resendInviteMutation.isPending,
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
      toast.success("Status created");
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create status");
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
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (statusId: string) => workspaceApi.deleteTaskStatus(workspaceId!, statusId),
    onSuccess: () => {
      toast.success("Status deleted");
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete status");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) => workspaceApi.reorderTaskStatuses(workspaceId!, statusIds),
    onSuccess: () => {
      toast.success("Statuses reordered");
      queryClient.invalidateQueries({ queryKey: ["customTaskStatuses", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reorder statuses");
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
      toast.success("Invite revoked");
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to revoke invite");
    },
  });

  const resendMutation = useMutation({
    mutationFn: (inviteId: string) => workspaceApi.resendPendingInvite(workspaceId!, inviteId),
    onSuccess: () => {
      toast.success("Invite resent");
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to resend invite");
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
      toast.success("App settings updated");
      queryClient.invalidateQueries({ queryKey: ["workspaceAppSettings", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["appAccess"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update app settings");
    },
  });

  const updateMemberPermissionsMutation = useMutation({
    mutationFn: ({ developerId, appPermissions }: { developerId: string; appPermissions: Record<string, boolean> }) =>
      workspaceApi.updateMemberAppPermissions(workspaceId!, developerId, appPermissions),
    onSuccess: () => {
      toast.success("Member permissions updated");
      queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update member permissions");
    },
  });

  return {
    appSettings: appSettings || {},
    isLoading,
    error,
    refetch,
    updateAppSettings: updateMutation.mutateAsync,
    updateMemberPermissions: updateMemberPermissionsMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isUpdatingMember: updateMemberPermissionsMutation.isPending,
  };
}
