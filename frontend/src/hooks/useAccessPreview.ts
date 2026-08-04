"use client";

import { useQuery } from "@tanstack/react-query";
import { appAccessApi, AccessPreviewResponse } from "@/lib/api";

/**
 * What would somebody with this department / profile / role actually see?
 *
 * Used by the invite surfaces so the sender can see the answer before the invite
 * goes out. Previously an invite decided a person's whole navigation — via a
 * role bundle nobody was shown — and the only way to find out what they got was
 * to ask them after they signed in.
 *
 * Resolved server-side, by the same code that resolves real access: a preview
 * that agreed with the invite screen but disagreed with what the person received
 * would be worse than no preview at all.
 */
export function useAccessPreview(
  workspaceId: string | null,
  params: {
    departmentIds?: string[];
    accessTemplateId?: string | null;
    role?: string;
    /** Skip the request when the caller isn't showing a preview yet. */
    enabled?: boolean;
  } = {},
) {
  const departmentIds = params.departmentIds ?? [];
  const accessTemplateId = params.accessTemplateId ?? null;
  const role = params.role ?? "member";

  const { data, isLoading, error } = useQuery<AccessPreviewResponse>({
    queryKey: ["accessPreview", workspaceId, departmentIds, accessTemplateId, role],
    queryFn: () =>
      appAccessApi.previewAccess(workspaceId!, {
        department_ids: departmentIds,
        access_template_id: accessTemplateId,
        role,
      }),
    enabled:
      (params.enabled ?? true) &&
      !!workspaceId &&
      typeof window !== "undefined" &&
      !!localStorage.getItem("token"),
    // Profiles change rarely, and a preview is advisory — no need to refetch it
    // while somebody types a list of email addresses.
    staleTime: 60 * 1000,
    // Only admins may preview; a non-admin inviting from onboarding shouldn't
    // retry into a wall of 403s.
    retry: false,
  });

  return {
    preview: data ?? null,
    appNames: data?.enabled_app_names ?? [],
    /** "department" | "role_fallback" | "member_template" */
    baseline: data?.baseline ?? null,
    baselineDetail: data?.baseline_detail ?? null,
    suggestedPersona: data?.suggested_persona ?? null,
    isLoading,
    error,
  };
}
