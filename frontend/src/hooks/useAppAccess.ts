"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  appAccessApi,
  MemberEffectiveAccess,
  AppAccessTemplate,
  AccessMatrixResponse,
  AppAccessConfig,
  AppAccessLogsResponse,
  AppAccessLogsSummary,
} from "@/lib/api";
import { APP_CATALOG, getAppIdFromPath } from "@/config/appDefinitions";

const ACCESS_KEY = "appAccess";

/**
 * Hook for managing app access for the current user
 */
export function useAppAccess(workspaceId: string | null, developerId: string | null) {
  const queryClient = useQueryClient();

  // Fetch effective access for the current user
  const {
    data: effectiveAccess,
    isLoading,
    error,
    refetch,
  } = useQuery<MemberEffectiveAccess>({
    queryKey: [ACCESS_KEY, "effective", workspaceId, developerId],
    queryFn: () => appAccessApi.getMemberEffectiveAccess(workspaceId!, developerId!),
    enabled: !!workspaceId && !!developerId && typeof window !== "undefined" && !!localStorage.getItem("token"),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  // Check if user has access to an app
  const hasAppAccess = useCallback(
    (appId: string): boolean => {
      if (!effectiveAccess) {
        // Default to true if access data hasn't loaded yet to avoid flickering
        return true;
      }

      // Admins have access to all apps
      if (effectiveAccess.is_admin) {
        return true;
      }

      const appAccess = effectiveAccess.apps[appId];
      return appAccess?.enabled ?? false;
    },
    [effectiveAccess]
  );

  // Check if user has access to a specific module
  const hasModuleAccess = useCallback(
    (appId: string, moduleId: string): boolean => {
      if (!effectiveAccess) {
        return true;
      }

      if (effectiveAccess.is_admin) {
        return true;
      }

      const appAccess = effectiveAccess.apps[appId];
      if (!appAccess?.enabled) {
        return false;
      }

      // If no modules defined, all are accessible when app is enabled
      if (Object.keys(appAccess.modules).length === 0) {
        return true;
      }

      return appAccess.modules[moduleId] ?? false;
    },
    [effectiveAccess]
  );

  // Check if user has access to a route
  const hasRouteAccess = useCallback(
    (pathname: string): boolean => {
      const appId = getAppIdFromPath(pathname);
      if (!appId) {
        // Routes not in the app catalog are accessible
        return true;
      }
      return hasAppAccess(appId);
    },
    [hasAppAccess]
  );

  // Get all accessible app IDs
  const accessibleApps = useMemo((): string[] => {
    if (!effectiveAccess) {
      // Return all apps if access data hasn't loaded
      return Object.keys(APP_CATALOG);
    }

    if (effectiveAccess.is_admin) {
      return Object.keys(APP_CATALOG);
    }

    return Object.entries(effectiveAccess.apps)
      .filter(([, access]) => access.enabled)
      .map(([appId]) => appId);
  }, [effectiveAccess]);

  // Get accessible modules for an app
  const getAccessibleModules = useCallback(
    (appId: string): string[] => {
      if (!effectiveAccess) {
        // Return all modules if access data hasn't loaded
        return APP_CATALOG[appId]?.modules.map((m) => m.id) ?? [];
      }

      if (effectiveAccess.is_admin) {
        return APP_CATALOG[appId]?.modules.map((m) => m.id) ?? [];
      }

      const appAccess = effectiveAccess.apps[appId];
      if (!appAccess?.enabled) {
        return [];
      }

      const appModules = APP_CATALOG[appId]?.modules ?? [];

      // If no module config, all are accessible
      if (Object.keys(appAccess.modules).length === 0) {
        return appModules.map((m) => m.id);
      }

      return Object.entries(appAccess.modules)
        .filter(([, enabled]) => enabled)
        .map(([moduleId]) => moduleId);
    },
    [effectiveAccess]
  );

  return {
    // Data
    effectiveAccess,
    isAdmin: effectiveAccess?.is_admin ?? false,
    appliedTemplateId: effectiveAccess?.applied_template_id ?? null,
    appliedTemplateName: effectiveAccess?.applied_template_name ?? null,
    hasCustomOverrides: effectiveAccess?.has_custom_overrides ?? false,

    // Loading state
    isLoading,
    error,
    refetch,

    // Access checks
    hasAppAccess,
    hasModuleAccess,
    hasRouteAccess,
    accessibleApps,
    getAccessibleModules,
  };
}

/**
 * Hook for managing app access templates
 */
export function useAppAccessTemplates(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Fetch templates
  const {
    data: templatesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [ACCESS_KEY, "templates", workspaceId],
    queryFn: () => appAccessApi.listTemplates(workspaceId!, true),
    enabled: !!workspaceId && typeof window !== "undefined" && !!localStorage.getItem("token"),
    staleTime: 5 * 60 * 1000,
  });

  const templates = templatesData?.templates ?? [];

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      app_config: Record<string, AppAccessConfig>;
    }) => appAccessApi.createTemplate(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "templates", workspaceId] });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
        app_config?: Record<string, AppAccessConfig>;
      };
    }) => appAccessApi.updateTemplate(workspaceId!, templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "templates", workspaceId] });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => appAccessApi.deleteTemplate(workspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "templates", workspaceId] });
    },
  });

  return {
    templates,
    isLoading,
    error,

    // Mutations
    createTemplate: createTemplateMutation.mutateAsync,
    updateTemplate: updateTemplateMutation.mutateAsync,
    deleteTemplate: deleteTemplateMutation.mutateAsync,

    // Mutation states
    isCreating: createTemplateMutation.isPending,
    isUpdating: updateTemplateMutation.isPending,
    isDeleting: deleteTemplateMutation.isPending,
  };
}

