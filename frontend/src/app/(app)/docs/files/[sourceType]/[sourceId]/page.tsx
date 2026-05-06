"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  type FileSourceType,
  driveApi,
  type DriveFile,
} from "@/lib/api";
import { useDriveFile } from "@/hooks/useDrive";
import { useFileMetadata } from "@/hooks/useFileMetadata";
import { useWorkspace } from "@/hooks/useWorkspace";

import { FileMetadataSidecar } from "@/components/files/FileMetadataSidecar";
import { VideoAnnotatedPlayer } from "@/components/drive/VideoAnnotatedPlayer";

const VALID_SOURCES: FileSourceType[] = [
  "drive_file",
  "task_attachment",
  "compliance_document",
];

export default function UniversalFileDetailPage() {
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
      <div className="p-6 text-sm text-muted-foreground">
        Unknown source type. <Link href="/docs/drive" className="text-primary-400 underline">Back</Link>
      </div>
    );
  }

  const isLoading =
    aiQ.isLoading || (sourceType === "drive_file" && driveQ.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const driveFile: DriveFile | undefined = driveQ.data;

  return (
    <div className="grid h-full min-h-0 gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-4">
        <Link
          href="/docs/drive"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Drive
        </Link>

        <h1 className="text-xl font-semibold text-foreground">
          {driveFile?.file_name ?? "File"}
        </h1>

        {/* Source-specific preview */}
        {sourceType === "drive_file" && driveFile && (
          <DrivePreview file={driveFile} workspaceId={currentWorkspaceId} />
        )}
        {sourceType !== "drive_file" && (
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            <p className="mb-2 text-foreground">
              Preview is currently available for Drive files only.
            </p>
            <p>
              Use the source's own download / view endpoint to access this
              file's contents.
            </p>
          </div>
        )}
      </section>

      <FileMetadataSidecar
        workspaceId={currentWorkspaceId}
        sourceType={sourceType}
        sourceId={params.sourceId}
      />
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
  if (!file.file_url) return null;
  if (file.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={file.file_url}
        alt={file.file_name}
        className="max-h-[70vh] rounded-md border border-border"
      />
    );
  }
  if (file.kind === "video") {
    return <VideoAnnotatedPlayer workspaceId={workspaceId} file={file} />;
  }
  if (file.kind === "pdf") {
    return (
      <iframe
        src={file.file_url}
        title={file.file_name}
        className="h-[70vh] w-full rounded-md border border-border bg-muted"
      />
    );
  }
  return (
    <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
      No inline preview for this file type. Use Download.
    </div>
  );
}
