"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  adminBackfillApi,
  fileMetadataApi,
  sourceFilesApi,
  workspaceSearchApi,
  type BackfillStatus,
  type FileAIMetadata,
  type FileSearchResults,
  type FileSourceType,
  type SourceFileListResponse,
} from "@/lib/api";

// ─── Query keys ────────────────────────────────────────────────────────────
const KEY_META = (ws: string, st: FileSourceType, id: string) =>
  ["file-metadata", ws, st, id] as const;
const KEY_SEARCH = (ws: string, q: string, kinds: string) =>
  ["file-search", ws, q, kinds] as const;
const KEY_BACKFILL = (ws: string) => ["file-backfill", ws] as const;

// ─── Per-file metadata ────────────────────────────────────────────────────
export function useFileMetadata(
  workspaceId: string | null,
  sourceType: FileSourceType | null,
  sourceId: string | null,
): UseQueryResult<FileAIMetadata> {
  return useQuery({
    queryKey: KEY_META(workspaceId ?? "", sourceType ?? ("" as FileSourceType), sourceId ?? ""),
    queryFn: () => fileMetadataApi.get(workspaceId!, sourceType!, sourceId!),
    enabled: !!workspaceId && !!sourceType && !!sourceId,
    // Status is the main thing this hook returns, and it can flip
    // pending → processing → done while the page is open. Light polling
    // while the AI is running keeps the UI honest.
    refetchInterval: (q) => {
      const data = q.state.data as FileAIMetadata | undefined;
      if (data && (data.ai_status === "pending" || data.ai_status === "processing")) {
        return 5000;
      }
      return false;
    },
  });
}

export function useReannotateFile(
  workspaceId: string | null,
  sourceType: FileSourceType | null,
  sourceId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fileMetadataApi.reannotate(workspaceId!, sourceType!, sourceId!),
    onSuccess: () => {
      if (workspaceId && sourceType && sourceId) {
        qc.invalidateQueries({ queryKey: KEY_META(workspaceId, sourceType, sourceId) });
      }
    },
  });
}

// ─── Workspace files by source (Drive virtual views) ─────────────────────
const KEY_SOURCE_FILES = (ws: string, st: FileSourceType) =>
  ["source-files", ws, st] as const;

export function useSourceFiles(
  workspaceId: string | null,
  sourceType: FileSourceType | null,
  limit = 200,
): UseQueryResult<SourceFileListResponse> {
  return useQuery({
    queryKey: KEY_SOURCE_FILES(workspaceId ?? "", sourceType ?? ("" as FileSourceType)),
    queryFn: () => sourceFilesApi.list(workspaceId!, sourceType!, { limit }),
    enabled: !!workspaceId && !!sourceType,
  });
}

// ─── Workspace search (debounced, used by Cmd+K palette) ─────────────────
export function useWorkspaceSearch(
  workspaceId: string | null,
  query: string,
  kinds?: FileSourceType[],
  limit = 20,
): UseQueryResult<FileSearchResults> {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const kindsKey = (kinds ?? []).slice().sort().join(",");
  return useQuery({
    queryKey: KEY_SEARCH(workspaceId ?? "", debounced, kindsKey),
    queryFn: () =>
      workspaceSearchApi.search(workspaceId!, debounced, { kinds, limit }),
    enabled: !!workspaceId && debounced.trim().length >= 2,
  });
}

// ─── Admin backfill ──────────────────────────────────────────────────────
export function useStartBackfill(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { delay_seconds?: number; max_files?: number }) =>
      adminBackfillApi.start(workspaceId!, opts),
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: KEY_BACKFILL(workspaceId) });
      }
    },
  });
}

export function useBackfillStatus(
  workspaceId: string | null,
): UseQueryResult<BackfillStatus> {
  return useQuery({
    queryKey: KEY_BACKFILL(workspaceId ?? ""),
    queryFn: () => adminBackfillApi.status(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: (q) => {
      const data = q.state.data as BackfillStatus | undefined;
      return data && data.status === "running" ? 5000 : false;
    },
  });
}
