"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  gtmApi,
  GTMDashboardOverview,
  FunnelStageData,
  RecentVisitorRow,
  VisitorListResponse,
  VisitorSessionDetail,
  ScoringOverview,
  ScoredLeadListResponse,
  OutreachSequence,
  OutreachEnrollment,
  SequenceAnalytics,
  PipelineAnalytics,
  ChannelAnalytics,
  AttributionAnalytics,
  SequenceComparisonAnalytics,
  TrendAnalytics,
  ReplyClassificationStats,
} from "@/lib/api";

export function useGTMDashboard(workspaceId: string | null, days: number = 30) {
  const overview = useQuery<GTMDashboardOverview>({
    queryKey: ["gtmDashboard", workspaceId, days],
    queryFn: () => gtmApi.dashboard.overview(workspaceId!, days),
    enabled: !!workspaceId,
  });

  const funnel = useQuery<FunnelStageData[]>({
    queryKey: ["gtmFunnel", workspaceId, days],
    queryFn: () => gtmApi.dashboard.funnel(workspaceId!, days),
    enabled: !!workspaceId,
  });

  const recentVisitors = useQuery<RecentVisitorRow[]>({
    queryKey: ["gtmRecentVisitors", workspaceId],
    queryFn: () => gtmApi.dashboard.recentVisitors(workspaceId!, 10),
    enabled: !!workspaceId,
  });

  return {
    overview: overview.data,
    overviewLoading: overview.isLoading,
    overviewError: overview.error,
    funnel: funnel.data,
    funnelLoading: funnel.isLoading,
    recentVisitors: recentVisitors.data || [],
    recentVisitorsLoading: recentVisitors.isLoading,
    refetch: () => {
      overview.refetch();
      funnel.refetch();
      recentVisitors.refetch();
    },
  };
}

export function useGTMVisitors(
  workspaceId: string | null,
  params?: { page?: number; per_page?: number; status?: string; date_from?: string; date_to?: string }
) {
  const { data, isLoading, error, refetch } = useQuery<VisitorListResponse>({
    queryKey: ["gtmVisitors", workspaceId, params],
    queryFn: () => gtmApi.visitors.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return {
    sessions: data?.sessions || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 20,
    isLoading,
    error,
    refetch,
  };
}

export function useGTMVisitorDetail(workspaceId: string | null, sessionId: string | null) {
  const { data, isLoading, error, refetch } = useQuery<VisitorSessionDetail>({
    queryKey: ["gtmVisitorDetail", workspaceId, sessionId],
    queryFn: () => gtmApi.visitors.get(workspaceId!, sessionId!),
    enabled: !!workspaceId && !!sessionId,
  });

  return {
    session: data,
    isLoading,
    error,
    refetch,
  };
}

export function useGTMScoringOverview(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery<ScoringOverview>({
    queryKey: ["gtmScoringOverview", workspaceId],
    queryFn: () => gtmApi.scoring.overview(workspaceId!),
    enabled: !!workspaceId,
  });

  return {
    overview: data,
    isLoading,
    error,
    refetch,
  };
}

export function useGTMScoredLeads(
  workspaceId: string | null,
  params?: { page?: number; per_page?: number; min_score?: number; max_score?: number; lifecycle_stage?: string; sort_by?: string; sort_dir?: string }
) {
  const { data, isLoading, error, refetch } = useQuery<ScoredLeadListResponse>({
    queryKey: ["gtmScoredLeads", workspaceId, params],
    queryFn: () => gtmApi.scoring.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return {
    leads: data?.leads || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 25,
    isLoading,
    error,
    refetch,
  };
}

// =============================================================================
// OUTREACH SEQUENCES
// =============================================================================

export function useOutreachSequences(
  workspaceId: string | null,
  params?: { status?: string; page?: number; per_page?: number }
) {
  const { data, isLoading, error, refetch } = useQuery<{
    items: OutreachSequence[]; total: number; page: number; per_page: number;
  }>({
    queryKey: ["outreachSequences", workspaceId, params],
    queryFn: () => gtmApi.sequences.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return {
    sequences: data?.items || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 25,
    isLoading,
    error,
    refetch,
  };
}

export function useOutreachSequence(workspaceId: string | null, sequenceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery<OutreachSequence>({
    queryKey: ["outreachSequence", workspaceId, sequenceId],
    queryFn: () => gtmApi.sequences.get(workspaceId!, sequenceId!),
    enabled: !!workspaceId && !!sequenceId,
  });

  return { sequence: data, isLoading, error, refetch };
}

export function useSequenceEnrollments(
  workspaceId: string | null,
  sequenceId: string | null,
  params?: { status?: string; page?: number; per_page?: number }
) {
  const { data, isLoading, error, refetch } = useQuery<{
    items: OutreachEnrollment[]; total: number; page: number; per_page: number;
  }>({
    queryKey: ["sequenceEnrollments", workspaceId, sequenceId, params],
    queryFn: () => gtmApi.sequences.listEnrollments(workspaceId!, sequenceId!, params),
    enabled: !!workspaceId && !!sequenceId,
  });

  return {
    enrollments: data?.items || [],
    total: data?.total || 0,
    page: data?.page || 1,
    perPage: data?.per_page || 25,
    isLoading,
    error,
    refetch,
  };
}

export function useSequenceAnalytics(workspaceId: string | null, sequenceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery<SequenceAnalytics>({
    queryKey: ["sequenceAnalytics", workspaceId, sequenceId],
    queryFn: () => gtmApi.sequences.analytics(workspaceId!, sequenceId!),
    enabled: !!workspaceId && !!sequenceId,
  });

  return { analytics: data, isLoading, error, refetch };
}

export function useSequenceMutations(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["outreachSequences", workspaceId] });
  };

  const createSequence = useMutation({
    mutationFn: (data: { name: string; description?: string }) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return gtmApi.sequences.create(workspaceId, data);
    },
    onSuccess: invalidate,
  });

  const activateSequence = useMutation({
    mutationFn: (sequenceId: string) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return gtmApi.sequences.activate(workspaceId, sequenceId);
    },
    onSuccess: invalidate,
  });

  const pauseSequence = useMutation({
    mutationFn: (sequenceId: string) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return gtmApi.sequences.pause(workspaceId, sequenceId);
    },
    onSuccess: invalidate,
  });

  const deleteSequence = useMutation({
    mutationFn: (sequenceId: string) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return gtmApi.sequences.delete(workspaceId, sequenceId);
    },
    onSuccess: invalidate,
  });

  const enrollContact = useMutation({
    mutationFn: ({ sequenceId, data }: { sequenceId: string; data: { record_id: string; email: string; contact_name?: string } }) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return gtmApi.sequences.enroll(workspaceId, sequenceId, data);
    },
  });

  return { createSequence, activateSequence, pauseSequence, deleteSequence, enrollContact };
}

