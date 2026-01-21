"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  platformAdminApi,
  AdminDashboardStats,
  PaginatedAdminEmailLogs,
  PaginatedAdminNotifications,
  PaginatedAdminWorkspaces,
  PaginatedAdminUsers,
  EmailListParams,
  AdminEmailLog,
  ResendEmailResponse,
} from "@/lib/api";

/**
 * Hook to check if the current user is a platform admin.
 */
export function useAdmin() {
  const { user, isLoading: isAuthLoading } = useAuth();

  const {
    data: adminCheck,
    isLoading: isCheckLoading,
    error,
  } = useQuery({
    queryKey: ["admin-check"],
    queryFn: () => platformAdminApi.checkAdmin(),
    enabled: !!user && !isAuthLoading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  return {
    isAdmin: adminCheck?.is_admin ?? false,
    isLoading: isAuthLoading || isCheckLoading,
    error,
  };
}

/**
 * Hook to fetch admin dashboard statistics.
 */
export function useAdminDashboardStats() {
  const { isAdmin } = useAdmin();

  return useQuery<AdminDashboardStats>({
    queryKey: ["admin-dashboard-stats"],
    queryFn: () => platformAdminApi.getDashboardStats(),
    enabled: isAdmin,
    staleTime: 60 * 1000, // Cache for 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

/**
 * Hook to fetch admin email logs.
 */
export function useAdminEmailLogs(params?: EmailListParams) {
  const { isAdmin } = useAdmin();

  return useQuery<PaginatedAdminEmailLogs>({
    queryKey: ["admin-email-logs", params],
    queryFn: () => platformAdminApi.getEmailLogs(params),
    enabled: isAdmin,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Hook to fetch a single email log.
 */
export function useAdminEmailLog(emailId: string | null) {
  const { isAdmin } = useAdmin();

  return useQuery<AdminEmailLog>({
    queryKey: ["admin-email-log", emailId],
    queryFn: () => platformAdminApi.getEmailLog(emailId!),
    enabled: isAdmin && !!emailId,
  });
}

/**
 * Hook to resend a failed email.
 */
export function useResendEmail() {
  const queryClient = useQueryClient();

  return useMutation<ResendEmailResponse, Error, string>({
    mutationFn: (emailId: string) => platformAdminApi.resendEmail(emailId),
    onSuccess: () => {
      // Invalidate email logs to refresh the list
      queryClient.invalidateQueries({ queryKey: ["admin-email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
    },
  });
}

/**
 * Hook to fetch admin notifications.
 */
export function useAdminNotifications(params?: {
  page?: number;
  per_page?: number;
  event_type?: string;
  search?: string;
}) {
  const { isAdmin } = useAdmin();

  return useQuery<PaginatedAdminNotifications>({
    queryKey: ["admin-notifications", params],
    queryFn: () => platformAdminApi.getNotifications(params),
    enabled: isAdmin,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch admin workspaces.
 */
export function useAdminWorkspaces(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  plan_tier?: string;
}) {
  const { isAdmin } = useAdmin();

  return useQuery<PaginatedAdminWorkspaces>({
    queryKey: ["admin-workspaces", params],
    queryFn: () => platformAdminApi.getWorkspaces(params),
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch admin users.
 */
export function useAdminUsers(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const { isAdmin } = useAdmin();

  return useQuery<PaginatedAdminUsers>({
    queryKey: ["admin-users", params],
    queryFn: () => platformAdminApi.getUsers(params),
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });
}
