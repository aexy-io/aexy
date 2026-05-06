"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { type FileAIMetadata, type FileSourceType } from "@/lib/api";
import { useFileMetadata } from "@/hooks/useFileMetadata";

import { FileAILine, FileAIStatusPill, FileAITagStrip } from "./FileAIBadges";

interface Props {
  workspaceId: string | null;
  sourceType: FileSourceType;
  sourceId: string;
  /** Optional pre-fetched ai metadata (so the popover doesn't re-query). */
  initialMetadata?: FileAIMetadata | null;
  /** Anchor content the user hovers over. */
  children: React.ReactNode;
  /** When true, also render a link to the universal file detail page. */
  showDetailLink?: boolean;
  className?: string;
}

/**
 * Hover-triggered popover that exposes the AI summary + tags for any file
 * regardless of source. Controlled by simple onMouseEnter/Leave to avoid
 * pulling in Radix Popover for a single use.
 */
export function FileMetadataPopover({
  workspaceId,
  sourceType,
  sourceId,
  initialMetadata,
  children,
  showDetailLink = true,
  className,
}: Props) {
  const t = useTranslations("drive.metadataPopover");
  const [open, setOpen] = useState(false);
  // Lazy-fetch only when the popover opens (or initialMetadata is missing).
  const fetched = useFileMetadata(
    workspaceId,
    open && !initialMetadata ? sourceType : null,
    open && !initialMetadata ? sourceId : null,
  );
  const ai: FileAIMetadata | null = initialMetadata ?? fetched.data ?? null;

  return (
    <span
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      data-testid="file-metadata-popover-anchor"
    >
      {children}
      {open && (
        <div
          role="tooltip"
          data-testid="file-metadata-popover"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-popover p-3 text-left shadow-xl"
        >
          {!ai ? (
            <p className="text-xs text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <FileAIStatusPill status={ai.ai_status} />
                {showDetailLink && workspaceId && (
                  <Link
                    href={`/docs/files/${sourceType}/${sourceId}`}
                    className="inline-flex items-center gap-1 text-primary-400 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("open")}
                  </Link>
                )}
              </div>
              {ai.ai_summary ? (
                <p className="text-foreground">{ai.ai_summary}</p>
              ) : ai.ai_status === "failed" ? (
                <p className="text-red-400">{ai.ai_error ?? t("failedFallback")}</p>
              ) : (
                <p className="text-muted-foreground">
                  {t("analysing")}
                </p>
              )}
              {ai.ai_tags.length > 0 && <FileAITagStrip tags={ai.ai_tags} max={6} />}
              {ai.ai_categories.length > 0 && (
                <p className="text-muted-foreground">
                  {ai.ai_categories.join(t("categoriesSeparator"))}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
