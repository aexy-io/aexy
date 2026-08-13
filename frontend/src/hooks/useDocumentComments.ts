"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { documentApi, DocumentComment, DocumentCommentList } from "@/lib/api";

/**
 * Comment threads on a document.
 *
 * Every mutation invalidates the whole list rather than patching the cache. A
 * comment can arrive as a root or a reply, resolving changes a thread's position
 * in the reader's mental model, and deleting keeps the row but blanks it — three
 * different shapes of change for a payload small enough that refetching is
 * cheaper than getting the optimistic update subtly wrong.
 */
export function useDocumentComments(
  workspaceId: string | null,
  documentId: string | null
) {
  const queryClient = useQueryClient();
  const key = ["documents", "comments", workspaceId, documentId];

  const { data, isLoading, error } = useQuery<DocumentCommentList>({
    queryKey: key,
    queryFn: () => documentApi.listComments(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (input: { content: string; parentId?: string | null }) =>
      documentApi.createComment(workspaceId!, documentId!, {
        content: input.content,
        parent_id: input.parentId ?? null,
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: { commentId: string; content: string }) =>
      documentApi.updateComment(
        workspaceId!,
        documentId!,
        input.commentId,
        input.content
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (commentId: string) =>
      documentApi.deleteComment(workspaceId!, documentId!, commentId),
    onSuccess: invalidate,
  });

  const setResolved = useMutation({
    mutationFn: (input: { commentId: string; resolved: boolean }) =>
      documentApi.resolveComment(
        workspaceId!,
        documentId!,
        input.commentId,
        input.resolved
      ),
    onSuccess: invalidate,
  });

  const comments: DocumentComment[] = data?.comments ?? [];

  return {
    comments,
    total: data?.total ?? 0,
    unresolvedCount: data?.unresolved_count ?? 0,
    isLoading,
    error,

    createComment: create.mutateAsync,
    isCreating: create.isPending,
    updateComment: update.mutateAsync,
    deleteComment: remove.mutateAsync,
    setResolved: setResolved.mutateAsync,
  };
}
