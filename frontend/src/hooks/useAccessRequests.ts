"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { appAccessApi, AppAccessRequest } from "@/lib/api";

const REQUESTS_KEY = "accessRequests";

/**
 * Hook for managing app access requests.
 * Non-admins use this to request access and track their requests.
 * Admins use this to list, approve, and reject requests.
 */
export function useAccessRequests(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Fetch current user's requests
  const {
    data: myRequestsData,
    isLoading: isLoadingMyRequests,
  } = useQuery({
    queryKey: [REQUESTS_KEY, "mine", workspaceId],
    queryFn: () => appAccessApi.getMyRequests(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });

  const myRequests = useMemo(
    () => myRequestsData?.requests ?? [],
    [myRequestsData]
  );

  // Helper to get the pending request for a specific app
  const getRequestForApp = useCallback(
    (appId: string): AppAccessRequest | undefined => {
      return myRequests.find(
        (r) => r.app_id === appId && r.status === "pending"
      );
    },
    [myRequests]
  );

  // Helper to get the most recent request for an app (any status)
  const getLatestRequestForApp = useCallback(
    (appId: string): AppAccessRequest | undefined => {
      return myRequests.find((r) => r.app_id === appId);
    },
    [myRequests]
  );

  // Create a new request
  const createRequestMutation = useMutation({
    mutationFn: ({
      appId,
      reason,
    }: {
      appId: string;
      reason?: string;
    }) => appAccessApi.createAccessRequest(workspaceId!, appId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REQUESTS_KEY, "mine", workspaceId] });
    },
  });

  // Withdraw a request
  const withdrawRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      appAccessApi.withdrawRequest(workspaceId!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REQUESTS_KEY, "mine", workspaceId] });
    },
  });

  return {
    myRequests,
    isLoadingMyRequests,
    getRequestForApp,
    getLatestRequestForApp,
    createRequest: createRequestMutation.mutateAsync,
    isCreatingRequest: createRequestMutation.isPending,
    withdrawRequest: withdrawRequestMutation.mutateAsync,
    isWithdrawing: withdrawRequestMutation.isPending,
  };
}

/**
 * Hook for admin management of access requests.
 */
export function useAdminAccessRequests(
  workspaceId: string | null,
  statusFilter?: string
) {
  const queryClient = useQueryClient();

  // Fetch all requests (admin view)
  const {
    data: requestsData,
    isLoading: isLoadingRequests,
  } = useQuery({
    queryKey: [REQUESTS_KEY, "all", workspaceId, statusFilter],
    queryFn: () => appAccessApi.listRequests(workspaceId!, statusFilter),
    enabled: !!workspaceId,
    staleTime: 15 * 1000,
  });

  const requests = useMemo(
    () => requestsData?.requests ?? [],
    [requestsData]
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  // Approve a request
  const approveMutation = useMutation({
    mutationFn: ({
      requestId,
      notes,
    }: {
      requestId: string;
      notes?: string;
    }) => appAccessApi.approveRequest(workspaceId!, requestId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["appAccess"] });
    },
  });

  // Reject a request
  const rejectMutation = useMutation({
    mutationFn: ({
      requestId,
      notes,
    }: {
      requestId: string;
      notes?: string;
    }) => appAccessApi.rejectRequest(workspaceId!, requestId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REQUESTS_KEY] });
    },
  });

  return {
    requests,
    pendingCount,
    isLoadingRequests,
    approveRequest: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    rejectRequest: rejectMutation.mutateAsync,
    isRejecting: rejectMutation.isPending,
  };
}
