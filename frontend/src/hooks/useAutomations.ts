/**
 * Platform-wide Automations hooks.
 *
 * Provides generic automation hooks that support all Aexy modules.
 * For backwards compatibility, useCRMAutomations in useCRM.ts uses
 * these hooks internally with module='crm'.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  automationsApi,
  Automation,
  AutomationRun,
  AutomationModule,
  AutomationTriggerType,
  AutomationActionType,
} from "@/lib/api";

// Re-export types for convenience
export type { Automation, AutomationRun, AutomationModule };

/** Registry item from the backend - can be a plain string or {id, description} object */
export type RegistryItem = string | { id: string; description?: string };

/** Normalize a registry item array to plain string IDs */
function normalizeRegistryItems(items: RegistryItem[]): string[] {
  return items.map((item) => (typeof item === "string" ? item : item.id));
}

/** Extract description map from registry items */
export function extractDescriptions(items: RegistryItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    if (typeof item !== "string" && item.description) {
      map[item.id] = item.description;
    }
  }
  return map;
}

export interface UseAutomationsOptions {
  module?: AutomationModule;
  object_id?: string;
  is_active?: boolean;
}

/**
 * Hook for managing automations across all modules.
 *
 * @param workspaceId - The workspace ID
 * @param options - Filter options (module, object_id, is_active)
 * @returns Automations and mutation functions
 */
