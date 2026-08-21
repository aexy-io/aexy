"use client";

import {
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
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
  sheet: FileSpreadsheet,
  file: File,
};

// Icon tint by kind — a file grid is much faster to scan when the type is a
// colour as well as a glyph. Both stops are chosen to hold contrast in light
// and dark themes.
const KIND_TINT: Record<string, string> = {
  folder: "text-sky-600 dark:text-sky-400",
  image: "text-violet-600 dark:text-violet-400",
  video: "text-pink-600 dark:text-pink-400",
  audio: "text-teal-600 dark:text-teal-400",
  pdf: "text-red-600 dark:text-red-400",
  doc: "text-blue-600 dark:text-blue-400",
  sheet: "text-emerald-600 dark:text-emerald-400",
  file: "text-muted-foreground",
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
  onDelete,
  selected = false,
}: {
  file: DriveFile | SourceFileRow;
  onClick?: () => void;
  /** When provided, the card grows a hover-revealed delete affordance. */
  onDelete?: () => void;
  selected?: boolean;
}) {
  const t = useTranslations("drive.fileCard");
  const v = viewFor(file);
  const Icon = KIND_ICON[v.fileKind] || File;
  const tint = KIND_TINT[v.fileKind] ?? KIND_TINT.file;

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
    // The main click target is an overlay button so that the delete control
    // can sit on the card without nesting interactive elements.
    <div
      data-testid="drive-file-card"
      data-file-id={v.id}
      data-file-kind={v.fileKind}
      data-source-type={v.sourceType}
      data-ai-status={aiStatus}
      className={cn(
        "group relative flex h-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors",
        "hover:border-primary-500/50 hover:bg-accent/40",
        "focus-within:border-primary-500/60 focus-within:ring-2 focus-within:ring-primary-500/25",
        selected ? "border-primary-500 ring-2 ring-primary-500/30" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={v.fileName}
        className="absolute inset-0 z-0 rounded-xl focus:outline-none"
      >
        <span className="sr-only">{v.fileName}</span>
      </button>

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tint)} />
          <span className="line-clamp-2 break-all text-sm font-medium text-foreground">
            {v.fileName}
          </span>
        </div>
        {!isFolder && <AiStatusPill status={aiStatus} />}
      </div>

      {aiSummary ? (
        <p className="pointer-events-none relative z-10 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {aiSummary}
        </p>
      ) : !isFolder && (aiStatus === "pending" || aiStatus === "processing") ? (
        <p className="pointer-events-none relative z-10 text-xs italic text-muted-foreground">
          {t("summaryPending")}
        </p>
      ) : null}

      <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-wrap gap-1">
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
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {isFolder ? t("folder") : formatBytes(v.fileSizeBytes)}
        </span>
      </div>

      {onDelete && (
        <button
          type="button"
          data-testid="drive-file-delete"
          title={t("delete")}
          aria-label={t("delete")}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            "absolute right-1.5 top-1.5 z-20 rounded-md p-1.5 text-muted-foreground transition",
            "opacity-0 hover:bg-red-500/15 hover:text-red-600 focus:opacity-100 group-hover:opacity-100",
            "dark:hover:text-red-300",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function AiStatusPill({ status }: { status: string | undefined }) {
  const t = useTranslations("drive.fileCard");
  if (!status) return null;

  if (status === "pending" || status === "processing") {
    return (
      <span
        data-testid="drive-ai-status-pill"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("aiPending")}
      </span>
    );
  }
  if (status === "done") {
    return (
      <span
        data-testid="drive-ai-status-pill"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
      >
        <Sparkles className="h-3 w-3" />
        {t("aiReady")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        data-testid="drive-ai-status-pill"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300"
      >
        <TriangleAlert className="h-3 w-3" />
        {t("aiFailed")}
      </span>
    );
  }
  return null;
}
