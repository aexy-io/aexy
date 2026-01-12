"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectApi,
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectMemberAdd,
  ProjectMemberUpdate,
  ProjectStatus,
  MyPermissionsResponse,
  ProjectInviteRequest,
  ProjectInviteResult,
} from "@/lib/api";

/**
 * Hook for managing workspace projects
 */
export function useProjects(workspaceId: string | null, status?: ProjectStatus) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projects", workspaceId, status],
    queryFn: () => projectApi.list(workspaceId!, status),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => projectApi.delete(workspaceId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  return {
    projects: data?.projects || [],
    isLoading,
    error,
    refetch,
    createProject: createMutation.mutateAsync,
    deleteProject: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook for fetching and managing a single project
 */
export function useProject(workspaceId: string | null, projectId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: project,
    isLoading,
    error,
    refetch,
  } = useQuery<Project>({
    queryKey: ["project", workspaceId, projectId],
    queryFn: () => projectApi.get(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectApi.update(workspaceId!, projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  return {
    project,
    isLoading,
    error,
    refetch,
    updateProject: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook for managing project members
 */
export function useProjectMembers(workspaceId: string | null, projectId: string | null) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projectMembers", workspaceId, projectId],
    queryFn: () => projectApi.getMembers(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: (data: ProjectMemberAdd) => projectApi.addMember(workspaceId!, projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectMembers", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ developerId, data }: { developerId: string; data: ProjectMemberUpdate }) =>
      projectApi.updateMember(workspaceId!, projectId!, developerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectMembers", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["myProjectPermissions", workspaceId, projectId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (developerId: string) =>
      projectApi.removeMember(workspaceId!, projectId!, developerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectMembers", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (data: ProjectInviteRequest) =>
      projectApi.invite(workspaceId!, projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectMembers", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  return {
    members: data?.members || [],
    isLoading,
    error,
    refetch,
    addMember: addMutation.mutateAsync,
    updateMember: updateMutation.mutateAsync,
    removeMember: removeMutation.mutateAsync,
    inviteMembers: inviteMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isInviting: inviteMutation.isPending,
    inviteResult: inviteMutation.data,
  };
}

/**
 * Hook for managing project teams
 */
export function useProjectTeams(workspaceId: string | null, projectId: string | null) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projectTeams", workspaceId, projectId],
    queryFn: () => projectApi.getTeams(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: (teamId: string) => projectApi.addTeam(workspaceId!, projectId!, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTeams", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (teamId: string) => projectApi.removeTeam(workspaceId!, projectId!, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTeams", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
    },
  });

  return {
    teams: data?.teams || [],
    isLoading,
    error,
    refetch,
    addTeam: addMutation.mutateAsync,
    removeTeam: removeMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

/**
 * Hook for getting current user's permissions in a project
 */
export function useMyProjectPermissions(workspaceId: string | null, projectId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<MyPermissionsResponse>({
    queryKey: ["myProjectPermissions", workspaceId, projectId],
    queryFn: () => projectApi.getMyPermissions(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  // Helper functions for checking permissions
  const hasPermission = (permission: string): boolean => {
    return data?.permissions.includes(permission) || false;
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some((p) => data?.permissions.includes(p));
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissions.every((p) => data?.permissions.includes(p));
  };

  return {
    permissions: data?.permissions || [],
    roleId: data?.role_id,
    roleName: data?.role_name,
    isWorkspaceOwner: data?.is_workspace_owner || false,
    permissionOverrides: data?.permission_overrides,
    isLoading,
    error,
    refetch,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}

/**
 * Hook for getting accessible widgets in a project context
 */
export function useProjectAccessibleWidgets(workspaceId: string | null, projectId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projectAccessibleWidgets", workspaceId, projectId],
    queryFn: () => projectApi.getAccessibleWidgets(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  return {
    accessibleWidgets: data?.widget_ids || [],
    isLoading,
    error,
    refetch,
  };
}
