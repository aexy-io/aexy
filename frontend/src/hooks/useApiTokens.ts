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

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}

async function fetchTokens(): Promise<ApiToken[]> {
  const res = await fetch(`${API_BASE}/developers/me/api-tokens`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch API tokens");
  return res.json();
}

async function createToken(data: {
  name: string;
  expires_in_days: number | null;
}): Promise<ApiTokenCreated> {
  const res = await fetch(`${API_BASE}/developers/me/api-tokens`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create API token");
  return res.json();
}

async function revokeToken(tokenId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/developers/me/api-tokens/${tokenId}/revoke`,
    {
      method: "POST",
      headers: getHeaders(),
    }
  );
  if (!res.ok) throw new Error("Failed to revoke API token");
}

async function deleteToken(tokenId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/developers/me/api-tokens/${tokenId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete API token");
}

export function useApiTokens() {
  const queryClient = useQueryClient();

  const {
    data: tokens,
    isLoading,
    error,
    refetch,
  } = useQuery<ApiToken[]>({
    queryKey: ["api-tokens"],
    queryFn: fetchTokens,
  });

  const createMutation = useMutation({
    mutationFn: createToken,
    onSuccess: () => {
      toast.success("API token created");
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "Failed to create token")
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeToken,
    onSuccess: () => {
      toast.success("API token revoked");
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "Failed to revoke token")
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteToken,
    onSuccess: () => {
      toast.success("API token deleted");
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "Failed to delete token")
      );
    },
  });

  return {
    tokens: tokens ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
    createToken: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    revokeToken: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
    deleteToken: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
