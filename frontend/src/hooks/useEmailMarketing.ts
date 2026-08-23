"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  emailMarketingApi,
  emailInfrastructureApi,
  visualBuilderApi,
  EmailTemplate,
  EmailTemplateCreate,
  EmailTemplateUpdate,
  EmailCampaign,
  EmailCampaignCreate,
  EmailCampaignUpdate,
  CampaignStatus,
  CampaignType,
  EmailTemplateType,
  RecipientStatus,
  SendingDomain,
  SendingPool,
  SendingPoolSummary,
  EmailProvider,
  VisualBlock,
  SavedDesign,
  SubscriptionCategory,
  EmailSubscriber,
  SubscriberStatus,
  SubscriberImportRequest,
  SubscriberImportResponse,
} from "@/lib/api";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

// ==================== Templates Hooks ====================

export function useEmailTemplates(workspaceId: string | null, params?: { template_type?: EmailTemplateType; is_active?: boolean }) {
  const queryClient = useQueryClient();

  const {
    data: templates,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailTemplate[]>({
    queryKey: ["emailTemplates", workspaceId, params],
    queryFn: () => emailMarketingApi.templates.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: EmailTemplateCreate) => emailMarketingApi.templates.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: EmailTemplateUpdate }) =>
      emailMarketingApi.templates.update(workspaceId!, templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => emailMarketingApi.templates.delete(workspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name?: string }) =>
      emailMarketingApi.templates.duplicate(workspaceId!, templateId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });

  return {
    templates: templates ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    duplicateTemplate: duplicateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useEmailTemplate(workspaceId: string | null, templateId: string | null) {
  return useQuery<EmailTemplate>({
    queryKey: ["emailTemplate", workspaceId, templateId],
    queryFn: () => emailMarketingApi.templates.get(workspaceId!, templateId!),
    enabled: !!workspaceId && !!templateId,
  });
}

// ==================== Campaigns Hooks ====================

export function useEmailCampaigns(
  workspaceId: string | null,
  params?: { status?: CampaignStatus; campaign_type?: CampaignType; skip?: number; limit?: number }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ items: EmailCampaign[]; total: number }>({
    queryKey: ["emailCampaigns", workspaceId, params],
    queryFn: () => emailMarketingApi.campaigns.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: EmailCampaignCreate) => emailMarketingApi.campaigns.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ campaignId, data }: { campaignId: string; data: EmailCampaignUpdate }) =>
      emailMarketingApi.campaigns.update(workspaceId!, campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.delete(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.send(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.pause(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.resume(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.cancel(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ campaignId, scheduledAt }: { campaignId: string; scheduledAt: string }) =>
      emailMarketingApi.campaigns.schedule(workspaceId!, campaignId, scheduledAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ campaignId, name }: { campaignId: string; name?: string }) =>
      emailMarketingApi.campaigns.duplicate(workspaceId!, campaignId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: ({ campaignId, emails }: { campaignId: string; emails: string[] }) =>
      emailMarketingApi.campaigns.test(workspaceId!, campaignId, emails),
  });

  return {
    campaigns: data?.items ?? EMPTY_ARRAY,
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
    deleteCampaign: deleteMutation.mutateAsync,
    sendCampaign: sendMutation.mutateAsync,
    pauseCampaign: pauseMutation.mutateAsync,
    resumeCampaign: resumeMutation.mutateAsync,
    cancelCampaign: cancelMutation.mutateAsync,
    scheduleCampaign: scheduleMutation.mutateAsync,
    duplicateCampaign: duplicateMutation.mutateAsync,
    testCampaign: testMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isSending: sendMutation.isPending,
  };
}

export function useEmailCampaign(workspaceId: string | null, campaignId: string | null) {
  return useQuery<EmailCampaign>({
    queryKey: ["emailCampaign", workspaceId, campaignId],
    queryFn: () => emailMarketingApi.campaigns.get(workspaceId!, campaignId!),
    enabled: !!workspaceId && !!campaignId,
  });
}

export function useCampaignRecipients(
  workspaceId: string | null,
  campaignId: string | null,
  params?: { status?: RecipientStatus; skip?: number; limit?: number }
) {
  return useQuery({
    queryKey: ["campaignRecipients", workspaceId, campaignId, params],
    queryFn: () => emailMarketingApi.campaigns.getRecipients(workspaceId!, campaignId!, params),
    enabled: !!workspaceId && !!campaignId,
  });
}

// ==================== Analytics Hooks ====================

export function useEmailAnalyticsOverview(workspaceId: string | null, days?: number) {
  return useQuery({
    queryKey: ["emailAnalyticsOverview", workspaceId, days],
    queryFn: () => emailMarketingApi.analytics.getOverview(workspaceId!, { days }),
    enabled: !!workspaceId,
  });
}

export function useCampaignAnalytics(workspaceId: string | null, campaignId: string | null) {
  return useQuery({
    queryKey: ["campaignAnalytics", workspaceId, campaignId],
    queryFn: () => emailMarketingApi.analytics.getCampaignAnalytics(workspaceId!, campaignId!),
    enabled: !!workspaceId && !!campaignId,
  });
}

export function useEmailAnalyticsTrends(workspaceId: string | null, days?: number) {
  return useQuery({
    queryKey: ["emailAnalyticsTrends", workspaceId, days],
    queryFn: () => emailMarketingApi.analytics.getTrends(workspaceId!, { days }),
    enabled: !!workspaceId,
  });
}

export function useBestSendTimes(workspaceId: string | null) {
  return useQuery({
    queryKey: ["bestSendTimes", workspaceId],
    queryFn: () => emailMarketingApi.analytics.getBestSendTimes(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useTopCampaigns(workspaceId: string | null, metric?: "opens" | "clicks" | "conversions", limit?: number) {
  return useQuery({
    queryKey: ["topCampaigns", workspaceId, metric, limit],
    queryFn: () => emailMarketingApi.analytics.getTopCampaigns(workspaceId!, { metric, limit }),
    enabled: !!workspaceId,
  });
}

// ==================== Infrastructure Hooks ====================

export function useSendingDomains(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: domains,
    isLoading,
    error,
    refetch,
  } = useQuery<SendingDomain[]>({
    queryKey: ["sendingDomains", workspaceId],
    queryFn: () => emailInfrastructureApi.domains.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { domain: string; daily_limit?: number }) =>
      emailInfrastructureApi.domains.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (domainId: string) => emailInfrastructureApi.domains.delete(workspaceId!, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (domainId: string) => emailInfrastructureApi.domains.verify(workspaceId!, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (domainId: string) => emailInfrastructureApi.domains.pause(workspaceId!, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (domainId: string) => emailInfrastructureApi.domains.resume(workspaceId!, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  const startWarmingMutation = useMutation({
    mutationFn: ({ domainId, schedule }: { domainId: string; schedule?: string }) =>
      emailInfrastructureApi.domains.startWarming(workspaceId!, domainId, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sendingDomains", workspaceId] });
    },
  });

  return {
    domains: domains ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createDomain: createMutation.mutateAsync,
    deleteDomain: deleteMutation.mutateAsync,
    verifyDomain: verifyMutation.mutateAsync,
    pauseDomain: pauseMutation.mutateAsync,
    resumeDomain: resumeMutation.mutateAsync,
    startWarming: startWarmingMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

export function useEmailProviders(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: providers,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailProvider[]>({
    queryKey: ["emailProviders", workspaceId],
    queryFn: () => emailInfrastructureApi.providers.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; provider_type: string; credentials: Record<string, string> }) =>
      emailInfrastructureApi.providers.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailProviders", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ providerId, data }: { providerId: string; data: { name?: string; description?: string; credentials?: Record<string, unknown>; is_active?: boolean; is_default?: boolean } }) =>
      emailInfrastructureApi.providers.update(workspaceId!, providerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailProviders", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (providerId: string) => emailInfrastructureApi.providers.delete(workspaceId!, providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailProviders", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (providerId: string) => emailInfrastructureApi.providers.test(workspaceId!, providerId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Connection successful", {
          description: data.message || "Provider is configured correctly",
        });
      } else {
        toast.error("Connection failed", {
          description: data.message || "Please check your credentials",
        });
      }
    },
    onError: (error: Error) => {
      toast.error("Test failed", {
        description: error.message || "Could not test the provider connection",
      });
    },
  });

  return {
    providers: providers ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createProvider: createMutation.mutateAsync,
    updateProvider: updateMutation.mutateAsync,
    deleteProvider: deleteMutation.mutateAsync,
    testProvider: testMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isTesting: testMutation.isPending,
  };
}

// ==================== Visual Builder Hooks ====================

export function useVisualBlocks(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: blocks,
    isLoading,
    error,
    refetch,
  } = useQuery<VisualBlock[]>({
    queryKey: ["visualBlocks", workspaceId],
    queryFn: () => visualBuilderApi.blocks.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { block_type: string; name: string; description?: string; default_props?: Record<string, unknown>; schema?: Record<string, unknown> }) =>
      visualBuilderApi.blocks.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visualBlocks", workspaceId] });
    },
  });

  return {
    blocks: blocks ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createBlock: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

export function useSavedDesigns(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: designs,
    isLoading,
    error,
    refetch,
  } = useQuery<SavedDesign[]>({
    queryKey: ["savedDesigns", workspaceId],
    queryFn: () => visualBuilderApi.designs.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; design_json: Record<string, unknown> }) =>
      visualBuilderApi.designs.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedDesigns", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ designId, data }: { designId: string; data: { name?: string; description?: string; design_json?: Record<string, unknown> } }) =>
      visualBuilderApi.designs.update(workspaceId!, designId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedDesigns", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (designId: string) => visualBuilderApi.designs.delete(workspaceId!, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedDesigns", workspaceId] });
    },
  });

  const convertToTemplateMutation = useMutation({
    mutationFn: ({ designId, data }: { designId: string; data: { name: string; subject: string } }) =>
      visualBuilderApi.designs.convertToTemplate(workspaceId!, designId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });

  return {
    designs: designs ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createDesign: createMutation.mutateAsync,
    updateDesign: updateMutation.mutateAsync,
    deleteDesign: deleteMutation.mutateAsync,
    convertToTemplate: convertToTemplateMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// ==================== Standalone Mutation Hooks ====================
// These hooks can be used independently when you need campaign/template actions
// outside of the main list context

export function usePauseCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.pause(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useResumeCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.resume(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useCancelCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.cancel(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useDuplicateCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.duplicate(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useDeleteCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.delete(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useSendCampaign(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => emailMarketingApi.campaigns.send(workspaceId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
    },
  });
}

export function useDuplicateTemplate(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => emailMarketingApi.templates.duplicate(workspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });
}

export function useDeleteTemplate(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => emailMarketingApi.templates.delete(workspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates", workspaceId] });
    },
  });
}

export function usePreviewTemplate(workspaceId: string | null) {
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: Record<string, string> }) =>
      emailMarketingApi.templates.preview(workspaceId!, templateId, data),
    onError: () => {
      toast.error("Failed to preview template");
    },
  });
}

