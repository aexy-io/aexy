"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { slackApi, slackSyncApi, SlackIntegration, SlackChannel, SlackConfiguredChannel } from "@/lib/api";

export function useSlackIntegration(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const {
    data: integration,
    isLoading,
    error,
  } = useQuery<SlackIntegration | null>({
    queryKey: ["slack-integration", organizationId],
    queryFn: () => (organizationId ? slackApi.getIntegration(organizationId) : null),
    enabled: !!organizationId,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => {
      if (!integration?.id) throw new Error("No integration");
      return slackApi.disconnect(integration.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack-integration"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { is_active?: boolean; notification_preferences?: Record<string, boolean> }) => {
      if (!integration?.id) throw new Error("No integration");
      return slackApi.updateIntegration(integration.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack-integration"] });
    },
  });

  return {
    integration,
    isLoading,
    error,
    isConnected: !!integration?.is_active,
    integrationId: integration?.id,

    // Actions
    getInstallUrl: (installerId: string) =>
      organizationId ? slackApi.getInstallUrl(organizationId, installerId) : null,
    disconnect: disconnectMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

export function useSlackChannels(integrationId: string | undefined) {
  return useQuery<{ channels: SlackChannel[] }>({
    queryKey: ["slack-channels", integrationId],
    queryFn: () => slackSyncApi.getChannels(integrationId!),
    enabled: !!integrationId,
  });
}

export function useSlackConfiguredChannels(integrationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<{ channels: SlackConfiguredChannel[] }>({
    queryKey: ["slack-configured-channels", integrationId],
    queryFn: () => slackSyncApi.getConfiguredChannels(integrationId!),
    enabled: !!integrationId,
  });

  const configureMutation = useMutation({
    mutationFn: (data: {
      channel_id: string;
      channel_name: string;
      team_id: string;
      channel_type?: string;
      auto_parse_standups?: boolean;
      auto_parse_task_refs?: boolean;
      auto_parse_blockers?: boolean;
    }) => slackSyncApi.configureChannel(integrationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack-configured-channels", integrationId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (configId: string) => slackSyncApi.removeChannelConfig(integrationId!, configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack-configured-channels", integrationId] });
    },
  });

  return {
    ...query,
    configureChannel: configureMutation.mutateAsync,
    removeChannel: removeMutation.mutateAsync,
    isConfiguring: configureMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

export function useSlackSync(integrationId: string | undefined) {
  const importMutation = useMutation({
    mutationFn: (options?: {
      channel_ids?: string[];
      days_back?: number;
      team_id?: string;
      sprint_id?: string;
    }) => slackSyncApi.importHistory(integrationId!, options),
  });

  const syncMutation = useMutation({
    mutationFn: () => slackSyncApi.syncChannels(integrationId!),
  });

  const autoMapMutation = useMutation({
    mutationFn: () => slackSyncApi.autoMapUsers(integrationId!),
  });

  return {
    importHistory: importMutation.mutateAsync,
    syncChannels: syncMutation.mutateAsync,
    autoMapUsers: autoMapMutation.mutateAsync,
    isImporting: importMutation.isPending,
    isSyncing: syncMutation.isPending,
    isMapping: autoMapMutation.isPending,
    importResult: importMutation.data,
    syncResult: syncMutation.data,
    mappingResult: autoMapMutation.data,
  };
}
