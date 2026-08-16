"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, GitPullRequest, Inbox, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  ProposedEditSource,
  WorkspaceProposedEdit,
  documentApi,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const SOURCE_ICONS: Record<ProposedEditSource, typeof Sparkles> = {
  code_change_sync: GitPullRequest,
  regenerate: Sparkles,
  suggest_improvements: Wrench,
  manual_ai_edit: Wrench,
};

/**
 * Everything waiting on a human, in one place.
 *
 * A proposal used to be findable only by opening the document it belonged
 * to — workable when one person regenerates one page and goes to look, and
 * useless the moment a repository documents itself module by module and a
 * single merge leaves proposals on a dozen pages nobody thinks to open.
 *
 * Grouped by what caused them rather than by document, because that is the
 * unit people actually reason about: "the auth rework touched these four
 * pages" is a decision, "here are four unrelated documents" is a chore.
 */
export default function DocsReviewPage() {
  const t = useTranslations("docs.review");
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  const { data: proposals = [], isLoading } = useQuery<WorkspaceProposedEdit[]>({
    queryKey: ["workspace-proposed-edits", currentWorkspaceId],
    queryFn: () => documentApi.listWorkspaceProposedEdits(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
  });

  const groups = useMemo(() => {
    const map = new Map<ProposedEditSource, WorkspaceProposedEdit[]>();
    for (const proposal of proposals) {
      const list = map.get(proposal.source) ?? [];
      list.push(proposal);
      map.set(proposal.source, list);
    }
    return Array.from(map.entries());
  }, [proposals]);

  const approveAll = useMutation({
    mutationFn: async (rows: WorkspaceProposedEdit[]) => {
      // Sequential rather than concurrent: each approval writes a new document
      // version, and firing a dozen at once turns a review into a burst of
      // writes with no way to stop partway.
      for (const row of rows) {
        await documentApi.approveProposedEdit(
          currentWorkspaceId!,
          row.document_id,
          row.id
        );
      }
    },
    onSuccess: (_data, rows) => {
      toast.success(t("approved", { count: rows.length }));
      queryClient.invalidateQueries({
        queryKey: ["workspace-proposed-edits", currentWorkspaceId],
      });
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("approveFailed"))),
    onSettled: () => setBusyGroup(null),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" label={t("loading")} />
      </div>
    );
  }

  if (!proposals.length) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="max-w-sm">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="mb-1 text-lg font-semibold text-foreground">
            {t("emptyTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
{t("emptyBody")}
          </p>
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
{t("heading", { count: proposals.length })}
        </h1>
      </header>

      <div className="space-y-6">
        {groups.map(([source, rows]) => {
          const Icon = SOURCE_ICONS[source] ?? Sparkles;
          const label = t.has(`sources.${source}`)
            ? t(`sources.${source}`)
            : source;
          const blurb = t.has(`sources.${source}Blurb`)
            ? t(`sources.${source}Blurb`)
            : "";
          const stale = rows.filter((row) => row.is_stale).length;
          return (
            <section
              key={source}
              data-testid={`review-group-${source}`}
              className="rounded-xl border border-border"
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-medium text-foreground">
                    {label}
                    <span className="ml-2 text-muted-foreground">
                      · {rows.length}
                    </span>
                  </h2>
                  {blurb && (
                    <p className="text-xs text-muted-foreground">{blurb}</p>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`approve-all-${source}`}
                  disabled={approveAll.isPending}
                  onClick={() => {
                    setBusyGroup(source);
                    approveAll.mutate(rows);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {busyGroup === source && approveAll.isPending
                    ? t("approving")
                    : t("approveAll", { count: rows.length })}
                </button>
              </div>

              {stale > 0 && (
                <p className="border-b border-border bg-warning/10 px-4 py-1.5 text-xs text-foreground">
                  {stale === 1 ? t("staleOne") : t("staleMany", { count: stale })}{" "}
                  {t("staleHint")}
                </p>
              )}

              <ul className="divide-y divide-border/60">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/docs/${row.document_id}`}
                      data-testid={`review-row-${row.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-accent/40"
                    >
                      <span className="text-base">{row.document_icon ?? "📄"}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {row.document_title}
                      </span>
                      {row.is_stale && (
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          {t("stale")}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(row.proposed_at).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
