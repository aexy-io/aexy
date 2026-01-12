"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  roleApi,
  CustomRole,
  RoleCreate,
  RoleUpdate,
  RoleTemplateInfo,
  PermissionInfo,
  PermissionCategory,
} from "@/lib/api";

/**
 * Hook for managing workspace roles
 */
export function useRoles(workspaceId: string | null, includeInactive = false) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["roles", workspaceId, includeInactive],
    queryFn: () => roleApi.list(workspaceId!, includeInactive),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: RoleCreate) => roleApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: RoleUpdate }) =>
      roleApi.update(workspaceId!, roleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => roleApi.delete(workspaceId!, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ roleId, newName }: { roleId: string; newName?: string }) =>
      roleApi.duplicate(workspaceId!, roleId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (roleId: string) => roleApi.resetToTemplate(workspaceId!, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  return {
    roles: data?.roles || [],
    isLoading,
    error,
    refetch,
    createRole: createMutation.mutateAsync,
    updateRole: updateMutation.mutateAsync,
    deleteRole: deleteMutation.mutateAsync,
    duplicateRole: duplicateMutation.mutateAsync,
    resetRoleToTemplate: resetMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}

/**
 * Hook for fetching a single role
 */
export function useRole(workspaceId: string | null, roleId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: role,
    isLoading,
    error,
    refetch,
  } = useQuery<CustomRole>({
    queryKey: ["role", workspaceId, roleId],
    queryFn: () => roleApi.get(workspaceId!, roleId!),
    enabled: !!workspaceId && !!roleId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: RoleUpdate) => roleApi.update(workspaceId!, roleId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role", workspaceId, roleId] });
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  return {
    role,
    isLoading,
    error,
    refetch,
    updateRole: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook for fetching role templates
 */
export function useRoleTemplates(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ templates: RoleTemplateInfo[] }>({
    queryKey: ["roleTemplates", workspaceId],
    queryFn: () => roleApi.getTemplates(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour since templates don't change often
  });

  return {
    templates: data?.templates || [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching permission catalog
 */
export function usePermissionCatalog(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{
    permissions: PermissionInfo[];
    categories: { id: PermissionCategory; name: string; icon: string }[];
  }>({
    queryKey: ["permissionCatalog", workspaceId],
    queryFn: () => roleApi.getPermissions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour since permissions don't change often
  });

  // Group permissions by category for UI convenience
  const permissionsByCategory = data?.permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<PermissionCategory, PermissionInfo[]>) || {};

  return {
    permissions: data?.permissions || [],
    categories: data?.categories || [],
    permissionsByCategory,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for creating a role from a template
 */
export function useCreateRoleFromTemplate(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const { templates } = useRoleTemplates(workspaceId);

  const createMutation = useMutation({
    mutationFn: async ({
      templateId,
      name,
      description,
    }: {
      templateId: string;
      name?: string;
      description?: string;
    }) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      return roleApi.create(workspaceId!, {
        name: name || template.name,
        description: description || template.description,
        color: template.color,
        icon: template.icon,
        based_on_template: templateId,
        permissions: template.permissions,
        priority: template.priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles", workspaceId] });
    },
  });

  return {
    createFromTemplate: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    error: createMutation.error,
  };
}
