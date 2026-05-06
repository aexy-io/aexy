"use client";

import {
  File,
  FileText,
  Film,
  Folder,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { type DriveFile, type FileSourceType, type SourceFileRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/premium-card";
import { useFileMetadata } from "@/hooks/useFileMetadata";

import { formatBytes } from "./QuotaBanner";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  image: ImageIcon,
  video: Film,
  audio: Headphones,
  pdf: FileText,
  doc: FileText,
  file: File,
};

// Card prop accepts either a native Drive row or a source-agnostic row from
// the workspace-wide browse endpoint. AI metadata is fetched per-card via
// (source_type, source_id), so attachments and compliance docs render with
// the same badges as drive_files.
function viewFor(file: DriveFile | SourceFileRow): {
  id: string;
  workspaceId: string;
  fileKind: string;
  fileName: string;
  fileSizeBytes: number;
  sourceType: FileSourceType;
  sourceId: string;
} {
  if ("source_type" in file) {
    return {
      id: file.source_id,
      workspaceId: file.workspace_id,
      fileKind: file.kind,
      fileName: file.file_name,
      fileSizeBytes: file.file_size_bytes,
      sourceType: file.source_type,
      sourceId: file.source_id,
    };
  }
  return {
    id: file.id,
    workspaceId: file.workspace_id,
    fileKind: file.kind,
    fileName: file.file_name,
    fileSizeBytes: file.file_size_bytes,
    sourceType: "drive_file",
    sourceId: file.id,
  };
}

export function FileCard({
  file,
  onClick,
  selected = false,
}: {
  file: DriveFile | SourceFileRow;
  onClick?: () => void;
  selected?: boolean;
}) {
  const t = useTranslations("drive.fileCard");
  const v = viewFor(file);
  const Icon = KIND_ICON[v.fileKind] || File;

  const isFolder = v.fileKind === "folder";
  const metaQ = useFileMetadata(
    isFolder ? null : v.workspaceId,
    isFolder ? null : v.sourceType,
    isFolder ? null : v.sourceId,
  );
  const ai = metaQ.data;
  const aiStatus = ai?.ai_status;
  const aiSummary = ai?.ai_summary ?? null;
  const aiTags = ai?.ai_tags ?? [];

  return (
    <button
      type="button"
      data-testid="drive-file-card"
      data-file-id={v.id}
      data-file-kind={v.fileKind}
      data-source-type={v.sourceType}
      data-ai-status={aiStatus}
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-left transition hover:border-primary-500/50 hover:bg-muted/60",
        selected
          ? "border-primary-500 ring-2 ring-primary-500/30"
          : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2 text-sm font-medium text-foreground">
            {v.fileName}
          </span>
        </div>
        {!isFolder &&
          (aiStatus === "processing" || aiStatus === "pending" ? (
            <span
              data-testid="drive-ai-status-pill"
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("aiPending")}
            </span>
          ) : aiStatus === "done" ? (
            <span
              data-testid="drive-ai-status-pill"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"
            >
              <Sparkles className="h-3 w-3" />
              {t("aiReady")}
            </span>
          ) : aiStatus === "failed" ? (
            <span
              data-testid="drive-ai-status-pill"
              className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300"
            >
              {t("aiFailed")}
            </span>
          ) : null)}
      </div>

      {aiSummary && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {aiSummary}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {aiTags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="default" size="sm">
              {tag}
            </Badge>
          ))}
          {aiTags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              {t("tagsOverflow", { count: aiTags.length - 3 })}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {isFolder ? "" : formatBytes(v.fileSizeBytes)}
        </span>
      </div>
    </button>
  );
}
