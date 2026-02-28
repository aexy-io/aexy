"use client";

import { useQuery } from "@tanstack/react-query";
import { sprintApi } from "@/lib/api";

export function useCapacityPlanning(sprintId: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sprintCapacity", sprintId],
    queryFn: () => sprintApi.getCapacity(sprintId!),
    enabled: !!sprintId,
  });

  return {
    capacity: data || null,
    isLoading,
    error,
    refetch,
  };
}
