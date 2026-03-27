"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  const hasSubscription = subscriptionStatus?.subscription != null;

  // Billing model
  const billingModel = subscriptionStatus?.billing_model || plan?.billing_model || "free";
  const isPerSeat = billingModel === "per_seat";
  const isFlatPlusUsage = billingModel === "flat_plus_usage";
  const isPostpaid = billingModel === "postpaid";

  // Feature access checks — all modules are now available on free tier
  const canUseTeamFeatures = plan?.enable_team_features ?? true;
  const canUseAdvancedAnalytics = plan?.enable_advanced_analytics ?? true;
  const canUseExports = plan?.enable_exports ?? true;
  const canUseWebhooks = plan?.enable_webhooks ?? true;
  const canUseRealTimeSync = plan?.enable_real_time_sync ?? true;

  // AI access — limited on free tier
  const freeTokensPerMonth = plan?.free_llm_tokens_per_month ?? 50000;
  const canUseAI = (plan?.llm_requests_per_day ?? 50) > 0;
  const aiProviders = plan?.llm_provider_access ?? ["ollama"];

  // Premium feature checks (Pro or Enterprise)
  const isPremium = tier === "pro" || tier === "enterprise";
  const isEnterprise = tier === "enterprise";

  // Seat info (for per-seat plans)
  const seatSummary = subscriptionStatus?.seat_summary ?? null;

  // Postpaid info
  const postpaidSummary = subscriptionStatus?.postpaid_summary ?? null;

  return {
    // Raw data
    subscriptionStatus,
    plan,
    tier,
    hasSubscription,

    // Loading state
    isLoading,
    error,
    refetch,

    // Billing model
    billingModel,
    isPerSeat,
    isFlatPlusUsage,
    isPostpaid,

    // Feature access (all modules available on all tiers)
    canUseTeamFeatures,
    canUseAdvancedAnalytics,
    canUseExports,
    canUseWebhooks,
    canUseRealTimeSync,

    // AI access (limited on free tier)
    canUseAI,
    aiProviders,
    freeTokensPerMonth,

    // Tier checks
    isPremium,
    isEnterprise,
    isFree: tier === "free",

    // Limits
    maxRepos: plan?.max_repos ?? 10,
    maxCommitsPerRepo: plan?.max_commits_per_repo ?? 1000,
    maxPrsPerRepo: plan?.max_prs_per_repo ?? 200,
    llmRequestsPerDay: plan?.llm_requests_per_day ?? 50,

    // Seat info (per-seat plans)
    seatSummary,

    // Postpaid info
    postpaidSummary,
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

// Hook for changing subscription plan (only for users with an existing Stripe subscription)
export function useChangePlan(workspaceId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planTier: string) =>
      billingApi.changePlan({
        plan_tier: planTier,
        workspace_id: workspaceId || undefined,
      }),
    onSuccess: () => {
      toast.success("Plan changed successfully");
      // Invalidate subscription status to refetch the new plan
      queryClient.invalidateQueries({ queryKey: ["subscriptionStatus", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["subscriptionStatus"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to change plan");
    },
  });
}

// Hook for creating a Stripe Checkout session (for users without a subscription, e.g. Free -> Pro)
export function useCheckout() {
  return useMutation({
    mutationFn: ({
      planTier,
      workspaceId,
      billingModel,
      seatCount,
    }: {
      planTier: string;
      workspaceId?: string;
      billingModel?: string;
      seatCount?: number;
    }) =>
      billingApi.createCheckoutSession({
        plan_tier: planTier,
        billing_model: billingModel,
        success_url: `${window.location.origin}/settings/plans?checkout=success`,
        cancel_url: `${window.location.origin}/settings/plans?checkout=cancelled`,
        workspace_id: workspaceId,
        seat_count: seatCount,
      }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout");
    },
  });
}
