"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2, Sparkles, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { documentApi } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";

interface Improvement {
  priority: string;
  section: string;
  issue: string;
  suggestion: string;
}

interface Props {
  workspaceId: string;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Invalidate the proposal queries after applying, so the banner appears. */
  onProposed?: () => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * "What is wrong with this page, and will you fix one thing at a time?"
 *
 * The backend for this has existed and been complete — a quality score,
 * prioritised issues, missing sections — with its only caller logging the
 * result to the console. So the capability shipped and nobody could reach it.
 *
 * Applying a suggestion does not edit the document. It creates a proposed edit,
 * the same as any other AI rewrite, so the change is diffed and approved rather
 * than trusted: a suggestion is a judgement about prose somebody wrote, which
 * is precisely the kind of change that should not land unseen.
 */
export function DocumentImprovements({
  workspaceId,
  documentId,
  isOpen,
  onClose,
  onProposed,
}: Props) {
  const t = useTranslations("docs.improvements");
  const [applied, setApplied] = useState<string[]>([]);

  const review = useMutation({
    mutationFn: () => documentApi.suggestImprovements(workspaceId, documentId),
    onError: (error) => toast.error(getApiErrorMessage(error, t("failed"))),
  });

  const apply = useMutation({
    mutationFn: (suggestion: string) =>
      documentApi.applySuggestion(workspaceId, documentId, suggestion),
    onSuccess: (_data, suggestion) => {
      // Remembered so the row can say it is queued. Re-applying the same
      // suggestion would supersede the first proposal and look like nothing
      // happened.
      setApplied((current) => [...current, suggestion]);
      toast.success(t("queued"));
      onProposed?.();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t("applyFailed"))),
  });

  if (!isOpen) return null;

  const suggestions = review.data?.suggestions;
  const improvements: Improvement[] = [...(suggestions?.improvements ?? [])].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority?.toLowerCase()] ?? 9) -
      (PRIORITY_ORDER[b.priority?.toLowerCase()] ?? 9)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        data-testid="document-improvements"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">{t("heading")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!review.data && !review.isPending && (
            <div className="py-6 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              {/* Said before the button, not after: this costs a model call, and
                  a page that spends money on open is a page people stop
                  opening. */}
              <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
                {t("intro")}
              </p>
              <button
                type="button"
                data-testid="improvements-run"
                onClick={() => review.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
              >
                <Sparkles className="h-4 w-4" />
                {t("run")}
              </button>
            </div>
          )}

          {review.isPending && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("reading")}
            </div>
          )}

          {suggestions && (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {Math.round(suggestions.quality_score)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("outOfTen")}
                </span>
              </div>
              {suggestions.overall_assessment && (
                <p className="text-sm text-muted-foreground">
                  {suggestions.overall_assessment}
                </p>
              )}

              {improvements.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("nothingToFix")}</p>
              )}

              <ul className="space-y-2">
                {improvements.map((item, index) => {
                  const isApplied = applied.includes(item.suggestion);
                  const busy =
                    apply.isPending && apply.variables === item.suggestion;
                  return (
                    <li
                      key={`${item.section}-${index}`}
                      data-testid={`improvement-${index}`}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                                item.priority?.toLowerCase() === "high"
                                  ? "bg-warning/20 text-warning"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {item.priority}
                            </span>
                            {item.section && (
                              <span className="truncate text-sm font-medium text-foreground">
                                {item.section}
                              </span>
                            )}
                          </div>
                          {item.issue && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.issue}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-foreground">
                            {item.suggestion}
                          </p>
                        </div>

                        <button
                          type="button"
                          data-testid={`improvement-apply-${index}`}
                          disabled={isApplied || apply.isPending}
                          onClick={() => apply.mutate(item.suggestion)}
                          className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                        >
                          {isApplied
                            ? t("queuedShort")
                            : busy
                              ? t("applying")
                              : t("apply")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {suggestions.missing_sections?.length > 0 && (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="mb-1 text-xs font-medium text-foreground">
                    {t("missingSections")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {suggestions.missing_sections.join(", ")}
                  </p>
                </div>
              )}

              {/* The thing a reviewer needs to know before clicking Apply:
                  nothing is being edited. */}
              <p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {t("appliesAsProposal")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
