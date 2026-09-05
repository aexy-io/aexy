"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { isAxiosError } from "axios";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useDocumentImport,
  useDocumentImportHistory,
} from "@/hooks/useDocumentImport";
import type { DocumentImportJob, DocumentSpaceListItem } from "@/lib/api";

/** Bigger than this is a whole Confluence instance; the server refuses it. */
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

interface ImportWikiModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  spaces: DocumentSpaceListItem[];
  /** Preselected destination — the space whose menu was used, if any. */
  defaultSpaceId?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload a Notion or Confluence export, and watch it land.
 *
 * The job outlives the dialog — the server keeps importing whether or not this
 * is on screen — so closing mid-run says so rather than pretending to cancel
 * something it cannot cancel.
 */
export function ImportWikiModal({
  isOpen,
  onClose,
  workspaceId,
  spaces,
  defaultSpaceId = null,
}: ImportWikiModalProps) {
  const t = useTranslations("docs.import");
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(defaultSpaceId);
  const [localError, setLocalError] = useState<string | null>(null);

  const { job, isRunning, start, isStarting, startError, retry, isRetrying, reset } =
    useDocumentImport(workspaceId);
  const { jobs } = useDocumentImportHistory(workspaceId, isOpen && !job);

  const message = useMemo(() => {
    if (localError) return localError;
    if (!startError) return null;
    if (isAxiosError(startError)) {
      const status = startError.response?.status;
      if (status === 403) return t("errorForbidden");
      if (status === 413) return t("errorTooLarge");
      const detail = startError.response?.data?.detail;
      if (typeof detail === "string" && detail) return detail;
    }
    return t("errorGeneric");
  }, [localError, startError, t]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return t("statusPending");
      case "scanning":
        return t("statusScanning");
      case "importing":
        return t("statusImporting");
      case "completed":
        return t("statusCompleted");
      case "partial":
        return t("statusPartial");
      default:
        return t("statusFailed");
    }
  };

  const pick = (chosen: File | null) => {
    setLocalError(null);
    if (chosen && chosen.size === 0) {
      setFile(null);
      setLocalError(t("errorEmpty"));
      return;
    }
    // Checked here as well as on the server: a 500 MB upload that is refused
    // after it finishes has already cost somebody ten minutes.
    if (chosen && chosen.size > MAX_ARCHIVE_BYTES) {
      setFile(null);
      setLocalError(t("errorTooLarge"));
      return;
    }
    setFile(chosen);
  };

  const onStart = async () => {
    if (!file) return;
    try {
      await start({ file, spaceId });
    } catch {
      // Surfaced through `startError`; the mutation records it.
    }
  };

  /**
   * Cleared here rather than in an effect on `isOpen`. The choice is not
   * stylistic: setting state inside an effect is what `set-state-in-effect`
   * exists to stop, and the close *is* the event — reacting to the prop
   * afterwards is a re-render doing the work an event handler already could.
   *
   * The job id deliberately survives: a run still going should not lose its
   * progress view because somebody looked away, and the import continues on
   * the server either way.
   */
  const close = () => {
    setFile(null);
    setLocalError(null);
    onClose();
  };

  const finish = () => {
    reset();
    setFile(null);
    setLocalError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg" data-testid="import-wiki-modal">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </DialogHeader>

        {job ? (
          <ImportProgress
            job={job}
            isRunning={isRunning}
            statusLabel={statusLabel}
            t={t}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("chooseFile")}</label>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                data-testid="import-wiki-file"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("chooseFileHint")}
              </p>
              {file && (
                <p className="text-xs text-foreground">
                  {t("selected", {
                    name: file.name,
                    size: formatBytes(file.size),
                  })}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("destination")}</label>
              <select
                value={spaceId ?? ""}
                data-testid="import-wiki-space"
                onChange={(e) => setSpaceId(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("destinationDefault")}</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("destinationHint")}
              </p>
            </div>

            {jobs.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("history")}
                </div>
                <ul className="space-y-1">
                  {jobs.slice(0, 3).map((previous) => (
                    <li key={previous.id} className="text-xs text-muted-foreground">
                      {t("historyRow", {
                        source: previous.source,
                        pages: previous.imported_pages,
                        status: statusLabel(previous.status),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {message && (
              <p className="text-sm text-destructive" data-testid="import-wiki-error">
                {message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {job ? (
            <>
              {job.status === "failed" && (
                <Button
                  variant="outline"
                  onClick={() => retry(job.id)}
                  disabled={isRetrying}
                  data-testid="import-wiki-retry"
                >
                  {isRetrying ? t("retrying") : t("retry")}
                </Button>
              )}
              <Button onClick={finish} data-testid="import-wiki-done">
                {isRunning ? t("close") : t("done")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {t("cancel")}
              </Button>
              <Button
                onClick={onStart}
                disabled={!file || isStarting}
                data-testid="import-wiki-start"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("starting")}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t("start")}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportProgress({
  job,
  isRunning,
  statusLabel,
  t,
}: {
  job: DocumentImportJob;
  isRunning: boolean;
  statusLabel: (status: string) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  const done = job.total_pages
    ? Math.round((job.imported_pages / job.total_pages) * 100)
    : 0;

  return (
    <div className="space-y-4" data-testid="import-wiki-progress">
      <div className="flex items-center gap-2 text-sm">
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : job.status === "failed" ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <span className="font-medium">{statusLabel(job.status)}</span>
        {job.total_pages > 0 && (
          <span className="text-muted-foreground">
            {t("progress", {
              imported: job.imported_pages,
              total: job.total_pages,
            })}
          </span>
        )}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(done, 100)}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {isRunning
          ? t("runningHint")
          : job.status === "failed"
            ? t("failedHint")
            : job.status === "partial"
              ? t("partialHint")
              : null}
      </p>

      {job.error && (
        <p className="text-sm text-destructive">{job.error}</p>
      )}

      {/* The reason a lossy page is visible rather than silently wrong. */}
      {job.warnings.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t("warningsTitle", { count: job.warnings.length })}
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {job.warnings.map((warning, index) => (
              <li
                key={`${index}-${warning}`}
                className="text-xs text-muted-foreground"
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
