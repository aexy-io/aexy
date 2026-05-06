"use client";

import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { type FileAIMetadata, type FileAIStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Small status pill used wherever AI status is shown. */
export function FileAIStatusPill({
  status,
  className,
}: {
  status: FileAIStatus;
  className?: string;
}) {
  const t = useTranslations("drive.aiBadges");
  if (status === "done") {
    return (
      <span
        data-testid="file-ai-status"
        data-status="done"
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300",
          className,
        )}
      >
        <Sparkles className="h-3 w-3" /> {t("ready")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        data-testid="file-ai-status"
        data-status="failed"
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300",
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3" /> {t("failed")}
      </span>
    );
  }
  // pending | processing
  return (
    <span
      data-testid="file-ai-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200",
        className,
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" /> {t("ai")}
    </span>
  );
}

/** Inline tag chips. Truncates after `max` and shows a `+N` suffix. */
export function FileAITagStrip({
  tags,
  max = 4,
  className,
}: {
  tags: string[];
  max?: number;
  className?: string;
}) {
  const t = useTranslations("drive.aiBadges");
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  const overflow = tags.length - shown.length;
  return (
    <span
      data-testid="file-ai-tag-strip"
      className={cn("flex flex-wrap gap-1", className)}
    >
      {shown.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[10px] text-primary-300"
        >
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">{t("overflow", { count: overflow })}</span>
      )}
    </span>
  );
}

/** Combined helper used inside lists and popovers. */
export function FileAILine({ ai }: { ai: FileAIMetadata }) {
  return (
    <div className="flex items-center gap-2">
      <FileAIStatusPill status={ai.ai_status} />
      <FileAITagStrip tags={ai.ai_tags} />
    </div>
  );
}
