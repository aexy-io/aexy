"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  insightsApi,
  DeveloperInsightsResponse,
  DeveloperSnapshotResponse,
  TeamInsightsResponse,
  LeaderboardResponse,
  InsightsPeriodType,
  PercentileRankingsResponse,
  AlertRuleData,
  AlertHistoryData,
} from "@/lib/api";

export function useDeveloperInsights(
  workspaceId: string | null,
  developerId: string | null,
  params?: {
    period_type?: InsightsPeriodType;
    start_date?: string;
    end_date?: string;
    compare_previous?: boolean;
  }
) {
  const {
    data: insights,
    isLoading,
    error,
    refetch,
  } = useQuery<DeveloperInsightsResponse>({
    queryKey: ["developerInsights", workspaceId, developerId, params],
    queryFn: () => insightsApi.getDeveloperInsights(workspaceId!, developerId!, params),
    enabled: !!workspaceId && !!developerId,
  });

  return { insights, isLoading, error, refetch };
}

export function useDeveloperTrends(
  workspaceId: string | null,
  developerId: string | null,
  params?: { period_type?: InsightsPeriodType; limit?: number }
) {
  const {
    data: trends,
    isLoading,
    error,
  } = useQuery<DeveloperSnapshotResponse[]>({
    queryKey: ["developerTrends", workspaceId, developerId, params],
    queryFn: () => insightsApi.getDeveloperTrends(workspaceId!, developerId!, params),
    enabled: !!workspaceId && !!developerId,
  });

  return { trends: trends || [], isLoading, error };
}

export function useTeamInsights(
  workspaceId: string | null,
  params?: {
    team_id?: string;
    period_type?: InsightsPeriodType;
    start_date?: string;
    end_date?: string;
  }
) {
  const {
    data: teamInsights,
    isLoading,
    error,
    refetch,
  } = useQuery<TeamInsightsResponse>({
    queryKey: ["teamInsights", workspaceId, params],
    queryFn: () => insightsApi.getTeamInsights(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return { teamInsights, isLoading, error, refetch };
}

export function useLeaderboard(
  workspaceId: string | null,
  params?: {
    metric?: string;
    team_id?: string;
    period_type?: InsightsPeriodType;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }
) {
  const {
    data: leaderboard,
    isLoading,
    error,
  } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", workspaceId, params],
    queryFn: () => insightsApi.getLeaderboard(workspaceId!, params),
    enabled: !!workspaceId,
  });

  return { leaderboard, isLoading, error };
}

export function useProjectInsights(
  workspaceId: string | null,
  projectId: string | null,
  params?: {
    period_type?: InsightsPeriodType;
    start_date?: string;
    end_date?: string;
  }
) {
  const {
    data: projectInsights,
    isLoading,
    error,
  } = useQuery<TeamInsightsResponse>({
    queryKey: ["projectInsights", workspaceId, projectId, params],
    queryFn: () => insightsApi.getProjectInsights(workspaceId!, projectId!, params),
    enabled: !!workspaceId && !!projectId,
  });

  return { projectInsights, isLoading, error };
}

export function useDeveloperPercentile(
  workspaceId: string | null,
  developerId: string | null,
  params?: {
    team_id?: string;
    period_type?: InsightsPeriodType;
  }
) {
  const {
    data: percentile,
    isLoading,
    error,
  } = useQuery<PercentileRankingsResponse>({
    queryKey: ["developerPercentile", workspaceId, developerId, params],
    queryFn: () => insightsApi.getDeveloperPercentile(workspaceId!, developerId!, params),
    enabled: !!workspaceId && !!developerId,
  });

  return { percentile, isLoading, error };
}

export function useGenerateSnapshots(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: {
      period_type?: InsightsPeriodType;
      start_date: string;
      end_date: string;
      developer_ids?: string[];
      team_id?: string;
    }) => insightsApi.generateSnapshots(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamInsights", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["developerInsights"] });
      queryClient.invalidateQueries({ queryKey: ["developerTrends"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", workspaceId] });
    },
  });

  return {
    generateSnapshots: mutation.mutateAsync,
    isGenerating: mutation.isPending,
  };
}

export function useAlertRules(workspaceId: string | null, activeOnly?: boolean) {
  const queryClient = useQueryClient();

  const { data: rules, isLoading, error, refetch } = useQuery<AlertRuleData[]>({
    queryKey: ["alertRules", workspaceId, activeOnly],
    queryFn: () => insightsApi.listAlertRules(workspaceId!, activeOnly),
    enabled: !!workspaceId,
  });

  const createRule = useMutation({
    mutationFn: (data: Omit<AlertRuleData, "id" | "workspace_id" | "created_by_id" | "created_at" | "updated_at">) =>
      insightsApi.createAlertRule(workspaceId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertRules", workspaceId] }),
  });

  const updateRule = useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<Omit<AlertRuleData, "id" | "workspace_id" | "created_by_id" | "created_at" | "updated_at">> }) =>
      insightsApi.updateAlertRule(workspaceId!, ruleId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertRules", workspaceId] }),
  });

  const deleteRule = useMutation({
    mutationFn: (ruleId: string) => insightsApi.deleteAlertRule(workspaceId!, ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertRules", workspaceId] }),
  });

  const seedTemplates = useMutation({
    mutationFn: () => insightsApi.seedAlertTemplates(workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertRules", workspaceId] }),
  });

  return {
    rules: rules || [],
    isLoading,
    error,
    refetch,
    createRule: createRule.mutateAsync,
    updateRule: updateRule.mutateAsync,
    deleteRule: deleteRule.mutateAsync,
    seedTemplates: seedTemplates.mutateAsync,
    isSeeding: seedTemplates.isPending,
  };
}

export function useAlertHistory(
  workspaceId: string | null,
  params?: { status?: string; limit?: number }
) {
  const queryClient = useQueryClient();

  const { data: history, isLoading, error } = useQuery<AlertHistoryData[]>({
    queryKey: ["alertHistory", workspaceId, params],
    queryFn: () => insightsApi.listAlertHistory(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const acknowledgeAlert = useMutation({
    mutationFn: (alertId: string) => insightsApi.acknowledgeAlert(workspaceId!, alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertHistory", workspaceId] }),
  });

  const evaluateAlerts = useMutation({
    mutationFn: (evalParams?: { period_type?: InsightsPeriodType }) =>
      insightsApi.evaluateAlerts(workspaceId!, evalParams),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertHistory", workspaceId] }),
  });

  return {
    history: history || [],
    isLoading,
    error,
    acknowledgeAlert: acknowledgeAlert.mutateAsync,
    evaluateAlerts: evaluateAlerts.mutateAsync,
    isEvaluating: evaluateAlerts.isPending,
  };
}
