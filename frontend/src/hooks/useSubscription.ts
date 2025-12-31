"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi, SubscriptionStatus, PlanFeatures } from "@/lib/api";

export function useSubscription(workspaceId?: string | null) {
  const {
    data: subscriptionStatus,
    isLoading,
    error,
    refetch,
  } = useQuery<SubscriptionStatus>({
    queryKey: ["subscriptionStatus", workspaceId],
    queryFn: () => billingApi.getSubscriptionStatus(workspaceId || undefined),
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });

  const plan = subscriptionStatus?.plan;
  const tier = plan?.tier || "free";

  // Feature access checks
  const canUseTeamFeatures = plan?.enable_team_features ?? false;
  const canUseAdvancedAnalytics = plan?.enable_advanced_analytics ?? false;
  const canUseExports = plan?.enable_exports ?? false;
  const canUseWebhooks = plan?.enable_webhooks ?? false;
  const canUseRealTimeSync = plan?.enable_real_time_sync ?? false;

  // Premium feature checks (Pro or Enterprise)
  const isPremium = tier === "pro" || tier === "enterprise";
  const isEnterprise = tier === "enterprise";

  return {
    // Raw data
    subscriptionStatus,
    plan,
    tier,

    // Loading state
    isLoading,
    error,
    refetch,

    // Feature access
    canUseTeamFeatures,
    canUseAdvancedAnalytics,
    canUseExports,
    canUseWebhooks,
    canUseRealTimeSync,

    // Tier checks
    isPremium,
    isEnterprise,
    isFree: tier === "free",

    // Limits
    maxRepos: plan?.max_repos ?? 3,
    maxCommitsPerRepo: plan?.max_commits_per_repo ?? 1000,
    maxPrsPerRepo: plan?.max_prs_per_repo ?? 100,
    llmRequestsPerDay: plan?.llm_requests_per_day ?? 10,
  };
}

// Hook for fetching available plans (for upgrade flow)
export function usePlans() {
  const {
    data: plans,
    isLoading,
    error,
  } = useQuery<PlanFeatures[]>({
    queryKey: ["plans"],
    queryFn: billingApi.getPlans,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  return {
    plans: plans || [],
    isLoading,
    error,
  };
}
