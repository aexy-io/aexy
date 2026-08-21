"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import { getApiErrorMessage } from "@/lib/utils";
import {
  DocsAiSettings,
  DocsAiSettingsUpdate,
  docsAiSettingsApi,
} from "@/lib/docs-ai-settings-api";

export const docsAiKeys = {
  settings: (ws: string) => ["docs-ai-settings", ws] as const,
};

/**
 * The workspace's AI-editing settings.
 *
 * Read by the settings page AND by the Word editor, which needs `mode` to know
 * whether to offer the control at all and `ai_author_label` to attribute a
 * replayed redline. One query key, so the editor does not refetch what the
 * settings page already has.
 */
export function useDocsAiSettings() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<DocsAiSettings>({
    queryKey: docsAiKeys.settings(ws ?? ""),
    queryFn: () => docsAiSettingsApi.get(ws!),
    enabled: !!ws,
    // Not volatile: an admin changes these rarely, and the editor reading them
    // on every mount should not mean a request on every mount.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDocsAiSettings() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const queryClient = useQueryClient();

  return useMutation<DocsAiSettings, unknown, DocsAiSettingsUpdate>({
    mutationFn: (data) => docsAiSettingsApi.update(ws!, data),
    onSuccess: (settings) => {
      // The response straight into the cache rather than an invalidate: the
      // server normalises the handle and clamps the change cap, so a refetch
      // would flicker the value the user typed into the value it became.
      queryClient.setQueryData(docsAiKeys.settings(ws ?? ""), settings);
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, "Could not save these settings")),
  });
}
