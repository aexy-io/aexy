"use client";

import {
  ChevronRight,
  ClipboardCheck,
  FolderPlus,
  HardDrive,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useCreateFolder,
  useDriveFiles,
  useDriveSearch,
  useDriveUsage,
  useSmartViews,
} from "@/hooks/useDrive";
import { useSourceFiles } from "@/hooks/useFileMetadata";
import type { FileSourceType } from "@/lib/api";
import { cn } from "@/lib/utils";

import { FileCard } from "@/components/drive/FileCard";
import { MultiUploadDropzone } from "@/components/drive/MultiUploadDropzone";
import { QuotaBanner, formatBytes } from "@/components/drive/QuotaBanner";
import { SmartViewEditor } from "@/components/drive/SmartViewEditor";

// Virtual source views in the sidebar — render workspace files keyed by
// source_type in the same grid as drive files. Smart views are db-backed;
// these are hardcoded.
type SourceView = {
  id: FileSourceType;
  labelKey: "viewTaskAttachments" | "viewComplianceDocs";
  icon: typeof ListChecks;
};
const SOURCE_VIEWS: SourceView[] = [
  { id: "task_attachment", labelKey: "viewTaskAttachments", icon: ListChecks },
  { id: "compliance_document", labelKey: "viewComplianceDocs", icon: ClipboardCheck },
];

const VALID_SOURCES: FileSourceType[] = ["task_attachment", "compliance_document"];