// =============================================================================
// GTM ANALYTICS
// =============================================================================

export function useGTMAnalytics(
  workspaceId: string | null,
  params?: { days?: number; attribution_model?: string }
) {
  const days = params?.days || 30;
  const model = params?.attribution_model || "linear";

  const pipeline = useQuery<PipelineAnalytics>({
    queryKey: ["gtmAnalyticsPipeline", workspaceId, days],
    queryFn: () => gtmApi.analytics.pipeline(workspaceId!, days),
    enabled: !!workspaceId,
  });

  const channels = useQuery<ChannelAnalytics>({
    queryKey: ["gtmAnalyticsChannels", workspaceId, days],
    queryFn: () => gtmApi.analytics.channels(workspaceId!, days),
    enabled: !!workspaceId,
  });

  const attribution = useQuery<AttributionAnalytics>({
    queryKey: ["gtmAnalyticsAttribution", workspaceId, model, days],
    queryFn: () => gtmApi.analytics.attribution(workspaceId!, model, days),
    enabled: !!workspaceId,
  });

  const sequences = useQuery<SequenceComparisonAnalytics>({
    queryKey: ["gtmAnalyticsSequences", workspaceId, days],
    queryFn: () => gtmApi.analytics.sequences(workspaceId!, days),
    enabled: !!workspaceId,
  });

  const trends = useQuery<TrendAnalytics>({
    queryKey: ["gtmAnalyticsTrends", workspaceId, days],
    queryFn: () => gtmApi.analytics.trends(workspaceId!, days),
    enabled: !!workspaceId,
  });

  return {
    pipeline: pipeline.data,
    channels: channels.data,
    attribution: attribution.data,
    sequences: sequences.data,
    trends: trends.data,
    isLoading: pipeline.isLoading || channels.isLoading || sequences.isLoading || trends.isLoading || attribution.isLoading,
    refetch: () => {
      pipeline.refetch();
      channels.refetch();
      attribution.refetch();
      sequences.refetch();
      trends.refetch();
    },
  };
}

// =============================================================================
// REPLY CLASSIFICATION
// =============================================================================

export function useReplyStats(workspaceId: string | null, days = 30) {
  return useQuery<ReplyClassificationStats>({
    queryKey: ['gtm', workspaceId, 'reply-stats', days],
    queryFn: () => gtmApi.replies.getStats(workspaceId!, days),
    enabled: !!workspaceId,
  });
}
