"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  driveApi,
  workspaceSearchApi,
  type DriveFile,
  type DriveFileKind,
  type DriveFileList,
  type DriveUsage,
  type FileSearchHit,
  type SmartView,
  type SmartViewFilter,
  type SmartViewList,
  type VideoAnnotation,
  type VideoAnnotationList,
} from "@/lib/api";

// Local search-result shape — mirrors the legacy DriveSearchResponse the
// page already renders against. The hook adapts the workspace-wide search
// hit so callers don't have to change.
export interface DriveSearchHit {
  file: DriveFile;
  score: number;
  highlights: string[];
}
export interface DriveSearchResponse {
  results: DriveSearchHit[];
}

// ─── Query keys ────────────────────────────────────────────────────────────
const KEY_FILES = (ws: string, parent: string | null | undefined) =>
  ["drive", "files", ws, parent ?? null] as const;
const KEY_FILE = (ws: string, fileId: string) =>
  ["drive", "file", ws, fileId] as const;
const KEY_USAGE = (ws: string) => ["drive", "usage", ws] as const;
const KEY_ANNOTATIONS = (ws: string, fileId: string) =>
  ["drive", "annotations", ws, fileId] as const;
const KEY_SMART_VIEWS = (ws: string) => ["drive", "smart-views", ws] as const;
const KEY_SMART_VIEW_FILES = (ws: string, viewId: string) =>
  ["drive", "smart-view-files", ws, viewId] as const;
const KEY_SEARCH = (ws: string, q: string) => ["drive", "search", ws, q] as const;

// ─── Files ─────────────────────────────────────────────────────────────────
export function useDriveFiles(
  workspaceId: string | null,
  parentId: string | null = null,
  options: { kind?: DriveFileKind; search?: string } = {},
): UseQueryResult<DriveFileList> {
  return useQuery({
    queryKey: [...KEY_FILES(workspaceId ?? "", parentId), options.kind ?? null, options.search ?? ""],
    queryFn: () =>
      driveApi.listFiles(workspaceId!, {
        parent_id: parentId,
        kind: options.kind,
        search: options.search,
      }),
    enabled: !!workspaceId,
  });
}

export function useDriveFile(workspaceId: string | null, fileId: string | null) {
  return useQuery({
    queryKey: KEY_FILE(workspaceId ?? "", fileId ?? ""),
    queryFn: () => driveApi.getFile(workspaceId!, fileId!),
    enabled: !!workspaceId && !!fileId,
  });
}

export function useCreateFolder(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      driveApi.createFolder(workspaceId!, name, parentId ?? null),
    onSuccess: (folder) => {
      qc.invalidateQueries({ queryKey: KEY_FILES(workspaceId ?? "", folder.parent_id) });
    },
  });
}

export function useUpdateDriveFile(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      patch,
    }: {
      fileId: string;
      patch: { file_name?: string; parent_id?: string | null };
    }) => driveApi.updateFile(workspaceId!, fileId, patch),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: ["drive", "files", workspaceId ?? ""] });
      qc.invalidateQueries({ queryKey: KEY_FILE(workspaceId ?? "", file.id) });
    },
  });
}

export function useDeleteDriveFile(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => driveApi.deleteFile(workspaceId!, fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive", "files", workspaceId ?? ""] });
      qc.invalidateQueries({ queryKey: KEY_USAGE(workspaceId ?? "") });
    },
  });
}

export function useReannotateFile(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => driveApi.reannotate(workspaceId!, fileId),
    onSuccess: (_data, fileId) => {
      qc.invalidateQueries({ queryKey: KEY_FILE(workspaceId ?? "", fileId) });
      qc.invalidateQueries({ queryKey: KEY_ANNOTATIONS(workspaceId ?? "", fileId) });
    },
  });
}

// ─── Upload (per-file XHR with progress) ──────────────────────────────────
export interface UploadItem {
  id: string;
  file: File;
  progress: number;       // 0..1
  status: "pending" | "uploading" | "done" | "failed";
  error: string | null;
  result: DriveFile | null;
}

export interface UploadController {
  queue: UploadItem[];
  enqueue: (files: File[]) => void;
  reset: () => void;
}

const MAX_CONCURRENT = 3;
let _uploadIdCounter = 0;

export function useDriveUpload(
  workspaceId: string | null,
  parentId: string | null = null,
): UploadController {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const qc = useQueryClient();
  const inFlight = useRef(0);
  const queueRef = useRef<UploadItem[]>(queue);
  queueRef.current = queue;

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const tick = async () => {
    if (!workspaceId) return;
    while (inFlight.current < MAX_CONCURRENT) {
      const next = queueRef.current.find((it) => it.status === "pending");
      if (!next) break;
      inFlight.current += 1;
      updateItem(next.id, { status: "uploading" });
      driveApi
        .uploadFile(workspaceId, next.file, parentId, (loaded, total) => {
          if (total > 0) updateItem(next.id, { progress: loaded / total });
        })
        .then((file) => {
          updateItem(next.id, { status: "done", progress: 1, result: file });
          qc.invalidateQueries({ queryKey: KEY_FILES(workspaceId, parentId) });
          qc.invalidateQueries({ queryKey: KEY_USAGE(workspaceId) });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Upload failed";
          updateItem(next.id, { status: "failed", error: message });
        })
        .finally(() => {
          inFlight.current -= 1;
          // Schedule another tick to drain remaining queue items.
          setTimeout(tick, 0);
        });
    }
  };

  useEffect(() => {
    void tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const enqueue = (files: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `u${++_uploadIdCounter}`,
        file,
        progress: 0,
        status: "pending" as const,
        error: null,
        result: null,
      })),
    ]);
  };

  const reset = () => setQueue([]);

  return useMemo(
    () => ({ queue, enqueue, reset }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue],
  );
}

