"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Check,
  FileText,
  Inbox,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import { ReviewItem, documentApi, reviewApi } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * One queue for everything waiting on a person.
 *
 * Two gates feed it. The content gate holds an AI's rewrite of a page, to be
 * diffed against what is there now. The policy gate holds a tool call stopped
 * before it ran, because running it to see what it would do is what the gate
 * exists to prevent. `ProposedChange` stores both, so this is one list rather
 * than two screens somebody has to remember to check.
 *
 * Ordered oldest first: the thing that has waited longest is the most likely
 * to have been forgotten, and for a held action an agent is still blocked on
 * it.
 */
export default function ReviewPage() {
  const t = useTranslations("review");
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["review-items", currentWorkspaceId],
    queryFn: () => reviewApi.list(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["review-items", currentWorkspaceId] });
    queryClient.invalidateQueries({ queryKey: ["review-summary", currentWorkspaceId] });
  };

  const decide = useMutation({
    mutationFn: async ({
      item,
      approve,
    }: {
      item: ReviewItem;
      approve: boolean;
    }) => {
      if (item.kind === "agent_action") {
        return approve
          ? reviewApi.approveAction(currentWorkspaceId!, item.id)
          : reviewApi.rejectAction(currentWorkspaceId!, item.id);
      }
      return approve
        ? documentApi.approveProposedEdit(
            currentWorkspaceId!,
            item.document_id!,
            item.id
          )
        : documentApi.rejectProposedEdit(
            currentWorkspaceId!,
            item.document_id!,
            item.id
          );
    },
    onSuccess: (_data, { approve }) => {
      toast.success(approve ? t("approved") : t("rejected"));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t("failed"))),
    onSettled: () => setBusyId(null),
  });

  const needsAttention = useMemo(
    () => items.filter((item) => item.needs_attention).length,
    [items]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" label={t("loading")} />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="max-w-md">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            {t("emptyTitle")}
          </h1>
          {/* Explains the mechanism, because for most workspaces this page is
              empty until the day it suddenly is not — and arriving at an
              unexplained queue of blocked agent actions is its own kind of
              alarming. */}
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("heading", { count: items.length })}
        </h1>
        {needsAttention > 0 && (
          <p className="mt-1 text-sm text-warning">
            {t("needsAttention", { count: needsAttention })}
          </p>
        )}
      </header>

      <ul className="space-y-2">
        {items.map((item) => {
          const isAction = item.kind === "agent_action";
          const Icon = isAction ? Bot : FileText;
          const busy = busyId === item.id && decide.isPending;
          return (
            <li
              key={item.id}
              data-testid={`review-item-${item.id}`}
              className="rounded-xl border border-border p-3"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.kind === "document_proposal" && item.document_id ? (
                      <Link
                        href={`/docs/${item.document_id}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {item.document_icon ?? "📄"} {item.title}
                      </Link>
                    ) : (
                      <span className="truncate font-mono text-sm text-foreground">
                        {item.method} {item.title}
                      </span>
                    )}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {isAction ? t("kindAction") : t("kindDocument")}
                    </span>
                  </div>

                  {/* Plain language, not a payload. The document diff spent a
                      release rendering JSON at reviewers; repeating that for a
                      tool call would be the same mistake in a new place. */}
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.summary}
                  </p>

                  {item.needs_attention && (
                    <p
                      data-testid={`review-attention-${item.id}`}
                      className="mt-1 flex items-center gap-1 text-xs text-warning"
                    >
                      <AlertCircle className="h-3 w-3" />
                      {isAction ? t("agentBlocked") : t("staleWarning")}
                    </p>
                  )}
                  {item.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("becauseOf", { reason: item.reason })}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-testid={`review-reject-${item.id}`}
                    disabled={busy}
                    onClick={() => {
                      setBusyId(item.id);
                      decide.mutate({ item, approve: false });
                    }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("reject")}
                  </button>
                  <button
                    type="button"
                    data-testid={`review-approve-${item.id}`}
                    disabled={busy}
                    onClick={() => {
                      setBusyId(item.id);
                      decide.mutate({ item, approve: true });
                    }}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {busy ? t("working") : t("approve")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
