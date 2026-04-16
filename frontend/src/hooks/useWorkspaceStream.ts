"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface WorkspaceEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * SSE hook for real-time agent workspace block updates.
 * Listens to the /stream endpoint and invalidates React Query cache on updates.
 */
export function useWorkspaceStream(
  workspaceId: string | undefined,
  agentWorkspaceId: string | undefined,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!workspaceId || !agentWorkspaceId || !enabled) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const url = `${baseUrl}/workspaces/${workspaceId}/agent-workspaces/${agentWorkspaceId}/stream?token=${token}`;

    const es = new EventSource(url);
    esRef.current = es;

    const invalidate = () => {
      queryClient.invalidateQueries({
        queryKey: ["blockTree", workspaceId, agentWorkspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentWorkspace", workspaceId, agentWorkspaceId],
      });
    };

    es.addEventListener("block_created", invalidate);
    es.addEventListener("block_updated", invalidate);
    es.addEventListener("workspace_status", invalidate);

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [workspaceId, agentWorkspaceId, enabled, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}
