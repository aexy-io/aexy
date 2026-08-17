"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  feedbackApi,
  type FeedbackAdminItem,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackListResponse,
  type FeedbackStatus,
} from "@/lib/api";

const boardKey = (workspaceId: string | null, kind?: FeedbackKind, status?: FeedbackStatus) =>
  ["feedback", "board", workspaceId, kind ?? null, status ?? null];
const mineKey = (workspaceId: string | null) => ["feedback", "mine", workspaceId];
const adminKey = (kind?: FeedbackKind, status?: FeedbackStatus) => [
  "feedback",
  "admin",
  kind ?? null,
  status ?? null,
];

export function useFeedbackBoard(
  workspaceId: string | null,
  filters?: { kind?: FeedbackKind; status?: FeedbackStatus },
) {
  return useQuery<FeedbackListResponse>({
    queryKey: boardKey(workspaceId, filters?.kind, filters?.status),
    queryFn: () => feedbackApi.list(workspaceId!, filters),
    enabled: !!workspaceId,
  });
}

export function useMyFeedback(workspaceId: string | null) {
  return useQuery<FeedbackListResponse>({
    queryKey: mineKey(workspaceId),
    queryFn: () => feedbackApi.listMine(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSubmitFeedback(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      kind: FeedbackKind;
      subject: string;
      body: string;
      context?: Record<string, unknown>;
    }) => feedbackApi.submit(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}

/**
 * Voting, optimistic in both directions.
 *
 * A vote is one click on a list you are reading; waiting a round trip to see the
 * count move makes the board feel broken, and the failure case is recoverable —
 * the rollback puts the count back exactly where it was.
 */
export function useVoteFeedback(
  workspaceId: string | null,
  filters?: { kind?: FeedbackKind; status?: FeedbackStatus },
) {
  const queryClient = useQueryClient();
  const key = boardKey(workspaceId, filters?.kind, filters?.status);

  return useMutation({
    mutationFn: ({ feedbackId, voted }: { feedbackId: string; voted: boolean }) =>
      voted
        ? feedbackApi.unvote(workspaceId!, feedbackId)
        : feedbackApi.vote(workspaceId!, feedbackId),
    onMutate: async ({ feedbackId, voted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeedbackListResponse>(key);
      if (previous) {
        queryClient.setQueryData<FeedbackListResponse>(key, {
          ...previous,
          items: previous.items.map((item: FeedbackItem) =>
            item.id === feedbackId
              ? {
                  ...item,
                  voted: !voted,
                  vote_count: item.vote_count + (voted ? -1 : 1),
                }
              : item,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}

export function useAdminFeedback(filters?: { kind?: FeedbackKind; status?: FeedbackStatus }) {
  return useQuery<{ items: FeedbackAdminItem[]; total: number }>({
    queryKey: adminKey(filters?.kind, filters?.status),
    queryFn: () => feedbackApi.listAll(filters),
  });
}

export function useReviewFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      feedbackId,
      ...data
    }: {
      feedbackId: string;
      status?: FeedbackStatus;
      admin_note?: string;
    }) => feedbackApi.review(feedbackId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}
