"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useDriveUpload, useDriveUsage } from "@/hooks/useDrive";

import { formatBytes } from "./QuotaBanner";

export function MultiUploadDropzone({
  workspaceId,
  parentId = null,
  className,
}: {
  workspaceId: string | null;
  parentId?: string | null;
  className?: string;
}) {
  const t = useTranslations("drive.upload");
  const { queue, enqueue, retry, remove, reset } = useDriveUpload(
    workspaceId,
    parentId,
  );
  const usage = useDriveUsage(workspaceId).data;
  const [drag, setDrag] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const accept = (files: FileList | null) => {
    if (!files || files.length === 0 || !workspaceId) return;
    const incoming = Array.from(files);
    setQuotaError(null);

    // Pre-flight quota check for UX (server is authoritative, returns 413).
    if (usage && !usage.unlimited) {
      const incomingTotal = incoming.reduce((s, f) => s + f.size, 0);
      if (usage.used_bytes + incomingTotal > usage.limit_bytes) {
        setQuotaError(
          t("quotaExceededAlert", {
            used: formatBytes(usage.used_bytes),
            incoming: formatBytes(incomingTotal),
            limit: formatBytes(usage.limit_bytes),
          }),
        );
        return;
      }
    }
    enqueue(incoming);
  };

  const done = queue.filter((q) => q.status === "done").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  const active = queue.filter(
    (q) => q.status === "pending" || q.status === "uploading",
  ).length;
  // Bytes-weighted so a big file doesn't jump from 0 to 100 alongside small ones.
  const totalBytes = queue.reduce((s, q) => s + q.file.size, 0);
  const sentBytes = queue.reduce((s, q) => s + q.file.size * q.progress, 0);
  const overall = totalBytes > 0 ? sentBytes / totalBytes : 0;

  return (
    <div className={cn("space-y-3", className)}>
      <label
        data-testid="drive-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-6 py-7 text-sm transition-colors",
          drag
            ? "border-primary-500 bg-primary-500/10 text-foreground"
            : "border-border bg-muted/20 text-muted-foreground hover:border-primary-500/50 hover:bg-muted/40 hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            drag ? "bg-primary-500/20 text-primary-400" : "bg-muted text-muted-foreground",
          )}
        >
          <Upload className="h-4 w-4" />
        </span>
        <span className="font-medium text-foreground">
          {t("dropPrompt")}{" "}
          <span className="text-primary-500 underline decoration-dotted">
            {t("browse")}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{t("dropHint")}</span>
        <input
          type="file"
          multiple
          className="sr-only"
          data-testid="drive-file-input"
          onChange={(e) => {
            accept(e.currentTarget.files);
            // Clear so re-picking the same file still fires `change`.
            e.currentTarget.value = "";
          }}
        />
      </label>

      {quotaError && (
        <p
          role="alert"
          data-testid="drive-upload-quota-error"
          className="flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {quotaError}
        </p>
      )}

      {queue.length > 0 && (
        <div
          className="rounded-lg border border-border bg-card p-3"
          data-testid="drive-upload-queue"
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {active > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />
              ) : failed > 0 ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {t("uploadedOf", { done, total: queue.length })}
              {failed > 0 && (
                <span className="text-red-600 dark:text-red-300">
                  {" "}
                  · {t("failedCount", { count: failed })}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("clear")}
            </button>
          </div>

          {queue.length > 1 && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${Math.round(overall * 100)}%` }}
              />
            </div>
          )}

          <ul className="mt-2 space-y-1.5">
            {queue.map((item) => (
              <li
                key={item.id}
                data-testid="drive-upload-item"
                data-status={item.status}
                className="rounded-md bg-muted/40 px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {item.file.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatBytes(item.file.size)}
                  </span>
                  <span
                    className={cn(
                      "w-12 shrink-0 text-right tabular-nums",
                      item.status === "failed"
                        ? "text-red-600 dark:text-red-300"
                        : item.status === "done"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-muted-foreground",
                    )}
                  >
                    {item.status === "done"
                      ? t("statusDone")
                      : item.status === "failed"
                        ? t("statusFailed")
                        : item.status === "pending"
                          ? t("statusQueued")
                          : t("statusPercent", {
                              percent: Math.round(item.progress * 100),
                            })}
                  </span>
                  {item.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retry(item.id)}
                      title={t("retry")}
                      aria-label={t("retry")}
                      data-testid="drive-upload-retry"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    title={t("dismiss")}
                    aria-label={t("dismiss")}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {item.status !== "done" && (
                  <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all",
                        item.status === "failed" ? "bg-red-500" : "bg-primary-500",
                      )}
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                )}
                {item.error && (
                  <p className="mt-1 text-red-600 dark:text-red-300">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
