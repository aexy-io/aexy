"use client";

import { useState, useEffect, useCallback } from "react";
import {
  billingApi,
  UsageSummary,
  UsageEstimate,
  BillingHistoryEntry,
  Invoice,
  LimitsUsageSummary,
} from "@/lib/api";

// Usage Summary Hook
export function useUsageSummary() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await billingApi.getUsageSummary();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch usage summary"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Usage Estimate Hook
export function useUsageEstimate() {
  const [data, setData] = useState<UsageEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await billingApi.getUsageEstimate();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch usage estimate"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Billing History Hook
export function useBillingHistory(months: number = 6) {
  const [data, setData] = useState<BillingHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await billingApi.getBillingHistory(months);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch billing history"));
    } finally {
      setIsLoading(false);
    }
  }, [months]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Invoices Hook
export function useInvoices(limit: number = 10) {
  const [data, setData] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await billingApi.getInvoices(limit);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch invoices"));
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Limits Usage Hook
export function useLimitsUsage() {
  const [data, setData] = useState<LimitsUsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await billingApi.getLimitsUsage();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch limits usage"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Usage Warning Types
export type UsageWarningSeverity = "warning" | "critical" | "limit_reached";

export interface UsageWarning {
  severity: UsageWarningSeverity;
  percentage: number;
  resourceName: string;
  message: string;
  ctaText: string;
}

// Usage Warning Helper
export function getUsageWarning(
  percentage: number,
  resourceName: string
): UsageWarning | null {
  if (percentage >= 100) {
    return {
      severity: "limit_reached",
      percentage,
      resourceName,
      message: `You've reached your ${resourceName} limit. Upgrade your plan to continue.`,
      ctaText: "Upgrade Now",
    };
  } else if (percentage >= 90) {
    return {
      severity: "critical",
      percentage,
      resourceName,
      message: `You've used ${Math.round(percentage)}% of your ${resourceName}. Consider upgrading soon.`,
      ctaText: "Upgrade Plan",
    };
  } else if (percentage >= 80) {
    return {
      severity: "warning",
      percentage,
      resourceName,
      message: `You've used ${Math.round(percentage)}% of your ${resourceName}.`,
      ctaText: "View Plans",
    };
  }
  return null;
}

// Token usage specific warning
export interface TokenUsageWarning extends UsageWarning {
  isOverage: boolean;
  overageTokens: number;
  overageCostCents: number;
  freeTokensRemaining: number;
}

// Get token usage warning with overage info
export function getTokenUsageWarning(
  tokensUsed: number,
  freeTokensAllowed: number,
  overageTokens: number,
  overageCostCents: number,
  enableOverageBilling: boolean
): TokenUsageWarning | null {
  const freeTokensRemaining = Math.max(0, freeTokensAllowed - tokensUsed);
  const isOverage = tokensUsed > freeTokensAllowed;
  const percentage = freeTokensAllowed > 0
    ? (Math.min(tokensUsed, freeTokensAllowed) / freeTokensAllowed) * 100
    : 0;

  // If in overage and billing enabled, show overage warning
  if (isOverage && enableOverageBilling) {
    return {
      severity: "warning",
      percentage: 100,
      resourceName: "free tokens",
      message: `You've used all your free tokens. Additional usage: ${formatNumber(overageTokens)} tokens (${formatCurrency(overageCostCents)}).`,
      ctaText: "View Usage",
      isOverage: true,
      overageTokens,
      overageCostCents,
      freeTokensRemaining: 0,
    };
  }

  // If in overage but billing disabled (free plan), show limit reached
  if (isOverage && !enableOverageBilling) {
    return {
      severity: "limit_reached",
      percentage: 100,
      resourceName: "monthly tokens",
      message: `You've reached your monthly token limit. Upgrade to continue using AI features.`,
      ctaText: "Upgrade Now",
      isOverage: true,
      overageTokens: 0,
      overageCostCents: 0,
      freeTokensRemaining: 0,
    };
  }

  // Standard threshold warnings for free tokens
  if (percentage >= 90) {
    return {
      severity: "critical",
      percentage,
      resourceName: "free tokens",
      message: `You've used ${Math.round(percentage)}% of your free monthly tokens. ${formatNumber(freeTokensRemaining)} tokens remaining.`,
      ctaText: enableOverageBilling ? "View Pricing" : "Upgrade Plan",
      isOverage: false,
      overageTokens: 0,
      overageCostCents: 0,
      freeTokensRemaining,
    };
  } else if (percentage >= 80) {
    return {
      severity: "warning",
      percentage,
      resourceName: "free tokens",
      message: `You've used ${Math.round(percentage)}% of your free monthly tokens.`,
      ctaText: "View Usage",
      isOverage: false,
      overageTokens: 0,
      overageCostCents: 0,
      freeTokensRemaining,
    };
  }

  return null;
}

// Combined hook for all usage warnings
export function useUsageWarnings() {
  const { data: limitsData, isLoading } = useLimitsUsage();

  const warnings: UsageWarning[] = [];
  let tokenWarning: TokenUsageWarning | null = null;

  if (limitsData && !limitsData.llm.unlimited) {
    const llmPercentage = (limitsData.llm.used_today / limitsData.llm.limit_per_day) * 100;
    const llmWarning = getUsageWarning(llmPercentage, "daily AI requests");
    if (llmWarning) {
      warnings.push(llmWarning);
    }
  }

  if (limitsData && !limitsData.repos.unlimited) {
    const repoPercentage = (limitsData.repos.used / limitsData.repos.limit) * 100;
    const repoWarning = getUsageWarning(repoPercentage, "repositories");
    if (repoWarning) {
      warnings.push(repoWarning);
    }
  }

  // Check token usage (free tier + overage)
  if (limitsData?.tokens) {
    const tokens = limitsData.tokens;
    tokenWarning = getTokenUsageWarning(
      tokens.tokens_used_this_month,
      tokens.free_tokens_per_month,
      tokens.overage_tokens,
      tokens.overage_cost_cents,
      tokens.enable_overage_billing
    );
    if (tokenWarning) {
      warnings.push(tokenWarning);
    }
  }

  return { warnings, tokenWarning, isLoading };
}

// Format currency helper
export function formatCurrency(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

// Format number helper
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
