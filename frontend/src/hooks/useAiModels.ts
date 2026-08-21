"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import { getApiErrorMessage } from "@/lib/utils";
import {
  AIModels,
  OverrideScope,
  aiModelsApi,
} from "@/lib/ai-models-api";

export const aiModelKeys = {
  all: (ws: string) => ["ai-models", ws] as const,
};

export function useAiModels() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<AIModels>({
    queryKey: aiModelKeys.all(ws ?? ""),
    queryFn: () => aiModelsApi.get(ws!),
    enabled: !!ws,
  });
}

/**
 * Set or clear one override.
 *
 * Both mutations return the whole page, and both write it straight into the
 * cache rather than invalidating. That is not an optimisation: changing a
 * category's model changes the *effective* model and the source badge of every
 * feature inheriting it, so a partial update would leave rows on screen
 * disagreeing with what will actually run.
 */
export function useSetAiModel() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const queryClient = useQueryClient();

  return useMutation<
    AIModels,
    unknown,
    { scope: OverrideScope; key: string; model: string | null }
  >({
    mutationFn: ({ scope, key, model }) =>
      model === null
        ? aiModelsApi.clear(ws!, scope, key)
        : aiModelsApi.set(ws!, scope, key, model),
    onSuccess: (fresh) => {
      queryClient.setQueryData(aiModelKeys.all(ws ?? ""), fresh);
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Could not save that model choice")),
  });
}
