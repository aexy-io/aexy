"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────

export interface AgentWorkspace {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: string;
  source_module: string | null;
  created_by_id: string | null;
  temporal_workflow_id: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  blocks?: Block[];
  block_count?: number;
  completed_blocks?: number;
}

export interface Block {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  block_type: string;
  title: string | null;
  status: string;
  agent_id: string | null;
  execution_id: string | null;
  content: Record<string, unknown>;
  file_key: string | null;
  file_url: string | null;
  file_mime_type: string | null;
  dependencies: string[];
  handoff_data: Record<string, unknown> | null;
  sort_order: number;
  token_usage: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  children?: Block[];
}

// ── API helpers ───────────────────────────────────────────────────

const BASE = (wid: string) => `/workspaces/${wid}/agent-workspaces`;

async function fetchWorkspaces(wid: string): Promise<AgentWorkspace[]> {
  const { data } = await api.get(BASE(wid));
  return data;
}

async function fetchWorkspace(wid: string, awid: string): Promise<AgentWorkspace> {
  const { data } = await api.get(`${BASE(wid)}/${awid}`);
  return data;
}

async function fetchBlockTree(wid: string, awid: string): Promise<Block[]> {
  const { data } = await api.get(`${BASE(wid)}/${awid}/blocks/tree`);
  return data;
}

// ── Hooks ─────────────────────────────────────────────────────────

export function useAgentWorkspaces(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["agentWorkspaces", workspaceId],
    queryFn: () => fetchWorkspaces(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useAgentWorkspace(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  return useQuery({
    queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId],
    queryFn: () => fetchWorkspace(workspaceId!, agentWorkspaceId!),
    enabled: !!workspaceId && !!agentWorkspaceId,
  });
}

export function useBlockTree(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  return useQuery({
    queryKey: ["blockTree", workspaceId, agentWorkspaceId],
    queryFn: () => fetchBlockTree(workspaceId!, agentWorkspaceId!),
    enabled: !!workspaceId && !!agentWorkspaceId,
    refetchInterval: 5000, // Poll every 5s while running
  });
}

export function useCreateAgentWorkspace(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; description?: string; source_module?: string; config?: Record<string, unknown> }) => {
      const { data: result } = await api.post(BASE(workspaceId!), data);
      return result as AgentWorkspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspaces", workspaceId] });
    },
  });
}

export function useUpdateAgentWorkspace(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title?: string; description?: string; status?: string }) => {
      const { data: result } = await api.patch(`${BASE(workspaceId!)}/${agentWorkspaceId}`, data);
      return result as AgentWorkspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["agentWorkspaces", workspaceId] });
    },
  });
}

export function useDeleteAgentWorkspace(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agentWorkspaceId: string) => {
      await api.delete(`${BASE(workspaceId!)}/${agentWorkspaceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspaces", workspaceId] });
    },
  });
}

export function useRunTask(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { task: string; model?: string; config?: Record<string, unknown> }) => {
      const { data: result } = await api.post(`${BASE(workspaceId!)}/${agentWorkspaceId}/run`, data);
      return result as { temporal_workflow_id: string; status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId] });
    },
  });
}

export function useRespondToBlock(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blockId, response }: { blockId: string; response: string }) => {
      const { data: result } = await api.post(
        `${BASE(workspaceId!)}/${agentWorkspaceId}/blocks/${blockId}/respond`,
        { response }
      );
      return result as Block;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockTree", workspaceId, agentWorkspaceId] });
    },
  });
}

export function usePauseWorkspace(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`${BASE(workspaceId!)}/${agentWorkspaceId}/pause`);
      return data as AgentWorkspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId] });
    },
  });
}

export function useResumeWorkspace(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`${BASE(workspaceId!)}/${agentWorkspaceId}/resume`);
      return data as AgentWorkspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId] });
    },
  });
}

export function useRetryBlock(workspaceId: string | undefined, agentWorkspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockId: string) => {
      const { data } = await api.post(`${BASE(workspaceId!)}/${agentWorkspaceId}/blocks/${blockId}/retry`);
      return data as Block;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockTree", workspaceId, agentWorkspaceId] });
    },
  });
}
