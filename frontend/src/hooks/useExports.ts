"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { exportsApi, ExportJob } from "@/lib/api";

export function useExports(limit = 20) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<ExportJob[]>({
    queryKey: ["exports", limit],
    queryFn: () => exportsApi.listExports(limit),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      export_type: "report" | "developer_profile" | "team_analytics";
      format: "pdf" | "csv" | "json" | "xlsx";
      config?: Record<string, unknown>;
    }) => exportsApi.createExport(payload),
    onSuccess: () => {
      toast.success("Export started");
      queryClient.invalidateQueries({ queryKey: ["exports"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start export");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => exportsApi.deleteExport(jobId),
    onSuccess: () => {
      toast.success("Export deleted");
      queryClient.invalidateQueries({ queryKey: ["exports"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete export");
    },
  });

  return {
    exports: data || [],
    isLoading,
    error,
    refetch,
    createExport: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteExport: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    getDownloadUrl: exportsApi.getDownloadUrl,
  };
}

export function useExportStatus(jobId: string | null) {
  return useQuery<ExportJob>({
    queryKey: ["exportStatus", jobId],
    queryFn: () => exportsApi.getExportStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as ExportJob | undefined;
      if (data?.status === "completed" || data?.status === "failed") return false;
      return 3000;
    },
  });
}
