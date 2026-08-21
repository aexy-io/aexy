"use client";

/**
 * Read-only Word rendering for a file that is not (yet) an Aexy document.
 *
 * The Drive preview used to say "No inline preview for this file type. Use
 * Download." for every .docx in the workspace, which is a dead end: the only way
 * to see what a document said was to leave Aexy. This renders it in place, and
 * offers the one action that makes it editable — promoting it into a document.
 *
 * Deliberately not the same component as `DocxDocumentEditor`. That one owns a
 * document's identity: its content sha, its version chain, and the conflict rules
 * that come with saving. A Drive file has none of those, and giving it a
 * save-shaped affordance would imply an edit history it does not have.
 */

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

import { driveApi } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

const DocxEditorCanvas = dynamic(() => import("./DocxEditorCanvas"), {
  // The engine reads `window` as its module initialises. It is also ~5 MB with a
  // WASM text shaper, so it must stay out of every chunk but its own.
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center">
      <Spinner />
    </div>
  ),
});

export interface DocxFileViewerProps {
  workspaceId: string;
  fileId: string;
  fileName: string;
  locale?: string;
}

export function DocxFileViewer({
  workspaceId,
  fileId,
  fileName,
  locale,
}: DocxFileViewerProps) {
  const t = useTranslations("docs");

  const { data, isLoading, error } = useQuery({
    queryKey: ["drive", "file-content", workspaceId, fileId],
    queryFn: () => driveApi.getFileContent(workspaceId, fileId),
    enabled: Boolean(workspaceId && fileId),
    // Bytes are large and immutable for the lifetime of the row; the engine
    // remounts if their identity changes.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-md border border-border bg-muted/30">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {t("docx.previewUnavailable")}
      </div>
    );
  }

  return (
    // `color-scheme: light` so the engine's own scrollbars and any native
    // controls inside the canvas stay light with it, instead of the page
    // reading as paper inside dark browser chrome.
    <div
      style={{ colorScheme: "light" }}
      className="h-[70vh] overflow-hidden rounded-md border border-border bg-white"
    >
      <DocxEditorCanvas
        document={data}
        mode="view"
        title={fileName}
        locale={locale}
        className="h-full"
      />
    </div>
  );
}
