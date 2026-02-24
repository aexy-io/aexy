"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Webhook created");
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create webhook");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: Partial<BookingWebhook> }) =>
      webhooksApi.updateBookingWebhook(workspaceId!, webhookId, data),
    onSuccess: () => {
      toast.success("Webhook updated");
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update webhook");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.deleteBookingWebhook(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook deleted");
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete webhook");
    },
  });

  const testMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.testBookingWebhook(workspaceId!, webhookId),
    onSuccess: (result: WebhookTestResult) => {
      if (result.success) {
        toast.success("Webhook test successful");
      } else {
        toast.error(result.error || "Webhook endpoint returned an error");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Webhook test failed");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (webhookId: string) =>
      webhooksApi.rotateBookingWebhookSecret(workspaceId!, webhookId),
    onSuccess: () => {
      toast.success("Webhook secret rotated");
      queryClient.invalidateQueries({ queryKey: ["bookingWebhooks", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to rotate webhook secret");
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
