import { useState, useEffect, useCallback } from "react";
import {
  reviewsApi,
  ReviewCycle,
  ReviewCycleDetail,
  IndividualReview,
  IndividualReviewDetail,
  ReviewRequest,
  WorkGoal,
  WorkGoalDetail,
  ContributionSummary,
  ContributionHighlight,
  GoalSuggestion,
  GoalType,
  GoalPriority,
} from "@/lib/api";

// ============ Review Cycles Hooks ============

export function useReviewCycles(workspaceId: string | null | undefined, status?: string) {
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCycles = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.listCycles(workspaceId, status);
      setCycles(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch review cycles:", err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, status]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  return { cycles, isLoading, error, refetch: fetchCycles };
}

export function useReviewCycle(cycleId: string | null | undefined) {
  const [cycle, setCycle] = useState<ReviewCycleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCycle = useCallback(async () => {
    if (!cycleId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getCycle(cycleId);
      setCycle(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch review cycle:", err);
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchCycle();
  }, [fetchCycle]);

  return { cycle, isLoading, error, refetch: fetchCycle };
}

// ============ Individual Reviews Hooks ============

export function useMyReviews(developerId: string | null | undefined, status?: string) {
  const [reviews, setReviews] = useState<IndividualReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getMyReviews(developerId, status);
      setReviews(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch my reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId, status]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, isLoading, error, refetch: fetchReviews };
}

export function useManagerReviews(managerId: string | null | undefined) {
  const [reviews, setReviews] = useState<IndividualReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!managerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getManagerReviews(managerId);
      setReviews(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch manager reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, isLoading, error, refetch: fetchReviews };
}

export function useReviewDetail(reviewId: string | null | undefined) {
  const [review, setReview] = useState<IndividualReviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchReview = useCallback(async () => {
    if (!reviewId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getReview(reviewId);
      setReview(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch review detail:", err);
    } finally {
      setIsLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  return { review, isLoading, error, refetch: fetchReview };
}

// ============ Peer Requests Hooks ============

export function usePendingPeerRequests(reviewerId: string | null | undefined) {
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!reviewerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getPendingPeerRequests(reviewerId);
      setRequests(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch peer requests:", err);
    } finally {
      setIsLoading(false);
    }
  }, [reviewerId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return { requests, isLoading, error, refetch: fetchRequests };
}

// ============ Goals Hooks ============

export function useGoals(
  developerId: string | null | undefined,
  params?: {
    workspace_id?: string;
    status?: string;
    goal_type?: string;
    review_cycle_id?: string;
  }
) {
  const [goals, setGoals] = useState<WorkGoal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGoals = useCallback(async () => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.listGoals(developerId, params);
      setGoals(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch goals:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId, params?.workspace_id, params?.status, params?.goal_type, params?.review_cycle_id]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = useCallback(async (
    workspaceId: string,
    data: {
      title: string;
      description?: string;
      specific?: string;
      measurable?: string;
      achievable?: string;
      relevant?: string;
      time_bound?: string;
      goal_type: GoalType;
      priority: GoalPriority;
      is_private?: boolean;
      key_results?: Array<{ description: string; target: number; unit: string }>;
      tracking_keywords?: string[];
      review_cycle_id?: string;
      learning_milestone_id?: string;
    }
  ) => {
    if (!developerId) throw new Error("Developer ID required");
    const goal = await reviewsApi.createGoal(developerId, workspaceId, data);
    setGoals(prev => [goal, ...prev]);
    return goal;
  }, [developerId]);

  const updateGoal = useCallback(async (goalId: string, data: Partial<WorkGoal>) => {
    const goal = await reviewsApi.updateGoal(goalId, data);
    setGoals(prev => prev.map(g => g.id === goalId ? goal : g));
    return goal;
  }, []);

  const deleteGoal = useCallback(async (goalId: string) => {
    // Note: API doesn't have delete endpoint, mark as cancelled instead
    const goal = await reviewsApi.updateGoal(goalId, { status: "cancelled" });
    setGoals(prev => prev.filter(g => g.id !== goalId));
    return goal;
  }, []);

  return {
    goals,
    isLoading,
    error,
    refetch: fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
  };
}

export function useGoalDetail(goalId: string | null | undefined) {
  const [goal, setGoal] = useState<WorkGoalDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGoal = useCallback(async () => {
    if (!goalId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getGoal(goalId);
      setGoal(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch goal detail:", err);
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  const updateProgress = useCallback(async (
    progressPercentage: number,
    keyResultUpdates?: Array<{ id: string; current: number }>
  ) => {
    if (!goalId) throw new Error("Goal ID required");
    const updated = await reviewsApi.updateGoalProgress(goalId, {
      progress_percentage: progressPercentage,
      key_result_updates: keyResultUpdates,
    });
    setGoal(prev => prev ? { ...prev, ...updated } : null);
    return updated;
  }, [goalId]);

  const autoLink = useCallback(async () => {
    if (!goalId) throw new Error("Goal ID required");
    const result = await reviewsApi.autoLinkContributions(goalId);
    await fetchGoal(); // Refresh to get updated linked contributions
    return result;
  }, [goalId, fetchGoal]);

  const complete = useCallback(async (finalNotes?: string) => {
    if (!goalId) throw new Error("Goal ID required");
    const completed = await reviewsApi.completeGoal(goalId, finalNotes);
    setGoal(prev => prev ? { ...prev, ...completed } : null);
    return completed;
  }, [goalId]);

  return { goal, isLoading, error, refetch: fetchGoal, updateProgress, autoLink, complete };
}

export function useGoalSuggestions(developerId: string | null | undefined) {
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getGoalSuggestions(developerId);
      setSuggestions(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch goal suggestions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return { suggestions, isLoading, error, refetch: fetchSuggestions };
}

// ============ Contributions Hooks ============

export function useContributionSummary(
  developerId: string | null | undefined,
  params?: {
    period_start?: string;
    period_end?: string;
    period_type?: string;
  }
) {
  const [summary, setSummary] = useState<ContributionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getContributionSummary(developerId, params);
      setSummary(data);
    } catch (err) {
      setError(err as Error);
      // Don't set error for 404 - just means no summary exists yet
      if ((err as any)?.response?.status !== 404) {
        console.error("Failed to fetch contribution summary:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [developerId, params?.period_start, params?.period_end, params?.period_type]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const generate = useCallback(async (
    periodType: "annual" | "semi_annual" | "quarterly" | "monthly" | "custom" = "annual",
    periodStart?: string,
    periodEnd?: string
  ) => {
    if (!developerId) throw new Error("Developer ID required");
    setIsLoading(true);
    try {
      const data = await reviewsApi.generateContributionSummary(developerId, {
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
      });
      setSummary(data);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, [developerId]);

  return { summary, isLoading, error, refetch: fetchSummary, generate };
}

export function useContributionHighlights(
  developerId: string | null | undefined,
  periodStart: string,
  periodEnd: string,
  limit?: number
) {
  const [highlights, setHighlights] = useState<ContributionHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchHighlights = useCallback(async () => {
    if (!developerId || !periodStart || !periodEnd) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getContributionHighlights(developerId, periodStart, periodEnd, limit);
      setHighlights(data);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch contribution highlights:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId, periodStart, periodEnd, limit]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  return { highlights, isLoading, error, refetch: fetchHighlights };
}

// ============ Combined Stats Hook ============

export function useReviewStats(developerId: string | null | undefined, workspaceId: string | null | undefined) {
  const { goals, isLoading: goalsLoading } = useGoals(developerId, { workspace_id: workspaceId || undefined });
  const { reviews, isLoading: reviewsLoading } = useMyReviews(developerId);
  const { requests, isLoading: requestsLoading } = usePendingPeerRequests(developerId);

  const activeGoals = goals.filter(g => g.status === "active" || g.status === "in_progress");
  const completedGoals = goals.filter(g => g.status === "completed");

  return {
    stats: {
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      pendingReviews: reviews.filter(r => r.status !== "completed" && r.status !== "acknowledged").length,
      pendingPeerRequests: requests.length,
    },
    goals,
    reviews,
    peerRequests: requests,
    isLoading: goalsLoading || reviewsLoading || requestsLoading,
  };
}
