"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * One authorised MCP client. Identified by its grant rather than a token:
 * a grant is the decision the person made, and the tokens under it rotate.
 */
export interface McpConnector {
  grant_id: string;
  client_id: string;
  client_name: string;
  client_uri: string | null;
  logo_uri: string | null;
  workspace_id: string;
  workspace_name: string | null;
  scope: string;
  authorized_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

async function fetchConnectors(): Promise<McpConnector[]> {
  const res = await fetch(`${API_BASE}/mcp/connectors`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch connectors");
  return res.json();
}

async function revokeConnector(grantId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/mcp/connectors/${grantId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to revoke connector");
}

export function useMcpConnectors() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<McpConnector[]>({
    queryKey: ["mcp-connectors"],
    queryFn: fetchConnectors,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeConnector,
    onSuccess: () => {
      toast.success("Connector revoked");
      queryClient.invalidateQueries({ queryKey: ["mcp-connectors"] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to revoke connector"));
    },
  });

  return {
    connectors: data ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    revokeConnector: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
  };
}
