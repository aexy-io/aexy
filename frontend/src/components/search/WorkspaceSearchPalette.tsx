"use client";

import {
  File,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { type FileSearchHit, type FileSourceType } from "@/lib/api";
import { useWorkspaceSearch } from "@/hooks/useFileMetadata";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

import { FileAIStatusPill, FileAITagStrip } from "@/components/files/FileAIBadges";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  doc: FileText,
  audio: File,
  folder: Folder,
};

/**
 * Cmd+K palette mounted at the app shell level. Listens for Cmd/Ctrl+K
 * globally; debounced search via React Query; up/down + Enter for
 * keyboard nav. Hits link to the universal file detail page.
 */
export function WorkspaceSearchPalette() {
  const t = useTranslations("drive.search");
  const SOURCE_LABEL: Record<FileSourceType, string> = {
    drive_file: t("sourceDrive"),
    task_attachment: t("sourceTask"),
    compliance_document: t("sourceCompliance"),
  };
  const { currentWorkspaceId } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useWorkspaceSearch(currentWorkspaceId, query);
  const hits: FileSearchHit[] = useMemo(() => data?.results ?? [], [data]);

  // Cmd+Shift+F (or Ctrl+Shift+F) — content search across files. The
  // existing CommandPalette owns plain Cmd+K (navigation commands), so we
  // claim Shift+F for file content search to avoid the conflict.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus on next tick to land after the dialog mounts.
      setTimeout(() => inputRef.current?.focus(), 0);
      setHighlight(0);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, hits.length]);

  if (!open) return null;

  const navigate = (hit: FileSearchHit) => {
    setOpen(false);
    router.push(`/docs/files/${hit.source_type}/${hit.source_id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && hits[highlight]) {
      e.preventDefault();
      navigate(hits[highlight]);
    }
  };

  return (
    <div
      data-testid="workspace-search-palette"
      role="dialog"
      aria-label={t("ariaLabel")}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            data-testid="workspace-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            className="w-full bg-transparent text-sm text-foreground outline-none"
          />
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul
          data-testid="workspace-search-results"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {query.trim().length < 2 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("minLength")}
            </li>
          )}
          {query.trim().length >= 2 && !isFetching && hits.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("noFiles")}
            </li>
          )}
          {hits.map((hit, i) => {
            const Icon =
              (hit.content_type?.startsWith("image/") && ImageIcon) ||
              (hit.content_type?.startsWith("video/") && Film) ||
              (hit.content_type === "application/pdf" && FileText) ||
              File;
            return (
              <li key={hit.metadata_id}>
                <button
                  type="button"
                  data-testid="workspace-search-result"
                  data-source-type={hit.source_type}
                  data-source-id={hit.source_id}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => navigate(hit)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2 text-left",
                    i === highlight ? "bg-muted/60" : "hover:bg-muted/40",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground">
                        {hit.file_name}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {SOURCE_LABEL[hit.source_type]}
                      </span>
                    </div>
                    {hit.ai_summary && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {hit.ai_summary}
                      </p>
                    )}
                    {hit.highlights[0] && hit.highlights[0] !== hit.ai_summary && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        <mark className="bg-primary-500/20 text-foreground">
                          {hit.highlights[0]}
                        </mark>
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <FileAIStatusPill status={hit.ai_status} />
                      <FileAITagStrip tags={hit.ai_tags} max={3} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          {t("footerHint")}
        </div>
      </div>
    </div>
  );
}
