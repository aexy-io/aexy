"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { crmApi, CRMPipeline, CRMPipelineStage, CRMStageType } from "@/lib/api";

const pipelinesKey = (workspaceId: string | null, objectId?: string | null) => [
  "crmPipelines",
  workspaceId,
  objectId ?? null,
];

export function usePipelines(workspaceId: string | null, objectId: string | null) {
  const queryClient = useQueryClient();
  const key = pipelinesKey(workspaceId, objectId);

  const { data: pipelines, isLoading, error, refetch } = useQuery<CRMPipeline[]>({
    queryKey: key,
    queryFn: () => crmApi.pipelines.list(workspaceId!, objectId || undefined),
    enabled: !!workspaceId && !!objectId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pipelinesKey(workspaceId, objectId) });
    // The board reads stages from the object's attribute config, so refresh it too.
    queryClient.invalidateQueries({ queryKey: ["crmObjects", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["crmObject", workspaceId, objectId] });
  };

  const createPipeline = useMutation({
    mutationFn: (data: Parameters<typeof crmApi.pipelines.create>[1]) =>
      crmApi.pipelines.create(workspaceId!, data),
    onSuccess: () => {
      toast.success("Pipeline created");
      invalidate();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to create pipeline")),
  });

  const updatePipeline = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof crmApi.pipelines.update>[2] }) =>
      crmApi.pipelines.update(workspaceId!, id, data),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to update pipeline")),
  });

  const deletePipeline = useMutation({
    mutationFn: (id: string) => crmApi.pipelines.delete(workspaceId!, id),
    onSuccess: () => {
      toast.success("Pipeline deleted");
      invalidate();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to delete pipeline")),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => crmApi.pipelines.setDefault(workspaceId!, id),
    onSuccess: () => invalidate(),
  });

  const createStage = useMutation({
    mutationFn: ({
      pipelineId,
      data,
    }: {
      pipelineId: string;
      data: { name: string; color?: string; stage_type?: CRMStageType; probability?: number; rotting_days?: number };
    }) => crmApi.pipelines.createStage(workspaceId!, pipelineId, data),
    onSuccess: () => {
      toast.success("Stage added");
      invalidate();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to add stage")),
  });

  const updateStage = useMutation({
    mutationFn: ({
      pipelineId,
      stageId,
      data,
    }: {
      pipelineId: string;
      stageId: string;
      data: Partial<{ name: string; color: string; stage_type: CRMStageType; probability: number; rotting_days: number }>;
    }) => crmApi.pipelines.updateStage(workspaceId!, pipelineId, stageId, data),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to update stage")),
  });

  const deleteStage = useMutation({
    mutationFn: ({
      pipelineId,
      stageId,
      reassignTo,
    }: {
      pipelineId: string;
      stageId: string;
      reassignTo?: string | null;
    }) => crmApi.pipelines.deleteStage(workspaceId!, pipelineId, stageId, reassignTo),
    onSuccess: () => {
      toast.success("Stage deleted");
      invalidate();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to delete stage")),
  });

  const reorderStages = useMutation({
    mutationFn: ({ pipelineId, stageIds }: { pipelineId: string; stageIds: string[] }) =>
      crmApi.pipelines.reorderStages(workspaceId!, pipelineId, stageIds),
    onSuccess: () => invalidate(),
  });

  const moveRecord = useMutation({
    mutationFn: ({
      pipelineId,
      recordId,
      toStageKey,
    }: {
      pipelineId: string;
      recordId: string;
      toStageKey: string;
    }) => crmApi.pipelines.moveRecord(workspaceId!, pipelineId, recordId, toStageKey),
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to move record")),
  });

  return {
    pipelines: pipelines || [],
    isLoading,
    error,
    refetch,
    createPipeline,
    updatePipeline,
    deletePipeline,
    setDefault,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    moveRecord,
  };
}

export function usePipelineAnalytics(workspaceId: string | null, pipelineId: string | null) {
  const enabled = !!workspaceId && !!pipelineId;
  const summary = useQuery({
    queryKey: ["crmPipelineSummary", workspaceId, pipelineId],
    queryFn: () => crmApi.pipelines.summary(workspaceId!, pipelineId!),
    enabled,
  });
  const forecast = useQuery({
    queryKey: ["crmPipelineForecast", workspaceId, pipelineId],
    queryFn: () => crmApi.pipelines.forecast(workspaceId!, pipelineId!),
    enabled,
  });
  const conversion = useQuery({
    queryKey: ["crmPipelineConversion", workspaceId, pipelineId],
    queryFn: () => crmApi.pipelines.conversion(workspaceId!, pipelineId!),
    enabled,
  });
  const velocity = useQuery({
    queryKey: ["crmPipelineVelocity", workspaceId, pipelineId],
    queryFn: () => crmApi.pipelines.velocity(workspaceId!, pipelineId!),
    enabled,
  });
  return { summary, forecast, conversion, velocity };
}

export function useConvertLead(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recordId,
      data,
    }: {
      recordId: string;
      data: Parameters<typeof crmApi.pipelines.convertLead>[2];
    }) => crmApi.pipelines.convertLead(workspaceId!, recordId, data),
    onSuccess: (result) => {
      toast.success("Lead converted");
      queryClient.invalidateQueries({ queryKey: ["crmRecords", workspaceId] });
      return result;
    },
    onError: (e) => toast.error(getApiErrorMessage(e, "Failed to convert lead")),
  });
}

export type { CRMPipeline, CRMPipelineStage };
