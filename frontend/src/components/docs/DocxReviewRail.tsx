"use client";

/**
 * What is actually in a proposal, change by change.
 *
 * The banner above this says "12 changes waiting". That is a count, not
 * reviewable information. Somebody deciding whether to replay a proposal into a
 * forty-page contract needs to see what it will do first, and once the redline
 * is in the document they need to tell one marked-up passage from another.
 *
 * Rendered from the stored ops, so it works *before* anything is replayed —
 * which is the point. A rail you can only read after committing to the edit
 * would not be a review.
 *
 * Three states each row can be in, and all three are said out loud:
 *
 *   - **replayable** — will appear as a tracked change in the editor.
 *   - **applied without a redline** — the browser cannot mark it up, so the
 *     backend applies it on accept. The reviewer should know that before they
 *     go looking for a redline that will never appear.
 *   - **unresolvable** — the backend already knows it cannot land: a table
 *     coordinate out of range, a comment since deleted. Shown here rather than
 *     surfacing as a skipped op after the replay.
 */

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, FileWarning } from "lucide-react";

import { summariseOps, type AexyDocxOp, type SkippedOp } from "./docxOps";

export interface DocxReviewRailProps {
  ops: readonly AexyDocxOp[];
  /**
   * What a replay refused, once one has happened. Matched to rows by op index,
   * so a reviewer sees the refusal against the change it belongs to rather than
   * in a separate list they have to cross-reference.
   */
  skipped?: readonly SkippedOp[];
  className?: string;
}

export function DocxReviewRail({
  ops,
  skipped = [],
  className,
}: DocxReviewRailProps) {
  const t = useTranslations("docs");

  if (ops.length === 0) return null;

  const rows = summariseOps(ops);
  const refusedByIndex = new Map(skipped.map((s) => [s.index, s.reason]));

  return (
    <section
      data-testid="docx-review-rail"
      className={["rounded-lg border border-border bg-surface", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
        {t("docx.railTitle", { count: rows.length })}
      </h3>

      <ol className="divide-y divide-border/60">
        {rows.map((row) => {
          const refused = refusedByIndex.get(row.index);
          return (
            <li
              key={row.index}
              data-testid={`docx-review-row-${row.index}`}
              className="px-3 py-2 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{row.action}</span>
                {/* Two different things a reviewer needs to know, and they are
                    not the same: a comment op appears (as a comment), while an
                    op the browser cannot replay never appears at all. Saying
                    "no redline" for both would send them looking in the wrong
                    place for one of them. */}
                {row.asComment ? (
                  <span
                    data-testid={`docx-review-comment-${row.index}`}
                    className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {t("docx.railAsComment")}
                  </span>
                ) : !row.replayable ? (
                  <span
                    data-testid={`docx-review-headless-${row.index}`}
                    className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {t("docx.railNoRedline")}
                  </span>
                ) : null}
              </div>

              {row.target && (
                <p className="mt-0.5 break-words text-muted-foreground">
                  <span className="font-mono">{row.target}</span>
                  {row.becomes && (
                    <>
                      <ArrowRight className="mx-1 inline h-3 w-3 align-[-2px]" />
                      <span className="font-mono text-foreground">
                        {row.becomes}
                      </span>
                    </>
                  )}
                </p>
              )}

              {row.unresolvable && (
                <p
                  data-testid={`docx-review-unresolvable-${row.index}`}
                  className="mt-1 flex items-start gap-1 text-amber-700 dark:text-amber-300"
                >
                  <FileWarning className="mt-0.5 h-3 w-3 shrink-0" />
                  {row.unresolvable}
                </p>
              )}

              {refused && (
                <p
                  data-testid={`docx-review-refused-${row.index}`}
                  className="mt-1 flex items-start gap-1 text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {refused}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