// ─── Usage ─────────────────────────────────────────────────────────────────
export function useDriveUsage(
  workspaceId: string | null,
): UseQueryResult<DriveUsage> {
  return useQuery({
    queryKey: KEY_USAGE(workspaceId ?? ""),
    queryFn: () => driveApi.getUsage(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
}

// ─── Search (debounced) ───────────────────────────────────────────────────
// Backed by the workspace-wide search endpoint with `kinds=drive_file`. We
// reshape the hit to the legacy `DriveSearchResponse` shape so existing
// callers don't have to change.
function hitToLegacyShape(
  workspaceId: string,
  hit: FileSearchHit,
): DriveSearchHit {
  // FileCard now fetches AI metadata itself via `useFileMetadata`, so we
  // don't have to populate ai_* on the synthetic DriveFile.
  const synthetic: DriveFile = {
    id: hit.source_id,
    workspace_id: workspaceId,
    parent_id: null,
    space_id: null,
    file_name: hit.file_name,
    file_url: hit.file_url,
    file_size_bytes: 0,
    content_type: hit.content_type,
    kind: "file" as DriveFileKind,
    uploaded_by_id: null,
    uploaded_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    deleted_at: null,
  };
  return { file: synthetic, score: hit.score, highlights: hit.highlights };
}

export function useDriveSearch(
  workspaceId: string | null,
  query: string,
  limit = 20,
): UseQueryResult<DriveSearchResponse> {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery({
    queryKey: KEY_SEARCH(workspaceId ?? "", debounced),
    queryFn: async () => {
      const ws = workspaceId!;
      const res = await workspaceSearchApi.search(ws, debounced, {
        kinds: ["drive_file"],
        limit,
      });
      return { results: res.results.map((h) => hitToLegacyShape(ws, h)) };
    },
    enabled: !!workspaceId && debounced.trim().length >= 2,
  });
}

// ─── Smart Views ──────────────────────────────────────────────────────────
export function useSmartViews(
  workspaceId: string | null,
): UseQueryResult<SmartViewList> {
  return useQuery({
    queryKey: KEY_SMART_VIEWS(workspaceId ?? ""),
    queryFn: () => driveApi.listSmartViews(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSmartViewFiles(
  workspaceId: string | null,
  viewId: string | null,
): UseQueryResult<DriveFileList> {
  return useQuery({
    queryKey: KEY_SMART_VIEW_FILES(workspaceId ?? "", viewId ?? ""),
    queryFn: () => driveApi.smartViewFiles(workspaceId!, viewId!),
    enabled: !!workspaceId && !!viewId,
  });
}

export function useCreateSmartView(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      filter_query: SmartViewFilter;
      icon?: string;
      color?: string;
      is_shared?: boolean;
    }) => driveApi.createSmartView(workspaceId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_SMART_VIEWS(workspaceId ?? "") });
    },
  });
}

export function useUpdateSmartView(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      viewId,
      patch,
    }: {
      viewId: string;
      patch: Partial<{
        name: string;
        icon: string | null;
        color: string | null;
        filter_query: SmartViewFilter;
        is_shared: boolean;
      }>;
    }) => driveApi.updateSmartView(workspaceId!, viewId, patch),
    onSuccess: (view: SmartView) => {
      qc.invalidateQueries({ queryKey: KEY_SMART_VIEWS(workspaceId ?? "") });
      qc.invalidateQueries({
        queryKey: KEY_SMART_VIEW_FILES(workspaceId ?? "", view.id),
      });
    },
  });
}

export function useDeleteSmartView(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) => driveApi.deleteSmartView(workspaceId!, viewId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_SMART_VIEWS(workspaceId ?? "") });
    },
  });
}

// ─── Annotations ──────────────────────────────────────────────────────────
export function useFileAnnotations(
  workspaceId: string | null,
  fileId: string | null,
): UseQueryResult<VideoAnnotationList> {
  return useQuery({
    queryKey: KEY_ANNOTATIONS(workspaceId ?? "", fileId ?? ""),
    queryFn: () => driveApi.listAnnotations(workspaceId!, fileId!),
    enabled: !!workspaceId && !!fileId,
  });
}

export function useAddAnnotation(
  workspaceId: string | null,
  fileId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      t_start_ms: number;
      t_end_ms: number;
      label: string;
      description?: string;
      tags?: string[];
    }) => driveApi.createAnnotation(workspaceId!, fileId!, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: KEY_ANNOTATIONS(workspaceId ?? "", fileId ?? ""),
      });
    },
  });
}

export function useUpdateAnnotation(
  workspaceId: string | null,
  fileId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      patch,
    }: {
      annotationId: string;
      patch: Partial<VideoAnnotation>;
    }) => driveApi.updateAnnotation(workspaceId!, fileId!, annotationId, patch),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: KEY_ANNOTATIONS(workspaceId ?? "", fileId ?? ""),
      });
    },
  });
}

export function useDeleteAnnotation(
  workspaceId: string | null,
  fileId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (annotationId: string) =>
      driveApi.deleteAnnotation(workspaceId!, fileId!, annotationId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: KEY_ANNOTATIONS(workspaceId ?? "", fileId ?? ""),
      });
    },
  });
}
