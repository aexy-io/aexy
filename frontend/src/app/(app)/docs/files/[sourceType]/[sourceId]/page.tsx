"use client";

import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  type FileSourceType,
  documentApi,
  type DriveFile,
} from "@/lib/api";
import { useDriveFile } from "@/hooks/useDrive";
import { useFileMetadata } from "@/hooks/useFileMetadata";
import { useWorkspace } from "@/hooks/useWorkspace";

import { formatBytes } from "@/components/drive/QuotaBanner";
import { FileMetadataSidecar } from "@/components/files/FileMetadataSidecar";
import { DocxFileViewer } from "@/components/docs/DocxFileViewer";
import { VideoAnnotatedPlayer } from "@/components/drive/VideoAnnotatedPlayer";

const VALID_SOURCES: FileSourceType[] = [
  "drive_file",
  "task_attachment",
  "compliance_document",
];

export default function UniversalFileDetailPage() {
  const t = useTranslations("drive.fileDetail");
  const params = useParams<{ sourceType: string; sourceId: string }>();
  const { currentWorkspaceId } = useWorkspace();

  const sourceType = params.sourceType as FileSourceType;
  const isValid = VALID_SOURCES.includes(sourceType);

  // Drive files come with their own resolver because the Drive API returns
  // file_url directly. Other sources only need the AI metadata block plus
  // a download URL fetched via the source-specific endpoint (handled by
  // the user's own browser when they click the file).
  const driveQ = useDriveFile(
    currentWorkspaceId,
    sourceType === "drive_file" ? params.sourceId : null,
  );
  const aiQ = useFileMetadata(
    currentWorkspaceId,
    isValid ? sourceType : null,
    isValid ? params.sourceId : null,
  );

  if (!isValid) {
    return (
      <div className="flex flex-col items-center gap-2 p-12 text-center">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("unknownSource")}</p>
        <Link
          href="/docs/drive"
          className="text-sm text-primary-500 underline decoration-dotted"
        >
          {t("backToDrive")}
        </Link>
      </div>
    );
  }

  const isLoading =
    aiQ.isLoading || (sourceType === "drive_file" && driveQ.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  const driveFile: DriveFile | undefined = driveQ.data;

  return (
    // `items-start` so the metadata column hugs its content instead of
    // stretching to the height of a 75vh document preview.
    <div className="grid h-full min-h-0 items-start gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <section className="min-w-0 space-y-4">
        <Link
          href="/docs/drive"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("backToDrive")}
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-all text-xl font-semibold text-foreground">
              {driveFile?.file_name ?? t("fallbackName")}
            </h1>
            {driveFile && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="uppercase tracking-wider">{driveFile.kind}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {formatBytes(driveFile.file_size_bytes)}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {t("uploadedAt", {
                    when: new Date(driveFile.uploaded_at).toLocaleString(),
                  })}
                </span>
              </p>
            )}
          </div>

          {driveFile?.file_url && (
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={driveFile.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("openInNewTab")}
              </a>
              <a
                href={driveFile.file_url}
                download={driveFile.file_name}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                <Download className="h-3.5 w-3.5" />
                {t("download")}
              </a>
            </div>
          )}
        </header>

        {/* Source-specific preview */}
        {sourceType === "drive_file" && driveFile && (
          <DrivePreview file={driveFile} workspaceId={currentWorkspaceId} />
        )}
        {sourceType !== "drive_file" && (
          <div className="rounded-xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              {t("noPreviewForSourceTitle")}
            </p>
            <p>{t("noPreviewForSourceHint")}</p>
          </div>
        )}
      </section>

      <FileMetadataSidecar
        workspaceId={currentWorkspaceId}
        sourceType={sourceType}
        sourceId={params.sourceId}
        className="lg:sticky lg:top-6"
      />
    </div>
  );
}

/**
 * Documents are authored on white paper, so a preview keeps its own light
 * canvas with `color-scheme: light` regardless of the app's theme — the
 * author's black-on-white contrast choices are part of the content, and
 * inverting the page but not the ink is what makes a dark-mode document
 * look broken. Media (image/video) gets a neutral mat instead, which is the
 * conventional treatment and follows the theme.
 */
function PaperSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="file-paper-surface"
      style={{ colorScheme: "light" }}
      className="overflow-hidden rounded-xl border border-border bg-[#f4f4f5] p-2 shadow-sm sm:p-3"
    >
      {children}
    </div>
  );
}

function MediaSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-neutral-100 p-3 dark:bg-neutral-900">
      {children}
    </div>
  );
}

function DrivePreview({
  file,
  workspaceId,
}: {
  file: DriveFile;
  workspaceId: string | null;
}) {
  const t = useTranslations("drive.fileDetail");
  if (!file.file_url) return null;

  if (file.kind === "image") {
    return (
      <MediaSurface>
        {/* A user-uploaded file preview at an arbitrary remote URL, so `next/image`
            would need every host allowlisted to render it at all. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.file_url}
          alt={file.file_name}
          className="max-h-[70vh] w-auto rounded-md object-contain"
        />
      </MediaSurface>
    );
  }

  if (file.kind === "video") {
    return <VideoAnnotatedPlayer workspaceId={workspaceId} file={file} />;
  }

  if (file.kind === "pdf") {
    return (
      <PaperSurface>
        <iframe
          src={file.file_url}
          title={file.file_name}
          className="h-[75vh] w-full rounded-md border-0 bg-white"
        />
      </PaperSurface>
    );
  }

  // `kind` is "doc" for several office formats, so the extension decides:
  // only .docx has an engine that can render it.
  if (
    workspaceId &&
    file.kind === "doc" &&
    file.file_name.toLowerCase().endsWith(".docx")
  ) {
    return <DocxPreview file={file} workspaceId={workspaceId} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">
          {t("noInlinePreviewTitle")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("noInlinePreviewHint")}
        </p>
      </div>
      <a
        href={file.file_url}
        download={file.file_name}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
      >
        <Download className="h-3.5 w-3.5" />
        {t("download")}
      </a>
    </div>
  );
}

function DocxPreview({
  file,
  workspaceId,
}: {
  file: DriveFile;
  workspaceId: string;
}) {
  const t = useTranslations("docs");
  const router = useRouter();

  // Promoting copies the bytes into a document with its own history, rather than
  // making the editor write back over a file other people may have linked to.
  const promote = useMutation({
    mutationFn: () => documentApi.createFromDriveFile(workspaceId, file.id),
    onSuccess: (document) => router.push(`/docs/${document.id}`),
    onError: () => toast.error(t("docx.loadFailed")),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("docx.wordDocument")}
        </span>
        <button
          type="button"
          onClick={() => promote.mutate()}
          disabled={promote.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {promote.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ExternalLink className="h-3 w-3" />
          )}
          {t("docx.openInEditor")}
        </button>
      </div>
      <DocxFileViewer
        workspaceId={workspaceId}
        fileId={file.id}
        fileName={file.file_name}
      />
    </div>
  );
}
