"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  learningActivityApi,
  LearningActivityLog,
  LearningActivityLogWithSessions,
  ActivityHistory,
  ActivityStats,
  DailyActivitySummary,
  CreateActivityData,
  UpdateActivityData,
  TimeSession,
  ActivityType,
  ActivitySource,
  ActivityStatus,
} from "@/lib/api";

// List activities for a developer with pagination
export function useLearningActivities(
  developerId: string | null,
  options?: {
    activity_type?: ActivityType;
    source?: ActivitySource;
    status?: ActivityStatus;
    learning_path_id?: string;
    milestone_id?: string;
    page?: number;
    page_size?: number;
  }
) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<ActivityHistory>({
    queryKey: ["learningActivities", developerId, options],
    queryFn: () => learningActivityApi.listActivities(developerId!, options),
    enabled: !!developerId,
  });

  const createMutation = useMutation({
    mutationFn: (activityData: CreateActivityData) =>
      learningActivityApi.createActivity(developerId!, activityData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
      queryClient.invalidateQueries({ queryKey: ["activityStats", developerId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (activityId: string) =>
      learningActivityApi.deleteActivity(activityId, developerId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
      queryClient.invalidateQueries({ queryKey: ["activityStats", developerId] });
    },
  });

  return {
    activities: data?.activities || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pageSize: data?.page_size || 20,
    hasMore: data?.has_more || false,
    isLoading,
    error,
    refetch,
    createActivity: createMutation.mutateAsync,
    deleteActivity: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Get a single activity with time sessions
export function useLearningActivity(
  activityId: string | null,
  developerId: string | null
) {
  const queryClient = useQueryClient();

  const {
    data: activity,
    isLoading,
    error,
    refetch,
  } = useQuery<LearningActivityLogWithSessions>({
    queryKey: ["learningActivity", activityId, developerId],
    queryFn: () => learningActivityApi.getActivity(activityId!, developerId!),
    enabled: !!activityId && !!developerId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateActivityData) =>
      learningActivityApi.updateActivity(activityId!, developerId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () =>
      learningActivityApi.startActivity(activityId!, developerId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
    },
  });

  const progressMutation = useMutation({
    mutationFn: ({ progress_percentage, notes }: { progress_percentage: number; notes?: string }) =>
      learningActivityApi.updateProgress(activityId!, developerId!, progress_percentage, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data?: { rating?: number; notes?: string }) =>
      learningActivityApi.completeActivity(activityId!, developerId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
      queryClient.invalidateQueries({ queryKey: ["activityStats", developerId] });
    },
  });

  // Time session mutations
  const startSessionMutation = useMutation({
    mutationFn: (notes?: string) =>
      learningActivityApi.startTimeSession(activityId!, developerId!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: (notes?: string) =>
      learningActivityApi.endTimeSession(activityId!, developerId!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learningActivity", activityId, developerId] });
      queryClient.invalidateQueries({ queryKey: ["learningActivities", developerId] });
    },
  });

  return {
    activity,
    isLoading,
    error,
    refetch,
    updateActivity: updateMutation.mutateAsync,
    startActivity: startMutation.mutateAsync,
    updateProgress: progressMutation.mutateAsync,
    completeActivity: completeMutation.mutateAsync,
    startTimeSession: startSessionMutation.mutateAsync,
    endTimeSession: endSessionMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isStarting: startMutation.isPending,
    isUpdatingProgress: progressMutation.isPending,
    isCompleting: completeMutation.isPending,
    isStartingSession: startSessionMutation.isPending,
    isEndingSession: endSessionMutation.isPending,
  };
}

// Get activity statistics
export function useActivityStats(developerId: string | null) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<ActivityStats>({
    queryKey: ["activityStats", developerId],
    queryFn: () => learningActivityApi.getStats(developerId!),
    enabled: !!developerId,
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

// Get daily summaries for calendar/heatmap
export function useDailySummaries(developerId: string | null, days?: number) {
  const {
    data: summaries,
    isLoading,
    error,
    refetch,
  } = useQuery<DailyActivitySummary[]>({
    queryKey: ["dailySummaries", developerId, days],
    queryFn: () => learningActivityApi.getDailySummaries(developerId!, days),
    enabled: !!developerId,
  });

  return {
    summaries: summaries || [],
    isLoading,
    error,
    refetch,
  };
}

// Get activities for a specific learning path
export function usePathActivities(pathId: string | null, developerId: string | null) {
  const {
    data: activities,
    isLoading,
    error,
    refetch,
  } = useQuery<LearningActivityLog[]>({
    queryKey: ["pathActivities", pathId, developerId],
    queryFn: () => learningActivityApi.getActivitiesForPath(pathId!, developerId!),
    enabled: !!pathId && !!developerId,
  });

  return {
    activities: activities || [],
    isLoading,
    error,
    refetch,
  };
}

// Get activities for a specific milestone
export function useMilestoneActivities(milestoneId: string | null, developerId: string | null) {
  const {
    data: activities,
    isLoading,
    error,
    refetch,
  } = useQuery<LearningActivityLog[]>({
    queryKey: ["milestoneActivities", milestoneId, developerId],
    queryFn: () => learningActivityApi.getActivitiesForMilestone(milestoneId!, developerId!),
    enabled: !!milestoneId && !!developerId,
  });

  return {
    activities: activities || [],
    isLoading,
    error,
    refetch,
  };
}