export default function DrivePage() {
  const t = useTranslations("drive.page");
  const router = useRouter();
  const params = useSearchParams();
  const parentId = params.get("folder");
  const sourceParam = params.get("source");
  const activeSource: FileSourceType | null =
    sourceParam && VALID_SOURCES.includes(sourceParam as FileSourceType)
      ? (sourceParam as FileSourceType)
      : null;

  const { currentWorkspaceId } = useWorkspace();
  const filesQ = useDriveFiles(currentWorkspaceId, parentId, {});
  const usageQ = useDriveUsage(currentWorkspaceId);
  const smartViewsQ = useSmartViews(currentWorkspaceId);
  const sourceFilesQ = useSourceFiles(currentWorkspaceId, activeSource);
  const createFolder = useCreateFolder(currentWorkspaceId);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSmartViewEditor, setShowSmartViewEditor] = useState(false);

  const searchActive = searchQuery.trim().length >= 2;
  const searchQ = useDriveSearch(currentWorkspaceId, searchQuery);

  const usage = usageQ.data;
  const smartViews = smartViewsQ.data?.smart_views ?? [];

  const breadcrumbs = useMemo(
    () => [{ id: null, label: t("title") }],
    // For now we render a flat breadcrumb; a multi-segment trail would need
    // each parent's row. The current `parent_id=...` param drives the active
    // folder; the breadcrumb just provides a "back to root" link.
    [t],
  );

  const handleCreateFolder = async () => {
    const name = window.prompt(t("folderNamePrompt"));
    if (!name) return;
    await createFolder.mutateAsync({ name, parentId });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateFolder}
            data-testid="drive-new-folder"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm text-foreground hover:bg-muted/60"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {t("newFolder")}
          </button>
        </div>
      </header>

      <QuotaBanner usage={usage} />

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar — Smart Views + virtual source views */}
        <aside className="lg:w-56">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("smartViewsHeading")}
              </span>
              <button
                onClick={() => setShowSmartViewEditor(true)}
                data-testid="drive-new-smart-view"
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t("newSmartViewTitle")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {smartViews.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("noSmartViews")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {smartViews.map((sv) => (
                  <li key={sv.id}>
                    <Link
                      href={`/docs/drive/smart-views/${sv.id}`}
                      data-testid="drive-smart-view-link"
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary-400" />
                      <span className="truncate">{sv.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cross-source virtual views */}
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("sourcesHeading")}
            </span>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href="/docs/drive"
                  data-testid="drive-source-link"
                  data-source="drive_file"
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50",
                    activeSource === null && !parentId
                      ? "bg-muted/60 text-foreground"
                      : "text-foreground/80",
                  )}
                >
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{t("viewDriveFiles")}</span>
                </Link>
              </li>
              {SOURCE_VIEWS.map((sv) => {
                const SvIcon = sv.icon;
                const active = activeSource === sv.id;
                return (
                  <li key={sv.id}>
                    <Link
                      href={`/docs/drive?source=${sv.id}`}
                      data-testid="drive-source-link"
                      data-source={sv.id}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50",
                        active ? "bg-muted/60 text-foreground" : "text-foreground/80",
                      )}
                    >
                      <SvIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{t(sv.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {usage && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>{t("storageHeading")}</span>
                <span className="text-foreground">
                  {usage.unlimited
                    ? t("unlimited")
                    : t("percentUsed", { percent: usage.percent_used.toFixed(0) })}
                </span>
              </div>
              <p className="mt-1">
                {formatBytes(usage.used_bytes)}
                {!usage.unlimited && ` ${t("ofLimit", { limit: formatBytes(usage.limit_bytes) })}`}
              </p>
              <p className="mt-1">{t("filesCount", { count: usage.files_count })}</p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <section className="min-w-0 flex-1 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              data-testid="drive-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-md border border-border bg-muted/40 py-2 pl-8 pr-3 text-sm text-foreground"
            />
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {b.id === null ? (
                  <Link
                    href="/docs/drive"
                    className="hover:text-foreground"
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
            {parentId && (
              <span className="ml-2 text-foreground">{t("folderLabel")}</span>
            )}
          </nav>

          {/* Search results — overrides folder listing */}
          {searchActive ? (
            <div className="space-y-2" data-testid="drive-search-results">
              {searchQ.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("searching")}
                </div>
              )}
              {!searchQ.isLoading && (searchQ.data?.results.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
              )}
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {searchQ.data?.results.map((hit) => (
                  <li key={hit.file.id}>
                    <FileCard
                      file={hit.file}
                      onClick={() => router.push(`/docs/drive/${hit.file.id}`)}
                    />
                    {hit.highlights[0] && (
                      <p className="mt-1 line-clamp-2 px-1 text-xs text-muted-foreground">
                        <mark className="bg-primary-500/20 text-foreground">
                          …{hit.highlights[0]}…
                        </mark>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : activeSource ? (
            // Cross-source view (task attachments / compliance documents).
            // No upload dropzone here — those sources have their own upload
            // surfaces (Task detail / Compliance documents page).
            <div className="space-y-2" data-testid="drive-source-results">
              {sourceFilesQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loading")}
                </div>
              ) : (sourceFilesQ.data?.files.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("emptySource")}
                </p>
              ) : (
                <ul
                  data-testid="drive-source-grid"
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                >
                  {sourceFilesQ.data?.files.map((f) => (
                    <li key={`${f.source_type}:${f.source_id}`}>
                      <FileCard
                        file={f}
                        onClick={() => {
                          // Direct deep-link by source: task attachments
                          // open the parent task; compliance docs open
                          // the document detail page.
                          if (f.source_type === "compliance_document") {
                            router.push(`/compliance/documents/${f.source_id}`);
                          } else if (f.file_url) {
                            window.open(f.file_url, "_blank");
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              {/* Upload dropzone */}
              <MultiUploadDropzone
                workspaceId={currentWorkspaceId}
                parentId={parentId}
              />

              {/* File grid */}
              {filesQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loading")}
                </div>
              ) : (filesQ.data?.files.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("emptyFolder")}
                </p>
              ) : (
                <ul
                  data-testid="drive-file-grid"
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                >
                  {filesQ.data?.files.map((f) => (
                    <li key={f.id}>
                      <FileCard
                        file={f}
                        onClick={() => {
                          if (f.kind === "folder") {
                            router.push(`/docs/drive?folder=${f.id}`);
                          } else {
                            router.push(`/docs/drive/${f.id}`);
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {showSmartViewEditor && (
        <SmartViewEditor
          workspaceId={currentWorkspaceId}
          onClose={() => setShowSmartViewEditor(false)}
        />
      )}
    </div>
  );
}
