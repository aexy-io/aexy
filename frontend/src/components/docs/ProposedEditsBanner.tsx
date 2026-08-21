"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  GitMerge,
  GitPullRequest,
  Wrench,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { documentApi, ProposedEdit, ProposedEditSource } from "@/lib/api";
import { ProposedEditReview } from "./ProposedEditReview";

interface Props {
  workspaceId: string;
  documentId: string;
  /** The document's current content, passed down so each proposal can be
   *  diffed against what is actually on the page. The page already holds it,
   *  so taking it as a prop avoids a second fetch of a document the caller
   *  has open in front of them. */
  currentContent?: unknown;
}

const SOURCE_META: Record<
  ProposedEditSource,
  { label: string; icon: typeof Sparkles }
> = {
  regenerate: { label: "Regenerate", icon: Sparkles },
  code_change_sync: { label: "Code changed", icon: GitPullRequest },
  suggest_improvements: { label: "Suggested improvement", icon: Wrench },
  manual_ai_edit: { label: "AI edit", icon: Wrench },
  // Word documents are reviewed as a tracked-changes redline in the editor
  // rather than as a content diff here, so this banner never renders one — but
  // the map is exhaustive over the source union, and leaving a hole would be a
  // runtime `undefined.label` the first time one did arrive.
  agent_docx_edit: { label: "AI edit (Word)", icon: Wrench },
};

/**
 * Banner that sits above the document editor when there's at least
 * one pending AI-proposed edit. Groups proposals by `source` (per the
 * spec — code_change_sync vs regenerate vs suggest_improvements are
 * mentally separate piles for users) and surfaces the merge-conflict
 * badge when a proposal is stale.
 *
 * Clicking a proposal expands `ProposedEditReview` inline.
 */
export function ProposedEditsBanner({
  workspaceId,
  documentId,
  currentContent,
}: Props) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: proposals = [], isLoading } = useQuery<ProposedEdit[]>({
    queryKey: ["proposed-edits", workspaceId, documentId],
    queryFn: () => documentApi.listProposedEdits(workspaceId, documentId),
    enabled: Boolean(workspaceId && documentId),
  });

  const groups = useMemo(() => {
    const m = new Map<ProposedEditSource, ProposedEdit[]>();
    for (const p of proposals) {
      if (!m.has(p.source)) m.set(p.source, []);
      m.get(p.source)!.push(p);
    }
    return Array.from(m.entries());
  }, [proposals]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["proposed-edits", workspaceId, documentId] });
    queryClient.invalidateQueries({ queryKey: ["document", documentId] });
  };

  const approve = useMutation({
    mutationFn: (id: string) =>
      documentApi.approveProposedEdit(workspaceId, documentId, id),
    onSuccess: () => {
      setOpenId(null);
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      documentApi.rejectProposedEdit(workspaceId, documentId, id, reason),
    onSuccess: () => {
      setOpenId(null);
      invalidate();
    },
  });

  // Regenerate the source pipeline against the document's current
  // content. The fresh proposal supersedes the stale one server-side
  // via ProposedEditsService.create_proposal's supersede sweep, so we
  // only need to invalidate the cache afterwards.
  const regenerate = useMutation({
    mutationFn: () => documentApi.generate(workspaceId, documentId),
    onSuccess: () => {
      setOpenId(null);
      invalidate();
    },
  });

  if (isLoading || proposals.length === 0) return null;

  return (
    <div
      data-testid="proposed-edits-banner"
      className="border border-primary-500/30 bg-primary-500/5 rounded-lg overflow-hidden mb-3"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary-500/20">
        <GitMerge className="h-4 w-4 text-primary-400" />
        <span className="text-sm font-medium text-foreground">
          {proposals.length} suggested{" "}
          {proposals.length === 1 ? "edit" : "edits"} from AI
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {groups.map(([source, rows]) => {
          const meta = SOURCE_META[source] ?? {
            label: source,
            icon: Sparkles,
          };
          const Icon = meta.icon;
          return (
            <div
              key={source}
              data-testid={`proposed-edits-group-${source}`}
              className="px-4 py-2"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-2">
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                <span className="text-muted-foreground/60">· {rows.length}</span>
              </div>
              <div className="space-y-1.5">
                {rows.map((p) => {
                  const isOpen = openId === p.id;
                  return (
                    <div key={p.id} data-testid={`proposed-edit-${p.id}`}>
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : p.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/40 text-left text-sm"
                      >
                        {isOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-foreground">
                          Proposed {new Date(p.proposed_at).toLocaleString()}
                        </span>
                        {p.is_stale && (
                          <span
                            data-testid={`stale-badge-${p.id}`}
                            title="The document has been edited since this proposal was authored"
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/20 text-warning"
                          >
                            STALE
                          </span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="mt-2 mb-1">
                          <ProposedEditReview
                            proposal={p}
                            currentContent={currentContent}
                            onApprove={() => approve.mutate(p.id)}
                            onReject={(reason) =>
                              reject.mutate({ id: p.id, reason })
                            }
                            onRegenerate={
                              p.is_stale ? () => regenerate.mutate() : undefined
                            }
                            isPending={
                              approve.isPending ||
                              reject.isPending ||
                              regenerate.isPending
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