export function useAutomations(
  workspaceId: string | null,
  options?: UseAutomationsOptions
) {
  const queryClient = useQueryClient();

  const {
    data: automations,
    isLoading,
    error,
    refetch,
  } = useQuery<Automation[]>({
    queryKey: ["automations", workspaceId, options],
    queryFn: () => automationsApi.list(workspaceId!, options),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      module: AutomationModule;
      trigger_type: string;
      description?: string;
      module_config?: Record<string, unknown>;
      object_id?: string;
      trigger_config?: Record<string, unknown>;
      conditions?: Record<string, unknown>[];
      actions: { type: string; config: Record<string, unknown> }[];
      error_handling?: "stop" | "continue" | "retry";
      run_limit_per_month?: number;
      is_active?: boolean;
    }) => automationsApi.create(workspaceId!, data),
    onSuccess: () => {
      toast.success("Automation created");
      queryClient.invalidateQueries({ queryKey: ["automations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create automation");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      automationId,
      data,
    }: {
      automationId: string;
      data: Partial<{
        name: string;
        description: string;
        module_config: Record<string, unknown>;
        trigger_config: Record<string, unknown>;
        conditions: Record<string, unknown>[];
        actions: { type: string; config: Record<string, unknown> }[];
        is_active: boolean;
        run_limit_per_month: number;
        error_handling: "stop" | "continue" | "retry";
      }>;
    }) => automationsApi.update(workspaceId!, automationId, data),
    onSuccess: () => {
      toast.success("Automation updated");
      queryClient.invalidateQueries({ queryKey: ["automations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update automation");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (automationId: string) => automationsApi.delete(workspaceId!, automationId),
    onSuccess: () => {
      toast.success("Automation deleted");
      queryClient.invalidateQueries({ queryKey: ["automations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete automation");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (automationId: string) => automationsApi.toggle(workspaceId!, automationId),
    onSuccess: (updatedAutomation) => {
      const isActive = updatedAutomation?.is_active;
      toast.success(isActive ? "Automation enabled" : "Automation disabled");
      queryClient.invalidateQueries({ queryKey: ["automations", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to toggle automation");
    },
  });

  const triggerMutation = useMutation({
    mutationFn: ({ automationId, recordId }: { automationId: string; recordId?: string }) =>
      automationsApi.trigger(workspaceId!, automationId, recordId),
    onSuccess: () => {
      toast.success("Automation triggered");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to trigger automation");
    },
  });

  return {
    automations: automations || [],
    isLoading,
    error,
    refetch,
    createAutomation: createMutation.mutateAsync,
    updateAutomation: updateMutation.mutateAsync,
    deleteAutomation: deleteMutation.mutateAsync,
    toggleAutomation: toggleMutation.mutateAsync,
    triggerAutomation: triggerMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isTriggering: triggerMutation.isPending,
  };
}

/**
 * Hook for fetching automation runs.
 *
 * @param workspaceId - The workspace ID
 * @param automationId - The automation ID
 * @param params - Pagination params
 * @returns Automation runs
 */
export function useAutomationRuns(
  workspaceId: string | null,
  automationId: string | null,
  params?: { skip?: number; limit?: number }
) {
  const {
    data: runs,
    isLoading,
    error,
    refetch,
  } = useQuery<AutomationRun[]>({
    queryKey: ["automationRuns", workspaceId, automationId, params],
    queryFn: () => automationsApi.listRuns(workspaceId!, automationId!, params),
    enabled: !!workspaceId && !!automationId,
  });

  return {
    runs: runs || [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching a single automation.
 *
 * @param workspaceId - The workspace ID
 * @param automationId - The automation ID
 * @returns Automation details
 */
export function useAutomation(workspaceId: string | null, automationId: string | null) {
  const {
    data: automation,
    isLoading,
    error,
    refetch,
  } = useQuery<Automation>({
    queryKey: ["automation", workspaceId, automationId],
    queryFn: () => automationsApi.get(workspaceId!, automationId!),
    enabled: !!workspaceId && !!automationId,
  });

  return {
    automation,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching trigger registry.
 *
 * Handles both old format (string[]) and new format ({id, description}[]).
 *
 * @param workspaceId - The workspace ID
 * @returns All available triggers by module (normalized to string[])
 */
export function useAutomationTriggerRegistry(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
  } = useQuery<{ triggers: Record<string, RegistryItem[]> }>({
    queryKey: ["automationTriggers", workspaceId],
    queryFn: () => automationsApi.getTriggerRegistry(workspaceId!),
    enabled: !!workspaceId,
  });

  const triggers = useMemo(() => {
    const raw = data?.triggers || {};
    const result: Record<string, string[]> = {};
    for (const [mod, items] of Object.entries(raw)) {
      result[mod] = normalizeRegistryItems(items);
    }
    return result;
  }, [data]);

  return {
    triggers,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching action registry.
 *
 * Handles both old format (string[]) and new format ({id, description}[]).
 *
 * @param workspaceId - The workspace ID
 * @returns All available actions by module (normalized to string[])
 */
export function useAutomationActionRegistry(workspaceId: string | null) {
  const {
    data,
    isLoading,
    error,
  } = useQuery<{ actions: Record<string, RegistryItem[]> }>({
    queryKey: ["automationActions", workspaceId],
    queryFn: () => automationsApi.getActionRegistry(workspaceId!),
    enabled: !!workspaceId,
  });

  const actions = useMemo(() => {
    const raw = data?.actions || {};
    const result: Record<string, string[]> = {};
    for (const [mod, items] of Object.entries(raw)) {
      result[mod] = normalizeRegistryItems(items);
    }
    return result;
  }, [data]);

  return {
    actions,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching triggers for a specific module.
 *
 * Handles both old format (string[]) and new format ({id, description}[]).
 *
 * @param workspaceId - The workspace ID
 * @param module - The module name
 * @returns Triggers for the module (normalized to string[]), plus descriptions
 */
export function useModuleTriggers(workspaceId: string | null, module: string | null) {
  const {
    data,
    isLoading,
    error,
  } = useQuery<{ module: string; triggers: RegistryItem[] }>({
    queryKey: ["moduleTriggers", workspaceId, module],
    queryFn: () => automationsApi.getModuleTriggers(workspaceId!, module!),
    enabled: !!workspaceId && !!module,
  });

  const rawTriggers = data?.triggers || [];

  const triggers = useMemo(() => normalizeRegistryItems(rawTriggers), [rawTriggers]);
  const descriptions = useMemo(() => extractDescriptions(rawTriggers), [rawTriggers]);

  return {
    triggers,
    descriptions,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching actions for a specific module.
 *
 * Handles both old format (string[]) and new format ({id, description}[]).
 *
 * @param workspaceId - The workspace ID
 * @param module - The module name
 * @returns Actions for the module (normalized to string[]), plus descriptions
 */
export function useModuleActions(workspaceId: string | null, module: string | null) {
  const {
    data,
    isLoading,
    error,
  } = useQuery<{ module: string; actions: RegistryItem[] }>({
    queryKey: ["moduleActions", workspaceId, module],
    queryFn: () => automationsApi.getModuleActions(workspaceId!, module!),
    enabled: !!workspaceId && !!module,
  });

  const rawActions = data?.actions || [];

  const actions = useMemo(() => normalizeRegistryItems(rawActions), [rawActions]);
  const descriptions = useMemo(() => extractDescriptions(rawActions), [rawActions]);

  return {
    actions,
    descriptions,
    isLoading,
    error,
  };
}
