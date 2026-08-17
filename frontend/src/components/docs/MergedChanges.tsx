"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { GitMerge, FileText } from "lucide-react";
import Link from "next/link";

import { documentApi, MergedChangeItem } from "@/lib/api";

interface Props {
  workspaceId: string;
}

/**
 * "You merged this last week. Is it written down anywhere?"
 *
 * The counterpart to the stale-document list, which can only find pages that
 * already exist and have fallen behind. Most documentation gaps are not stale
 * pages — they are changes nobody ever wrote about, and there was no queue for
 * those at all.
 *
 * Merged is the moment worth catching, so this is a list of merges rather than a
 * button in a pull request view: a work list gets worked, whereas a button only
 * helps the person who happens to be looking at that pull request.
 *
 * Deliberately silent on whether a change is already documented. The pull
 * request record does not include the files it touched, so any badge would be a
 * guess, and a wrong "already documented" is worse than none — it is the one
 * that stops somebody writing.
 */
export function MergedChanges({ workspaceId }: Props) {
  const t = useTranslations("docs.mergedChanges");

  const { data: changes = [], isLoading } = useQuery<MergedChangeItem[]>({
    queryKey: ["merged-changes", workspaceId],
    queryFn: () => documentApi.listMergedChanges(workspaceId, { limit: 8 }),
    enabled: Boolean(workspaceId),
  });

  if (isLoading || changes.length === 0) return null;

  return (
    <section data-testid="merged-changes" className="space-y-2">
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">{t("heading")}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>

      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {changes.map((change) => (
          <li
            key={change.pull_request_id}
            data-testid={`merged-change-${change.pull_request_id}`}
            className="px-3 py-2 text-sm"
          >
            {/* Two lines rather than one row of six shrink-nothing items: at
                375px that row came to 501px and the action was clipped off the
                edge of the screen, which is worse than a taller card. */}
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {change.repository}#{change.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {change.title}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Size, because a two-line change and a rewrite are not the same
                  decision. */}
              <span className="text-xs text-muted-foreground">
                {t("filesChanged", { count: change.files_changed })}
              </span>

              {change.repository_document_count === 0 && (
                <span
                  data-testid={`merged-change-undocumented-repo-${change.pull_request_id}`}
                  title={t("noDocsForRepositoryHint")}
                  className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning"
                >
                  {t("noDocsForRepository")}
                </span>
              )}

              {change.merged_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(change.merged_at).toLocaleDateString()}
                </span>
              )}

              {change.repository_id ? (
                // Straight into the generator with the repository chosen and the
                // change named, rather than a modal that asks you to re-find
                // what you were just looking at.
                <Link
                  href={`/docs?generate=${change.repository_id}&prompt=${encodeURIComponent(
                    t("promptFor", { number: change.number, title: change.title })
                  )}`}
                  data-testid={`merged-change-document-${change.pull_request_id}`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-xs font-medium text-foreground transition hover:bg-accent"
                >
                  <FileText className="h-3 w-3" />
                  {t("documentThis")}
                </Link>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("repositoryGone")}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
