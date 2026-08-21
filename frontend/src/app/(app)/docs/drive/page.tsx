"use client";

import {
  ChevronRight,
  ClipboardCheck,
  FileQuestion,
  FolderPlus,
  HardDrive,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useCreateFolder,
  useDeleteDriveFile,
  useDriveFiles,
  useDriveSearch,
  useDriveUsage,
  useSmartViews,
} from "@/hooks/useDrive";
import { useSourceFiles } from "@/hooks/useFileMetadata";
import type { DriveFile, FileSourceType } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileCard } from "@/components/drive/FileCard";
import { MultiUploadDropzone } from "@/components/drive/MultiUploadDropzone";
import { QuotaBanner, StorageMeter } from "@/components/drive/QuotaBanner";
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

const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

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
  const deleteFile = useDeleteDriveFile(currentWorkspaceId);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSmartViewEditor, setShowSmartViewEditor] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DriveFile | null>(null);

  const searchActive = searchQuery.trim().length >= 2;
  const searchTyping = searchQuery.trim().length === 1;
  const searchQ = useDriveSearch(currentWorkspaceId, searchQuery);

  const usage = usageQ.data;
  const smartViews = smartViewsQ.data?.smart_views ?? [];
  const files = filesQ.data?.files ?? [];

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
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
            <HardDrive className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleCreateFolder}
            disabled={createFolder.isPending}
            data-testid="drive-new-folder"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {createFolder.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderPlus className="h-3.5 w-3.5" />
            )}
            {t("newFolder")}
          </button>
        </div>
      </header>

      <QuotaBanner usage={usage} />

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        {/* Sidebar — Smart Views + virtual source views */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:w-60 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("smartViewsHeading")}
              </span>
              <button
                onClick={() => setShowSmartViewEditor(true)}
                data-testid="drive-new-smart-view"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t("newSmartViewTitle")}
                aria-label={t("newSmartViewTitle")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {smartViews.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("noSmartViews")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {smartViews.map((sv) => (
                  <li key={sv.id}>
                    <Link
                      href={`/docs/drive/smart-views/${sv.id}`}
                      data-testid="drive-smart-view-link"
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                      <span className="truncate">{sv.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cross-source virtual views */}
          <div className="rounded-lg border border-border bg-card p-3">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("sourcesHeading")}
            </span>
            <ul className="space-y-0.5">
              <li>
                <SourceLink
                  href="/docs/drive"
                  source="drive_file"
                  icon={HardDrive}
                  label={t("viewDriveFiles")}
                  active={activeSource === null && !parentId}
                />
              </li>
              {SOURCE_VIEWS.map((sv) => (
                <li key={sv.id}>
                  <SourceLink
                    href={`/docs/drive?source=${sv.id}`}
                    source={sv.id}
                    icon={sv.icon}
                    label={t(sv.labelKey)}
                    active={activeSource === sv.id}
                  />
                </li>
              ))}
            </ul>
          </div>

          <StorageMeter usage={usage} />
        </aside>

        {/* Main content */}
        <section className="min-w-0 flex-1 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              data-testid="drive-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-500/60 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("clearSearch")}
                title={t("clearSearch")}
                data-testid="drive-search-clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchTyping && (
            <p className="text-xs text-muted-foreground">{t("searchMinLength")}</p>
          )}

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {b.id === null ? (
                  <Link href="/docs/drive" className="transition-colors hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
            {parentId && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground">{t("folderLabel")}</span>
              </>
            )}
          </nav>

          {/* Search results — overrides folder listing */}
          {searchActive ? (
            <div className="space-y-3" data-testid="drive-search-results">
              {searchQ.isLoading ? (
                <>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("searching")}
                  </p>
                  <SkeletonGrid count={3} />
                </>
              ) : (searchQ.data?.results.length ?? 0) === 0 ? (
                <EmptyState
                  icon={FileQuestion}
                  title={t("noMatches")}
                  hint={t("noMatchesHint")}
                />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("resultsCount", { count: searchQ.data!.results.length })}
                  </p>
                  <ul className={GRID}>
                    {searchQ.data?.results.map((hit) => (
                      <li key={hit.file.id} className="flex flex-col gap-1">
                        <FileCard
                          file={hit.file}
                          onClick={() => router.push(`/docs/drive/${hit.file.id}`)}
                        />
                        {hit.highlights[0] && (
                          <p className="line-clamp-2 px-1 text-xs text-muted-foreground">
                            <mark className="rounded bg-primary-500/20 px-0.5 text-foreground">
                              …{hit.highlights[0]}…
                            </mark>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : activeSource ? (
            // Cross-source view (task attachments / compliance documents).
            // No upload dropzone here — those sources have their own upload
            // surfaces (Task detail / Compliance documents page).
            <div className="space-y-3" data-testid="drive-source-results">
              {sourceFilesQ.isLoading ? (
                <SkeletonGrid count={6} />
              ) : (sourceFilesQ.data?.files.length ?? 0) === 0 ? (
                <EmptyState
                  icon={activeSource === "task_attachment" ? ListChecks : ClipboardCheck}
                  title={t("emptySource")}
                  hint={t("emptySourceHint")}
                />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("filesCount", { count: sourceFilesQ.data!.files.length })}
                  </p>
                  <ul data-testid="drive-source-grid" className={GRID}>
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
                </>
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
                <SkeletonGrid count={6} />
              ) : files.length === 0 ? (
                <EmptyState
                  icon={HardDrive}
                  title={t("emptyFolder")}
                  hint={t("emptyFolderHint")}
                />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("filesCount", { count: files.length })}
                  </p>
                  <ul data-testid="drive-file-grid" className={GRID}>
                    {files.map((f) => (
                      <li key={f.id}>
                        <FileCard
                          file={f}
                          onDelete={() => setPendingDelete(f)}
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
                </>
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

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        tone="danger"
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: pendingDelete?.file_name ?? "" })}
        confirmLabel={t("deleteConfirm")}
        isPending={deleteFile.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteFile.mutateAsync(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function SourceLink({
  href,
  source,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  source: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid="drive-source-link"
      data-source={source}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary-500/10 font-medium text-primary-600 dark:text-primary-300"
          : "text-foreground/80 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          active ? "text-primary-500" : "text-muted-foreground",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <ul className={GRID} aria-hidden data-testid="drive-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="animate-pulse rounded-xl border border-border bg-card p-3"
        >
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 shrink-0 rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
          </div>
          <div className="mt-3 h-3 w-full rounded bg-muted" />
          <div className="mt-1.5 h-3 w-5/6 rounded bg-muted" />
          <div className="mt-3 h-3 w-1/3 rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div
      data-testid="drive-empty-state"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
