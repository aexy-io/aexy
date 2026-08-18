"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitPullRequest, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import { Spinner } from "@/components/ui/spinner";
import { ImpactDocumentCard } from "@/components/docs/impact/ImpactDocumentCard";
import { docImpactApi, documentApi, DocImpactResponse } from "@/lib/api";

/**
 * What one pull request did to the pages that describe its code.
 *
 * Lives under `/docs` so it inherits the app-access guard and the document tree
 * in the rail — which means the pages under discussion are visible, with their
 * existing behind-the-code dots, while you read about them.
 *
 * `repositoryId` is in the URL because pull request numbers are only unique per
 * repository, and because the webhook has a repository id and a number at the
 * moment it needs to build this link — before any record exists to name.
 */
export default function DocumentImpactPage() {
  const params = useParams();
  const repositoryId = params?.repositoryId as string;
  const prNumber = Number(params?.prNumber);
  const { currentWorkspaceId } = useWorkspace();
  const t = useTranslations("docs.impact");
  const queryClient = useQueryClient();

  const queryKey = ["doc-impact", currentWorkspaceId, repositoryId, prNumber];

  const { data, isLoading, isError, refetch } = useQuery<DocImpactResponse>({
    queryKey,
    queryFn: () => docImpactApi.get(currentWorkspaceId!, repositoryId, prNumber),
    enabled: Boolean(currentWorkspaceId && repositoryId && prNumber),
  });

  // Both mutations return the whole impact, so the card updates without a
  // refetch — a dismissal that flickers reads as though it failed.
  const dismiss = useMutation({
    mutationFn: ({ documentId, reason }: { documentId: string; reason?: string }) =>
      docImpactApi.dismiss(
        currentWorkspaceId!,
        repositoryId,
        prNumber,
        documentId,
        reason
      ),
    onSuccess: (fresh) => queryClient.setQueryData(queryKey, fresh),
    onError: () => toast.error(t("dismissFailed")),
  });

  const undismiss = useMutation({
    mutationFn: (documentId: string) =>
      docImpactApi.undismiss(
        currentWorkspaceId!,
        repositoryId,
        prNumber,
        documentId
      ),
    onSuccess: (fresh) => queryClient.setQueryData(queryKey, fresh),
    onError: () => toast.error(t("dismissFailed")),
  });

  const askForUpdate = useMutation({
    mutationFn: ({
      documentId,
      templateCategory,
    }: {
      documentId: string;
      templateCategory: string | null;
    }) =>
      // Passing the link's own category rather than letting the client default:
      // `generate` falls back to "function_docs", so regenerating a module
      // document through the default silently changes what kind of document it
      // is. This route already knows the answer, so it says it.
      documentApi.generate(
        currentWorkspaceId!,
        documentId,
        templateCategory || undefined
      ),
    onSuccess: () => {
      toast.success(t("updateRequested"));
      // Without this the card keeps offering the button, so a second click makes
      // a second proposal — the exact chore the `proposal_pending` state exists
      // to prevent, defeated by not re-reading it.
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t("updateFailed")),
  });

  const onDismiss = useCallback(
    (documentId: string, reason?: string) => dismiss.mutate({ documentId, reason }),
    [dismiss]
  );
  const onUndismiss = useCallback(
    (documentId: string) => undismiss.mutate(documentId),
    [undismiss]
  );
  const onAskForUpdate = useCallback(
    (documentId: string, templateCategory: string | null) =>
      askForUpdate.mutate({ documentId, templateCategory }),
    [askForUpdate]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // A failed request is not "we never looked at this pull request". Conflating
  // them told somebody whose token had expired that the feature had not run.
  if (isError || !data) {
    return (
      <div
        data-testid="impact-error"
        className="mx-auto max-w-2xl px-4 py-12 text-center"
      >
        <h1 className="text-base font-medium text-foreground">
          {t("errorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorBody")}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 rounded border border-border px-3 py-1 text-sm text-foreground transition hover:bg-accent"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  // Never evaluated. Not an error — a pull request that predates this, or one in
  // a repository nothing documents. Calm copy, no red.
  if (!data.analyzed) {
    return (
      <div
        data-testid="impact-not-checked"
        className="mx-auto max-w-2xl px-4 py-12 text-center"
      >
        <h1 className="text-base font-medium text-foreground">
          {t("notCheckedTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.repository_document_count === 0
            ? t("notCheckedNoDocs")
            : t("notCheckedOld")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <GitPullRequest className="h-3.5 w-3.5" />
          {t("eyebrow")}
        </div>
        <h1
          data-testid="impact-heading"
          className="mt-1 text-lg font-semibold text-foreground"
        >
          {data.pull_request_title || `#${data.pull_request_number}`}
        </h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/* Named and linked. "#412" alone is useless to anybody with pull
              requests open in more than one repository, and a page that tells you
              your change broke something should let you get back to the change.
              The URL is derived rather than stored — `pull_requests` has no
              `html_url` column and does not need one. */}
          {data.repository_full_name ? (
            <a
              href={`https://github.com/${data.repository_full_name}/pull/${data.pull_request_number}`}
              target="_blank"
              rel="noreferrer"
              data-testid="impact-pr-link"
              className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline"
            >
              {data.repository_full_name}#{data.pull_request_number}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono">#{data.pull_request_number}</span>
          )}
          {/* An external contributor has no account here, so the login is the
              only handle. Omitted entirely rather than printing "Unknown". */}
          {data.author_login && (
            <span data-testid="impact-author">
              {t("openedBy", { author: data.author_login })}
            </span>
          )}
          <span
            data-testid="impact-state"
            className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
              data.state === "merged"
                ? "bg-accent text-foreground"
                : "bg-success/15 text-success"
            }`}
          >
            {data.state === "merged" ? t("stateMerged") : t("stateOpen")}
          </span>
        </div>

        {/* Both numbers mean something: the second is how big the change was, the
            first is how much of it anybody has written down. */}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("coverage", {
            matched: data.items.length,
            total: data.changed_path_count,
          })}
        </p>
      </header>

      {/* Why the GitHub side of this said nothing, when it did not. The person
          who can fix it is a workspace admin, not the author, so this states the
          fact rather than pretending the comment posted. */}
      {data.pr_comment_status === "permission_missing" && (
        <p
          data-testid="impact-pr-comment-blocked"
          className="mt-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          {t("prCommentBlocked")}{" "}
          <Link
            href="/settings/repositories"
            className="inline-flex items-center gap-1 underline"
          >
            {t("prCommentBlockedAction")}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      )}

      {data.items.length === 0 ? (
        <div data-testid="impact-empty" className="mt-8 text-center">
          <h2 className="text-sm font-medium text-foreground">
            {t("emptyTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Link
            href={`/docs?generate=${data.repository_id}`}
            className="mt-3 inline-block text-sm text-foreground underline"
          >
            {t("emptyAction")}
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {data.items.map((item) => (
            <ImpactDocumentCard
              key={item.document_id}
              item={item}
              onDismiss={onDismiss}
              onUndismiss={onUndismiss}
              onAskForUpdate={onAskForUpdate}
              // `askForUpdate` belongs here too: it spends an LLM call and
              // leaves something for a person to review, so a double-click is
              // the most expensive stray click on this page.
              isBusy={
                dismiss.isPending || undismiss.isPending || askForUpdate.isPending
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