/**
 * Hook for managing member app access (admin functionality)
 */
export function useMemberAppAccess(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Fetch access matrix
  const {
    data: matrix,
    isLoading: isLoadingMatrix,
    error: matrixError,
  } = useQuery<AccessMatrixResponse>({
    queryKey: [ACCESS_KEY, "matrix", workspaceId],
    queryFn: () => appAccessApi.getAccessMatrix(workspaceId!),
    enabled: !!workspaceId && typeof window !== "undefined" && !!localStorage.getItem("token"),
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Update member access mutation
  const updateMemberAccessMutation = useMutation({
    mutationFn: ({
      developerId,
      appConfig,
      appliedTemplateId,
    }: {
      developerId: string;
      appConfig: Record<string, AppAccessConfig>;
      appliedTemplateId?: string | null;
    }) =>
      appAccessApi.updateMemberAccess(workspaceId!, developerId, {
        app_config: appConfig,
        applied_template_id: appliedTemplateId,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "matrix", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: [ACCESS_KEY, "effective", workspaceId, variables.developerId],
      });
    },
  });

  // Apply template to member mutation
  const applyTemplateMutation = useMutation({
    mutationFn: ({ developerId, templateId }: { developerId: string; templateId: string }) =>
      appAccessApi.applyTemplateToMember(workspaceId!, developerId, templateId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "matrix", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: [ACCESS_KEY, "effective", workspaceId, variables.developerId],
      });
    },
  });

  // Reset member to defaults mutation
  const resetMemberMutation = useMutation({
    mutationFn: (developerId: string) =>
      appAccessApi.resetMemberToDefaults(workspaceId!, developerId),
    onSuccess: (_, developerId) => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "matrix", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: [ACCESS_KEY, "effective", workspaceId, developerId],
      });
    },
  });

  // Bulk apply template mutation
  const bulkApplyTemplateMutation = useMutation({
    mutationFn: ({ developerIds, templateId }: { developerIds: string[]; templateId: string }) =>
      appAccessApi.bulkApplyTemplate(workspaceId!, developerIds, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "matrix", workspaceId] });
      queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, "effective", workspaceId] });
    },
  });

  // Fetch individual member access
  const getMemberAccess = useCallback(
    async (developerId: string) => {
      return appAccessApi.getMemberEffectiveAccess(workspaceId!, developerId);
    },
    [workspaceId]
  );

  return {
    // Matrix data
    matrix,
    members: matrix?.members ?? [],
    apps: matrix?.apps ?? [],
    isLoadingMatrix,
    matrixError,

    // Member access methods
    getMemberAccess,
    updateMemberAccess: updateMemberAccessMutation.mutateAsync,
    applyTemplateToMember: applyTemplateMutation.mutateAsync,
    resetMemberToDefaults: resetMemberMutation.mutateAsync,
    bulkApplyTemplate: bulkApplyTemplateMutation.mutateAsync,

    // Mutation states
    isUpdating: updateMemberAccessMutation.isPending,
    isApplyingTemplate: applyTemplateMutation.isPending,
    isResetting: resetMemberMutation.isPending,
    isBulkApplying: bulkApplyTemplateMutation.isPending,
  };
}

/**
 * Hook for managing app access logs (Enterprise feature)
 */
export function useAppAccessLogs(
  workspaceId: string | null,
  params?: {
    action?: string;
    target_type?: string;
    target_id?: string;
    actor_id?: string;
    limit?: number;
    offset?: number;
  }
) {
  // Fetch access logs
  const {
    data: logsData,
    isLoading,
    error,
    refetch,
  } = useQuery<AppAccessLogsResponse>({
    queryKey: [ACCESS_KEY, "logs", workspaceId, params],
    queryFn: () => appAccessApi.getAccessLogs(workspaceId!, params),
    enabled: !!workspaceId && typeof window !== "undefined" && !!localStorage.getItem("token"),
    staleTime: 30 * 1000, // Cache for 30 seconds
    retry: false, // Don't retry on 403 (enterprise check)
  });

  return {
    logs: logsData?.logs ?? [],
    total: logsData?.total ?? 0,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for access logs summary (Enterprise feature)
 */
export function useAppAccessLogsSummary(workspaceId: string | null, days: number = 30) {
  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useQuery<AppAccessLogsSummary>({
    queryKey: [ACCESS_KEY, "logs", "summary", workspaceId, days],
    queryFn: () => appAccessApi.getAccessLogsSummary(workspaceId!, days),
    enabled: !!workspaceId && typeof window !== "undefined" && !!localStorage.getItem("token"),
    staleTime: 60 * 1000, // Cache for 1 minute
    retry: false, // Don't retry on 403 (enterprise check)
  });

  return {
    summary,
    isLoading,
    error,
    refetch,
  };
}
