"use client";

import { useQuery } from "@tanstack/react-query";

import { useWorkspace } from "@/hooks/useWorkspace";
import { reviewApi } from "@/lib/api";

/**
 * Counts the sidebar can show next to a nav entry.
 *
 * Keyed by name rather than by href so the layout config stays declarative —
 * `badge: "review"` says *what* to show, and this decides where the number
 * comes from. Adding a second badge means one more key here and one word in
 * the config, not a data fetch wired into navigation.
 *
 * A queue nobody opens is the failure this whole area keeps running into: the
 * review inbox only works if you can see it filling without visiting it.
 */
export type SidebarBadgeKey = "review";

export function useSidebarBadges(): Record<SidebarBadgeKey, number> {
  const { currentWorkspaceId } = useWorkspace();

  const { data } = useQuery({
    queryKey: ["review-summary", currentWorkspaceId],
    queryFn: () => reviewApi.summary(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
    // The sidebar is mounted on every page, so this refetches for the life of
    // the session. A minute is often enough to notice a queue filling and
    // rare enough that it costs nothing; `select` keeps re-renders to the
    // number itself rather than a new object each poll.
    refetchInterval: 60_000,
    staleTime: 30_000,
    select: (summary) => summary.total,
  });

  return { review: data ?? 0 };
}
