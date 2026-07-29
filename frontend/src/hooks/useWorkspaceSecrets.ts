"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { workspaceSecretsApi, WorkspaceSecretSummary } from "@/lib/api";

/**
 * Workspace secrets — names in, values never out.
 *
 * There is deliberately no read hook for a value, because there is no endpoint
 * that returns one. The cache therefore only ever holds names and metadata,
 * which matters: a react-query cache is a place a credential would otherwise
 * sit in memory for the rest of the session.
 */
export function useWorkspaceSecrets(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: secrets,
    isLoading,
    error,
    refetch,
  } = useQuery<WorkspaceSecretSummary[]>({
    queryKey: ["workspaceSecrets", workspaceId],
    queryFn: () => workspaceSecretsApi.list(workspaceId!),
    enabled: !!workspaceId,
    // Listing requires admin. A member opening the builder gets a 403, which
    // is not worth retrying into.
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["workspaceSecrets", workspaceId],
    });

  const upsertMutation = useMutation({
    mutationFn: (data: {
      name: string;
      value: string;
      description?: string;
    }) => workspaceSecretsApi.upsert(workspaceId!, data),
    onSuccess: (_data, variables) => {
      // Whether this created or rotated is not knowable from the response —
      // by design, since the response carries no value to compare. The list
      // tells us which it was.
      const existed = (secrets || []).some((s) => s.name === variables.name);
      toast.success(existed ? "Secret rotated" : "Secret saved");
      invalidate();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, "Failed to save secret"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => workspaceSecretsApi.remove(workspaceId!, name),
    onSuccess: () => {
      toast.success("Secret deleted");
      invalidate();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, "Failed to delete secret"));
    },
  });

  return {
    secrets: secrets || [],
    isLoading,
    error,
    refetch,
    upsertSecret: upsertMutation.mutateAsync,
    deleteSecret: deleteMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
