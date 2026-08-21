"use client";

/**
 * Pending AI proposals on a Word document.
 *
 * Deliberately not `ProposedEditsBanner`. That one shows a content diff of two
 * TipTap trees, which is the right review for a document whose body *is* a tree.
 * A Word document has no such diff worth showing — the reviewable form is a
 * tracked-changes redline in the document itself, so this banner's job is
 * narrower: describe what is waiting, and hand the reader into the editor with
 * the changes marked up.
 *
 * The flow, and why it is shaped this way:
 *
 *   1. **Review** replays the proposal's ops into the open document in
 *      suggesting mode. Nothing is saved. The person now sees a redline
 *      attributed to the agent.
 *   2. They accept or reject individual changes in the editor, with Word
 *      semantics, and **save**. That save is what persists the outcome.
 *   3. **Done** marks the proposal taken up. It writes nothing to the document,
 *      because step 2 already did — see `ProposedEditsService.approve`.
 *
 * Rejecting skips all of it and records a reason.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { documentApi, type ProposedEdit } from "@/lib/api";
import { opsAreFullyReviewable, type ApplyOpsResult } from "./docxOps";
import { DocxReviewRail } from "./DocxReviewRail";

export interface DocxProposalsBannerProps {
  workspaceId: string;
  documentId: string;
  /** Replays a proposal's ops into the open editor. From the canvas handle. */
  onReview: (proposal: ProposedEdit) => ApplyOpsResult | undefined;
  /** True once the editor is in suggesting mode and holding a replayed proposal. */
  reviewingId: string | null;
  onReviewingChange: (proposalId: string | null) => void;
}

export function DocxProposalsBanner({
  workspaceId,
  documentId,
  onReview,
  reviewingId,
  onReviewingChange,
}: DocxProposalsBannerProps) {
  const t = useTranslations("docs");
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<ApplyOpsResult | null>(null);

  const { data: proposals = [] } = useQuery({
    queryKey: ["proposed-edits", workspaceId, documentId],
    queryFn: () => documentApi.listProposedEdits(workspaceId, documentId, "pending"),
    enabled: Boolean(workspaceId && documentId),
  });

  const settle = () => {
    queryClient.invalidateQueries({
      queryKey: ["proposed-edits", workspaceId, documentId],
    });
    onReviewingChange(null);
    setLastResult(null);
  };

  const accept = useMutation({
    mutationFn: (proposalId: string) =>
      documentApi.approveProposedEdit(workspaceId, documentId, proposalId),
    onSuccess: settle,
    onError: () => toast.error(t("docx.proposalFailed")),
  });

  const reject = useMutation({
    mutationFn: (proposalId: string) =>
      documentApi.rejectProposedEdit(
        workspaceId,
        documentId,
        proposalId,
        t("docx.rejectedByReviewer")
      ),
    onSuccess: settle,
    onError: () => toast.error(t("docx.proposalFailed")),
  });

  const docxProposals = proposals.filter((p) => (p.proposed_ops?.length ?? 0) > 0);
  if (docxProposals.length === 0) return null;

  return (
    <div className="space-y-2 border-b bg-muted/40 px-4 py-3">
      {docxProposals.map((proposal) => {
        const ops = proposal.proposed_ops ?? [];
        const reviewing = reviewingId === proposal.id;
        const fullyReviewable = opsAreFullyReviewable(ops);
        const busy = accept.isPending || reject.isPending;

        return (
          <div key={proposal.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 min-w-0">
                {proposal.diff_summary?.summary ??
                  t("docx.proposalCount", { count: ops.length })}
              </span>

              {proposal.is_stale && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  <AlertTriangle className="h-3 w-3" />
                  {t("docx.proposalStale")}
                </span>
              )}

              {!reviewing ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const result = onReview(proposal);
                      setLastResult(result ?? null);
                      onReviewingChange(proposal.id);
                    }}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60"
                  >
                    {/* Still offered when stale, because a person can look at a
                        conflict and decide — which is exactly what a background
                        job cannot do, and why the headless path refuses instead.
                        Renamed so it is a deliberate act rather than the same
                        button it was before the document moved. */}
                    {proposal.is_stale
                      ? t("docx.reviewAnyway")
                      : t("docx.reviewAsTrackedChanges")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => reject.mutate(proposal.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background disabled:opacity-60"
                  >
                    <X className="h-3 w-3" />
                    {t("docx.rejectProposal")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => accept.mutate(proposal.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {t("docx.proposalDone")}
                </button>
              )}
            </div>

            {reviewing && (
              <p className="text-xs text-muted-foreground">
                {t("docx.reviewingHint")}
              </p>
            )}

            {/* What is in the proposal, change by change. Available before the
                replay as well as after, because a count is not something you can
                review — and once the redline is in a long document, this is how a
                reviewer tells one marked-up passage from another. Skipped ops are
                matched to their own row rather than listed separately below. */}
            {proposal.proposed_ops && proposal.proposed_ops.length > 0 && (
              <details className="text-xs" open={reviewing}>
                <summary className="cursor-pointer text-foreground hover:underline">
                  {t("docx.railToggle", {
                    count: proposal.proposed_ops.length,
                  })}
                </summary>
                <DocxReviewRail
                  ops={proposal.proposed_ops}
                  skipped={reviewing ? lastResult?.skipped : undefined}
                  className="mt-2"
                />
              </details>
            )}

            {/* A proposal that only partly replayed must say so, and say it
                where the reviewer is looking. The count stays here — it is the
                headline — while each refusal is shown against its own change in
                the rail above, rather than in a second list to cross-reference. */}
            {reviewing && lastResult && lastResult.skipped.length > 0 && (
              <p
                data-testid="docx-skipped-summary"
                className="rounded-md bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100"
              >
                {t("docx.someOpsSkipped", { count: lastResult.skipped.length })}
              </p>
            )}

            {!reviewing && !fullyReviewable && (
              <p className="text-xs text-muted-foreground">
                {t("docx.partiallyReviewable")}
              </p>
            )}

            {/* Said before they commit to it, not after: some edits will refuse
                themselves against changed text and some — appending a section —
                will apply regardless of what moved. */}
            {!reviewing && proposal.is_stale && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t("docx.staleWarning")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
