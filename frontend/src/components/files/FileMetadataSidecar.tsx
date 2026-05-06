"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type FileAIMetadata,
  type FileSourceType,
} from "@/lib/api";
import {
  useFileMetadata,
  useReannotateFile,
} from "@/hooks/useFileMetadata";

import { FileAIStatusPill, FileAITagStrip } from "./FileAIBadges";

interface Props {
  workspaceId: string | null;
  sourceType: FileSourceType;
  sourceId: string;
  className?: string;
}

/**
 * Vertical AI metadata column used in the universal file detail page and
 * in the compliance docs drawer. Identical shape regardless of source.
 */
export function FileMetadataSidecar({
  workspaceId,
  sourceType,
  sourceId,
  className,
}: Props) {
  const t = useTranslations("drive.metadataSidecar");
  const q = useFileMetadata(workspaceId, sourceType, sourceId);
  const reannotate = useReannotateFile(workspaceId, sourceType, sourceId);

  return (
    <aside
      data-testid="file-metadata-sidecar"
      className={`space-y-4 rounded-lg border border-border bg-muted/30 p-4 text-sm ${className ?? ""}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("heading")}
        </h3>
        <button
          type="button"
          data-testid="file-reannotate-btn"
          onClick={() => reannotate.mutate()}
          disabled={reannotate.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-xs hover:bg-background/80 disabled:opacity-50"
        >
          {reannotate.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t("reannotate")}
        </button>
      </header>

      {q.isLoading || !q.data ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : (
        <SidecarBody ai={q.data} />
      )}
    </aside>
  );
}

function SidecarBody({ ai }: { ai: FileAIMetadata }) {
  const t = useTranslations("drive.metadataSidecar");
  return (
    <div className="space-y-3">
      <FileAIStatusPill status={ai.ai_status} />

      <section>
        <h4 className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          {t("summaryHeading")}
        </h4>
        {ai.ai_status === "failed" ? (
          <p className="text-red-400">{ai.ai_error ?? t("summaryFailedFallback")}</p>
        ) : ai.ai_summary ? (
          <p className="text-foreground">{ai.ai_summary}</p>
        ) : (
          <p className="text-muted-foreground">
            {t("summaryAnalysing")}
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          {t("tagsHeading")}
        </h4>
        {ai.ai_tags.length === 0 ? (
          <p className="text-muted-foreground">{t("tagsNone")}</p>
        ) : (
          <FileAITagStrip tags={ai.ai_tags} max={20} />
        )}
      </section>

      <section>
        <h4 className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          {t("categoriesHeading")}
        </h4>
        {ai.ai_categories.length === 0 ? (
          <p className="text-muted-foreground">{t("categoriesNone")}</p>
        ) : (
          <FileAITagStrip tags={ai.ai_categories} max={10} />
        )}
      </section>

      {ai.ai_processed_at && (
        <p className="text-xs text-muted-foreground">
          {t("lastProcessed", { when: new Date(ai.ai_processed_at).toLocaleString() })}
        </p>
      )}
    </div>
  );
}
