"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { DocumentTemplate, TemplateListItem } from "@/lib/api";
import { useTemplates } from "@/hooks/useDocuments";
import { BLANK_TEMPLATE_ID } from "./templateIds";

interface DocumentEmptyStateProps {
  workspaceId: string;
  /** Called with the fully-loaded template — the list items carry no content. */
  onApply: (template: DocumentTemplate) => void;
}

/**
 * The way out of a blank page you are already looking at.
 *
 * The picker on the docs landing page only helps somebody who has not created the
 * document yet; anyone who hit "new" and landed on an empty editor had no way to
 * start from a template short of deleting the document and going back. This shows
 * the same catalogue under the title and gets out of the way on the first
 * keystroke, so it costs nothing to ignore.
 *
 * "Blank" is filtered out on purpose: it is the state the reader is already in.
 */
export function DocumentEmptyState({ workspaceId, onApply }: DocumentEmptyStateProps) {
  const t = useTranslations("docs.emptyState");
  const { templates, getTemplate } = useTemplates(workspaceId);
  const [applying, setApplying] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const offered = (templates ?? []).filter(
    (template) => template.id !== BLANK_TEMPLATE_ID,
  );
  if (offered.length === 0) return null;

  const apply = async (item: TemplateListItem) => {
    setApplying(item.id);
    setFailed(false);
    try {
      onApply(await getTemplate(item.id));
    } catch (error) {
      console.error("Failed to load template:", error);
      setFailed(true);
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="mb-8" data-testid="document-empty-state">
      <p className="mb-3 text-sm text-muted-foreground">
        {t("prompt")}
      </p>
      <div className="flex flex-wrap gap-2">
        {offered.map((template) => (
          <button
            key={template.id}
            onClick={() => apply(template)}
            disabled={applying !== null}
            title={template.description ?? undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground transition hover:border-primary-500/50 hover:bg-muted disabled:opacity-50"
          >
            {applying === template.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <span aria-hidden>{template.icon || "📄"}</span>
            )}
            {template.name}
          </button>
        ))}
      </div>
      {failed && (
        <p className="mt-2 text-xs text-destructive">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
