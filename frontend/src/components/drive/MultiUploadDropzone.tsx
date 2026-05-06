"use client";

import { Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

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
  const { queue, enqueue, reset } = useDriveUpload(workspaceId, parentId);
  const usage = useDriveUsage(workspaceId).data;
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (files: FileList | null) => {
    if (!files || files.length === 0 || !workspaceId) return;
    const incoming = Array.from(files);

    // Pre-flight quota check for UX (server is authoritative, returns 413).
    if (usage && !usage.unlimited) {
      const incomingTotal = incoming.reduce((s, f) => s + f.size, 0);
      if (usage.used_bytes + incomingTotal > usage.limit_bytes) {
        alert(
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm transition",
          drag
            ? "border-primary-500 bg-primary-500/10 text-foreground"
            : "border-border bg-muted/30 text-muted-foreground hover:border-primary-500/50 hover:text-foreground",
        )}
      >
        <Upload className="h-5 w-5" />
        <span>
          {t("dropPrompt")}{" "}
          <span className="text-primary-400 underline">{t("browse")}</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="drive-file-input"
          onChange={(e) => {
            accept(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
      </label>

      {queue.length > 0 && (
        <div className="space-y-1.5" data-testid="drive-upload-queue">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("uploadedOf", {
                done: queue.filter((q) => q.status === "done").length,
                total: queue.length,
              })}
            </span>
            <button
              type="button"
              onClick={reset}
              className="hover:text-foreground"
            >
              {t("clear")}
            </button>
          </div>
          {queue.map((item) => (
            <div
              key={item.id}
              data-testid="drive-upload-item"
              data-status={item.status}
              className="rounded-md border border-border bg-background/50 p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground">{item.file.name}</span>
                <span className="text-muted-foreground">
                  {item.status === "done"
                    ? t("statusDone")
                    : item.status === "failed"
                      ? t("statusFailed")
                      : t("statusPercent", { percent: Math.round(item.progress * 100) })}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    item.status === "failed"
                      ? "bg-red-500"
                      : item.status === "done"
                        ? "bg-emerald-500"
                        : "bg-primary-500",
                  )}
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
              {item.error && (
                <p className="mt-1 text-red-400">{item.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
