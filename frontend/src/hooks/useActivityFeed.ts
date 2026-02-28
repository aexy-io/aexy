"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  entityActivityApi,
  EntityActivity,
  EntityActivityType,
  ActivityActionType,
} from "@/lib/api";

const PAGE_SIZE = 20;

interface UseActivityFeedParams {
  entity_type?: EntityActivityType;
  activity_type?: ActivityActionType;
  actor_id?: string;
}

export function useActivityFeed(
  workspaceId: string | null,
  params?: UseActivityFeedParams
) {
  const query = useInfiniteQuery({
    queryKey: ["activityFeed", workspaceId, params],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await entityActivityApi.list(workspaceId!, {
        ...params,
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      return response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.items.length, 0);
      if (lastPage.has_more && totalFetched < lastPage.total) {
        return totalFetched;
      }
      return undefined;
    },
    enabled:
      !!workspaceId &&
      typeof window !== "undefined" &&
      !!localStorage.getItem("token"),
    staleTime: 30_000,
    retry: false,
  });

  const activities: EntityActivity[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    activities,
    total,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}
