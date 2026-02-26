"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  gtmApi,
  GTMProviderConfig,
  GTMProviderConfigCreate,
  GTMProviderConfigUpdate,
  ICPTemplate,
  ICPTemplateCreate,
  ICPTemplateUpdate,
} from "@/lib/api";

export function useGTMProviders(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<GTMProviderConfig[]>({
    queryKey: ["gtmProviders", workspaceId],
    queryFn: () => gtmApi.providers.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: GTMProviderConfigCreate) => gtmApi.providers.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtmProviders", workspaceId] });
      toast.success("Provider configured successfully");
    },
    onError: () => {
      toast.error("Failed to configure provider");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ slot, name, data }: { slot: string; name: string; data: GTMProviderConfigUpdate }) =>
      gtmApi.providers.update(workspaceId!, slot, name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtmProviders", workspaceId] });
      toast.success("Provider updated");
    },
    onError: () => {
      toast.error("Failed to update provider");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ slot, name }: { slot: string; name: string }) =>
      gtmApi.providers.delete(workspaceId!, slot, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtmProviders", workspaceId] });
      toast.success("Provider removed");
    },
    onError: () => {
      toast.error("Failed to remove provider");
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ slot, name }: { slot: string; name: string }) =>
      gtmApi.providers.test(workspaceId!, slot, name),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Connection test passed");
      } else {
        toast.error(result.message || "Connection test failed");
      }
    },
    onError: () => {
      toast.error("Connection test failed");
    },
  });

  const testCredentialsMutation = useMutation({
    mutationFn: ({ slot, providerName, credentials }: { slot: string; providerName: string; credentials: Record<string, string> }) =>
      gtmApi.providers.testCredentials(workspaceId!, slot, providerName, credentials),
    onError: () => {
      toast.error("Failed to test credentials");
    },
  });

  return {
    providers: data || [],
    isLoading,
    error,
    refetch,
    createProvider: createMutation.mutateAsync,
    updateProvider: updateMutation.mutateAsync,
    deleteProvider: deleteMutation.mutateAsync,
    testProvider: testMutation.mutateAsync,
    testCredentials: testCredentialsMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isTesting: testMutation.isPending || testCredentialsMutation.isPending,
  };
}

export function useICPTemplates(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<ICPTemplate[]>({
    queryKey: ["icpTemplates", workspaceId],
    queryFn: () => gtmApi.icpTemplates.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ICPTemplateCreate) => gtmApi.icpTemplates.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icpTemplates", workspaceId] });
      toast.success("ICP template created");
    },
    onError: () => {
      toast.error("Failed to create ICP template");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: ICPTemplateUpdate }) =>
      gtmApi.icpTemplates.update(workspaceId!, templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icpTemplates", workspaceId] });
      toast.success("ICP template updated");
    },
    onError: () => {
      toast.error("Failed to update ICP template");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => gtmApi.icpTemplates.delete(workspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icpTemplates", workspaceId] });
      toast.success("ICP template deleted");
    },
    onError: () => {
      toast.error("Failed to delete ICP template");
    },
  });

  return {
    templates: data || [],
    isLoading,
    error,
    refetch,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
  };
}
