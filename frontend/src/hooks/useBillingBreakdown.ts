import { useQuery } from "@tanstack/react-query";

import {
  billingApi,
  platformAdminBillingApi,
  type BillingBreakdown,
  type BillingBreakdownHistory,
  type PlatformBillingSummary,
  type PlatformBillingTotals,
} from "@/lib/api";

export function useBillingBreakdown(
  workspaceId: string | undefined,
  period: string = "current",
) {
  return useQuery<BillingBreakdown>({
    queryKey: ["billing-breakdown", workspaceId, period],
    queryFn: () => billingApi.getBreakdown(workspaceId!, period),
    enabled: !!workspaceId,
  });
}

export function useBillingBreakdownHistory(
  workspaceId: string | undefined,
  months: number = 6,
) {
  return useQuery<BillingBreakdownHistory>({
    queryKey: ["billing-breakdown-history", workspaceId, months],
    queryFn: () => billingApi.getBreakdownHistory(workspaceId!, months),
    enabled: !!workspaceId,
  });
}

export function usePlatformBillingBreakdown(
  workspaceId: string | undefined,
  period: string = "current",
) {
  return useQuery<BillingBreakdown>({
    queryKey: ["platform-billing-breakdown", workspaceId, period],
    queryFn: () => platformAdminBillingApi.getBreakdown(workspaceId!, period),
    enabled: !!workspaceId,
  });
}

export function usePlatformBillingBreakdownHistory(
  workspaceId: string | undefined,
  months: number = 6,
) {
  return useQuery<BillingBreakdownHistory>({
    queryKey: ["platform-billing-breakdown-history", workspaceId, months],
    queryFn: () =>
      platformAdminBillingApi.getBreakdownHistory(workspaceId!, months),
    enabled: !!workspaceId,
  });
}

export function usePlatformBillingSummary(params: {
  page?: number;
  per_page?: number;
  plan_tier?: string;
  billing_model?: string;
  search?: string;
}) {
  return useQuery<PlatformBillingSummary>({
    queryKey: ["platform-billing-summary", params],
    queryFn: () => platformAdminBillingApi.getSummary(params),
  });
}

export function usePlatformBillingTotals(period: string = "current") {
  return useQuery<PlatformBillingTotals>({
    queryKey: ["platform-billing-totals", period],
    queryFn: () => platformAdminBillingApi.getTotals(period),
  });
}
