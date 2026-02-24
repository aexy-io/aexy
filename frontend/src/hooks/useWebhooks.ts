"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webhooksApi, BookingWebhook, WebhookTestResult } from "@/lib/api";

export function useBookingWebhooks(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bookingWebhooks", workspaceId],
    queryFn: () => webhooksApi.listBookingWebhooks(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; url: string; events: string[]; is_active?: boolean }) =>
      webhooksApi.createBookingWebhook(workspaceId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: Partial<BookingWebhook> }) =>
      webhooksApi.updateBookingWebhook(workspaceId!, webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.deleteBookingWebhook(workspaceId!, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.testBookingWebhook(workspaceId!, webhookId),
  });

  const rotateMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.rotateBookingWebhookSecret(workspaceId!, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
  });

  return {
    webhooks: data?.webhooks || [],
    total: data?.total || 0,
    isLoading,
    error,
    refetch,
    createWebhook: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateWebhook: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteWebhook: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    testWebhook: testMutation.mutateAsync,
    isTesting: testMutation.isPending,
    testResult: testMutation.data as WebhookTestResult | undefined,
    rotateSecret: rotateMutation.mutateAsync,
  };
}

export function useBookingWebhookEvents(workspaceId: string | null) {
  return useQuery({
    queryKey: ["bookingWebhookEvents", workspaceId],
    queryFn: () => webhooksApi.getBookingWebhookEvents(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30 * 60 * 1000,
  });
}
