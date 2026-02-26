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
  params?: { page?: number; per_page?: number; status?: string; date_from?: string; date_to?: string; search?: string }
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

// =============================================================================
// ALERTS (#32)
// =============================================================================

export function useGTMAlertConfigs(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmAlertConfigs", workspaceId],
    queryFn: () => gtmApi.alerts.listConfigs(workspaceId!),
    enabled: !!workspaceId,
  });
  return { configs: data || [], isLoading, error, refetch };
}

export function useGTMAlertLogs(workspaceId: string | null, params?: { page?: number; per_page?: number; event_type?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmAlertLogs", workspaceId, params],
    queryFn: () => gtmApi.alerts.listLogs(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { logs: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

// =============================================================================
// ROUTING & SLA (#26)
// =============================================================================

export function useGTMRoutingRules(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmRoutingRules", workspaceId],
    queryFn: () => gtmApi.routing.listRules(workspaceId!),
    enabled: !!workspaceId,
  });
  return { rules: data || [], isLoading, error, refetch };
}

export function useGTMSLADashboard(workspaceId: string | null, days?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmSLADashboard", workspaceId, days],
    queryFn: () => gtmApi.routing.slaDashboard(workspaceId!, days),
    enabled: !!workspaceId,
  });
  return { dashboard: data || null, isLoading, error, refetch };
}

export function useGTMAssignments(workspaceId: string | null, params?: { page?: number; per_page?: number; status?: string; assignee_id?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmAssignments", workspaceId, params],
    queryFn: () => gtmApi.routing.listAssignments(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { assignments: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

// =============================================================================
// HEALTH SCORING (#27)
// =============================================================================

export function useGTMHealthDashboard(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmHealthDashboard", workspaceId],
    queryFn: () => gtmApi.health.dashboard(workspaceId!),
    enabled: !!workspaceId,
  });
  return { dashboard: data || null, isLoading, error, refetch };
}

export function useGTMHealthScores(workspaceId: string | null, params?: { page?: number; per_page?: number; health_status?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmHealthScores", workspaceId, params],
    queryFn: () => gtmApi.health.listScores(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { scores: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

// =============================================================================
// EXPANSION PLAYBOOKS (#28)
// =============================================================================

export function useGTMExpansionPlaybooks(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmExpansionPlaybooks", workspaceId],
    queryFn: () => gtmApi.expansion.listPlaybooks(workspaceId!),
    enabled: !!workspaceId,
  });
  return { playbooks: data || [], isLoading, error, refetch };
}

export function useGTMExpansionAnalytics(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmExpansionAnalytics", workspaceId],
    queryFn: () => gtmApi.expansion.analytics(workspaceId!),
    enabled: !!workspaceId,
  });
  return { analytics: data || null, isLoading, error, refetch };
}

export function useGTMExpansionEnrollments(workspaceId: string | null, params?: { page?: number; per_page?: number; playbook_id?: string; status?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmExpansionEnrollments", workspaceId, params],
    queryFn: () => gtmApi.expansion.listEnrollments(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { enrollments: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

// =============================================================================
// HANDOFFS (#29)
// =============================================================================

export function useGTMHandoffs(workspaceId: string | null, params?: { page?: number; per_page?: number; status?: string; assigned_to?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmHandoffs", workspaceId, params],
    queryFn: () => gtmApi.handoffs.list(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { handoffs: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

export function useGTMHandoffAnalytics(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmHandoffAnalytics", workspaceId],
    queryFn: () => gtmApi.handoffs.analytics(workspaceId!),
    enabled: !!workspaceId,
  });
  return { analytics: data || null, isLoading, error, refetch };
}

// =============================================================================
// INTENT SIGNALS (#25)
// =============================================================================

export function useGTMIntentSignals(workspaceId: string | null, params?: { page?: number; per_page?: number; signal_type?: string; intent_strength?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmIntentSignals", workspaceId, params],
    queryFn: () => gtmApi.intent.listSignals(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { signals: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

export function useGTMIntentSummary(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmIntentSummary", workspaceId],
    queryFn: () => gtmApi.intent.summary(workspaceId!),
    enabled: !!workspaceId,
  });
  return { summary: data || null, isLoading, error, refetch };
}

// =============================================================================
// COMPETITORS (#31)
// =============================================================================

export function useGTMCompetitors(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmCompetitors", workspaceId],
    queryFn: () => gtmApi.competitors.list(workspaceId!),
    enabled: !!workspaceId,
  });
  return { competitors: data || [], isLoading, error, refetch };
}

export function useGTMCompetitor(workspaceId: string | null, competitorId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmCompetitor", workspaceId, competitorId],
    queryFn: () => gtmApi.competitors.get(workspaceId!, competitorId!),
    enabled: !!workspaceId && !!competitorId,
  });
  return { competitor: data, isLoading, error, refetch };
}

export function useGTMCompetitorChanges(workspaceId: string | null, params?: { page?: number; per_page?: number; competitor_id?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmCompetitorChanges", workspaceId, params],
    queryFn: () => gtmApi.competitors.listChanges(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { changes: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

export function useGTMBattleCard(workspaceId: string | null, competitorId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmBattleCard", workspaceId, competitorId],
    queryFn: () => gtmApi.competitors.getBattleCard(workspaceId!, competitorId!),
    enabled: !!workspaceId && !!competitorId,
  });
  return { battleCard: data, isLoading, error, refetch };
}

// =============================================================================
// SEO AUDIT (#18)
// =============================================================================

export function useGTMSEOAudits(workspaceId: string | null, params?: { page?: number; per_page?: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmSEOAudits", workspaceId, params],
    queryFn: () => gtmApi.seo.listAudits(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { audits: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

export function useGTMSEOAudit(workspaceId: string | null, auditId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmSEOAudit", workspaceId, auditId],
    queryFn: () => gtmApi.seo.getAudit(workspaceId!, auditId!),
    enabled: !!workspaceId && !!auditId,
  });
  return { audit: data, isLoading, error, refetch };
}

// =============================================================================
// CONTENT GAP ANALYSIS (#19)
// =============================================================================

export function useGTMContentAnalyses(workspaceId: string | null, params?: { page?: number; per_page?: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmContentAnalyses", workspaceId, params],
    queryFn: () => gtmApi.contentGap.listAnalyses(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { analyses: data?.items || [], total: data?.total || 0, isLoading, error, refetch };
}

// =============================================================================
// ABM (#30)
// =============================================================================

export function useGTMABMOverview(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmABMOverview", workspaceId],
    queryFn: () => gtmApi.abm.overview(workspaceId!),
    enabled: !!workspaceId,
  });
  return { overview: data || null, isLoading, error, refetch };
}

export function useGTMABMTargetLists(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmABMTargetLists", workspaceId],
    queryFn: () => gtmApi.abm.listLists(workspaceId!),
    enabled: !!workspaceId,
  });
  return { lists: data || [], isLoading, error, refetch };
}

export function useGTMABMAccounts(workspaceId: string | null, params?: { page?: number; per_page?: number; target_list_id?: string; tier?: string; stage?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gtmABMAccounts", workspaceId, params],
    queryFn: () => gtmApi.abm.listAccounts(workspaceId!, params),
    enabled: !!workspaceId,
  });
  return { accounts: data?.items || data?.accounts || [], total: data?.total || 0, isLoading, error, refetch };
}