// ==================== Subscription Categories Hooks ====================

export function useSubscriptionCategories(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: categories,
    isLoading,
    error,
    refetch,
  } = useQuery<SubscriptionCategory[]>({
    queryKey: ["subscriptionCategories", workspaceId],
    queryFn: () => emailMarketingApi.categories.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug?: string; description?: string; default_subscribed?: boolean }) =>
      emailMarketingApi.categories.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptionCategories", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ categoryId, data }: { categoryId: string; data: { name?: string; description?: string; is_active?: boolean } }) =>
      emailMarketingApi.categories.update(workspaceId!, categoryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptionCategories", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) => emailMarketingApi.categories.delete(workspaceId!, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptionCategories", workspaceId] });
    },
  });

  return {
    categories: categories ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ==================== Subscribers Hooks ====================

export function useSubscribers(workspaceId: string | null, params?: { status?: SubscriberStatus; limit?: number; offset?: number }) {
  const queryClient = useQueryClient();

  const {
    data: subscribers,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailSubscriber[]>({
    queryKey: ["subscribers", workspaceId, params],
    queryFn: () => emailMarketingApi.subscribers.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (subscriberId: string) => emailMarketingApi.subscribers.delete(workspaceId!, subscriberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers", workspaceId] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: ({ subscriberId, reason }: { subscriberId: string; reason?: string }) =>
      emailMarketingApi.subscribers.unsubscribe(workspaceId!, subscriberId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers", workspaceId] });
    },
  });

  const resubscribeMutation = useMutation({
    mutationFn: (subscriberId: string) => emailMarketingApi.subscribers.resubscribe(workspaceId!, subscriberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers", workspaceId] });
    },
  });

  return {
    subscribers: subscribers ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    deleteSubscriber: deleteMutation.mutateAsync,
    unsubscribe: unsubscribeMutation.mutateAsync,
    resubscribe: resubscribeMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

export function useImportSubscribers(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SubscriberImportRequest) => emailMarketingApi.subscribers.import(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers", workspaceId] });
    },
  });
}

export function useExportSubscribers(workspaceId: string | null) {
  return useMutation({
    mutationFn: (params?: { status?: SubscriberStatus }) => emailMarketingApi.subscribers.export(workspaceId!, params),
    onSuccess: () => {
      toast.success("Subscribers exported");
    },
    onError: () => {
      toast.error("Failed to export subscribers");
    },
  });
}

// ==================== Sending Pools ====================

/**
 * The API's own message, when it has one. These endpoints refuse with reasons
 * worth reading — "3 campaign(s) still send through 'Marketing'" is actionable in
 * a way that "Could not delete the pool" is not.
 */
function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

/**
 * A sending pool spreads a campaign across several domains, picking one per
 * recipient by the pool's strategy — how you keep one domain's reputation from
 * sinking a whole send, and how transactional mail stays off the marketing domain.
 *
 * The endpoints have existed since the multi-domain infrastructure landed and no
 * client code had ever called them, so a pool could only be created with curl.
 */
export function useSendingPools(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const key = ["sendingPools", workspaceId];

  const { data: pools, isLoading, error, refetch } = useQuery<SendingPoolSummary[]>({
    queryKey: key,
    queryFn: () => emailInfrastructureApi.pools.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    // A pool change can change whether a campaign can send at all, and that
    // verdict is resolved server-side onto the campaign payload.
    queryClient.invalidateQueries({ queryKey: ["emailCampaigns", workspaceId] });
  };

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof emailInfrastructureApi.pools.create>[1]) =>
      emailInfrastructureApi.pools.create(workspaceId!, data),
    onSuccess: () => {
      invalidate();
      toast.success("Sending pool created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not create the pool")),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      poolId,
      data,
    }: {
      poolId: string;
      data: Parameters<typeof emailInfrastructureApi.pools.update>[2];
    }) => emailInfrastructureApi.pools.update(workspaceId!, poolId, data),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not update the pool")),
  });

  const deleteMutation = useMutation({
    mutationFn: (poolId: string) => emailInfrastructureApi.pools.delete(workspaceId!, poolId),
    onSuccess: () => {
      invalidate();
      toast.success("Sending pool deleted");
    },
    // The backend refuses while a campaign still routes through the pool, and
    // that reason is the useful thing to show.
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not delete the pool")),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({
      poolId,
      data,
    }: {
      poolId: string;
      data: { domain_id: string; weight?: number; priority?: number };
    }) => emailInfrastructureApi.pools.addMember(workspaceId!, poolId, data),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not add the domain")),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ poolId, domainId }: { poolId: string; domainId: string }) =>
      emailInfrastructureApi.pools.removeMember(workspaceId!, poolId, domainId),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not remove the domain")),
  });

  return {
    pools: pools ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createPool: createMutation.mutateAsync,
    updatePool: updateMutation.mutateAsync,
    deletePool: deleteMutation.mutateAsync,
    addMember: addMemberMutation.mutateAsync,
    removeMember: removeMemberMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/** One pool with its member rows — `GET /pools` returns only a count. */
export function useSendingPool(workspaceId: string | null, poolId: string | null) {
  return useQuery<SendingPool>({
    queryKey: ["sendingPool", workspaceId, poolId],
    queryFn: () => emailInfrastructureApi.pools.get(workspaceId!, poolId!),
    enabled: !!workspaceId && !!poolId,
  });
}
