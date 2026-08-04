"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import { getApiErrorMessage } from "@/lib/utils";
import {
  AIConnectionTestResult,
  AISettings,
  AISettingsUpdate,
  aiSettingsApi,
} from "@/lib/ai-settings-api";

const aiKeys = {
  settings: (ws: string) => ["ai-settings", ws] as const,
};

export function useAISettings() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<AISettings>({
    queryKey: aiKeys.settings(ws ?? ""),
    queryFn: () => aiSettingsApi.get(ws!),
    enabled: !!ws,
  });
}

export function useUpdateAISettings() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const queryClient = useQueryClient();

  return useMutation<AISettings, unknown, AISettingsUpdate>({
    mutationFn: (data) => aiSettingsApi.update(ws!, data),
    onSuccess: (settings) => {
      // Write the response straight into the cache rather than only
      // invalidating: the server is the authority on derived fields
      // (effective_source, key_hint) and a refetch would flicker them.
      queryClient.setQueryData(aiKeys.settings(ws ?? ""), settings);
      toast.success("AI settings saved");
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not save AI settings")),
  });
}

export function useTestAIConnection() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;

  return useMutation<AIConnectionTestResult, unknown, void>({
    mutationFn: () => aiSettingsApi.test(ws!),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Connected to ${result.provider} (${result.model ?? "default model"})`);
      } else {
        // Not a thrown error: the request succeeded, the provider refused.
        // The provider's own message is the only actionable detail.
        toast.error(result.detail ?? "Connection failed");
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Connection test failed")),
  });
}
