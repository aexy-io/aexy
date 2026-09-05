"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  documentApi,
  DOCUMENT_IMPORT_TERMINAL,
  type DocumentImportJob,
} from "@/lib/api";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

/** How often a running job is asked how it is getting on. */
const POLL_MS = 2000;

export function isImportRunning(job: DocumentImportJob | null | undefined) {
  if (!job) return false;
  return !(DOCUMENT_IMPORT_TERMINAL as readonly string[]).includes(job.status);
}

/**
 * Starting an import, and watching the one you started.
 *
 * The job id is held here rather than by the caller so that closing and
 * reopening the dialog does not lose track of a run that is still going — the
 * import continues on the server either way, and a progress view that forgets
 * about it is how somebody starts a second one.
 */
export function useDocumentImport(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  /** Which job has already had its "documents arrived" refresh; see below. */
  const settledJobId = useRef<string | null>(null);

  const start = useMutation({
    mutationFn: ({ file, spaceId }: { file: File; spaceId?: string | null }) =>
      documentApi.startImport(workspaceId!, file, spaceId),
    onSuccess: (started) => {
      setJobId(started.job_id);
      queryClient.invalidateQueries({ queryKey: ["document-imports", workspaceId] });
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => documentApi.retryImport(workspaceId!, id),
    onSuccess: (started) => {
      setJobId(started.job_id);
      queryClient.invalidateQueries({ queryKey: ["document-imports", workspaceId] });

      // **A retry reuses the job id.** So `setJobId` above changes nothing:
      // the query key is identical, React Query keeps serving the cached
      // terminal job, and `refetchInterval` — which asks that cached job
      // whether it is still running — stays switched off. Without this
      // invalidation the dialog sits on "Import failed", offering Resume,
      // while the run it just started imports the rest of the archive.
      //
      // The settled marker is cleared for the same reason: it is keyed by job
      // id, and the resumed run would otherwise be treated as one that has
      // already had its sidebar refresh.
      settledJobId.current = null;
      queryClient.invalidateQueries({
        queryKey: ["document-import", workspaceId, started.job_id],
      });
    },
  });

  const { data: job } = useQuery({
    queryKey: ["document-import", workspaceId, jobId],
    queryFn: () => documentApi.importStatus(workspaceId!, jobId!),
    enabled: !!workspaceId && !!jobId,
    // Polling stops the moment the job reaches a terminal state, so a finished
    // import does not keep a request in flight for as long as the tab is open.
    refetchInterval: (query) =>
      isImportRunning(query.state.data) ? POLL_MS : false,
  });

  /**
   * Documents appear as the job runs, so the sidebar has to be told — but only
   * on the way *out* of a running state. Invalidating on every poll would
   * refetch the tree every two seconds for the length of a large import, and
   * the tree is the most expensive thing on the page.
   *
   * The ref is what makes it once-per-job rather than once-per-render: the
   * query keeps returning the same terminal job for as long as the dialog is
   * open.
   */
  const settled = !!job && !isImportRunning(job);
  useEffect(() => {
    if (!settled || !workspaceId || !job) return;
    if (settledJobId.current === job.id) return;
    settledJobId.current = job.id;
    queryClient.invalidateQueries({ queryKey: ["document-spaces", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
  }, [settled, job, workspaceId, queryClient]);

  const reset = useCallback(() => {
    setJobId(null);
    settledJobId.current = null;
    start.reset();
    retry.reset();
  }, [start, retry]);

  return {
    job: job ?? null,
    isRunning: isImportRunning(job),
    start: start.mutateAsync,
    isStarting: start.isPending,
    startError: start.error as Error | null,
    retry: retry.mutateAsync,
    isRetrying: retry.isPending,
    reset,
  };
}

/** Every import this workspace has run — the history behind the dialog. */
export function useDocumentImportHistory(
  workspaceId: string | null,
  enabled = true
) {
  const { data, isLoading } = useQuery({
    queryKey: ["document-imports", workspaceId],
    queryFn: () => documentApi.listImports(workspaceId!),
    enabled: !!workspaceId && enabled,
    staleTime: 30_000,
  });

  return { jobs: data ?? (EMPTY_ARRAY as DocumentImportJob[]), isLoading };
}
