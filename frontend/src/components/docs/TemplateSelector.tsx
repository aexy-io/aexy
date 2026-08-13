"use client";

import { useMemo, useState } from "react";
import { Copy, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateListItem, TemplateCategory } from "@/lib/api";
import { useTemplates } from "@/hooks/useDocuments";
import { Spinner } from "@/components/ui/spinner";

interface TemplateSelectorProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: TemplateListItem | null) => void;
  /** Offered as its own card when the caller can act on it. */
  onGenerateFromCode?: () => void;
}

/** Display order and headings. A category with no templates is not rendered. */
const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  general: "Planning & process",
  module_docs: "Architecture",
  guides: "Guides & runbooks",
  api_docs: "API documentation",
  readme: "Project README",
  function_docs: "Function documentation",
  changelog: "Changelog",
  custom: "Custom",
};

const CATEGORY_ORDER: TemplateCategory[] = [
  "general",
  "module_docs",
  "guides",
  "api_docs",
  "readme",
  "function_docs",
  "changelog",
  "custom",
];

/**
 * Pick a starting point for a new document.
 *
 * This used to render one card *per category* and open `categoryTemplates[0]` on
 * click, which was invisible while the template table was empty and wrong the
 * moment it was not: four templates share "general", so clicking it would have
 * silently picked one of them. Templates are the unit of choice here; categories
 * are only headings.
 */
export function TemplateSelector({
  workspaceId,
  isOpen,
  onClose,
  onSelect,
  onGenerateFromCode,
}: TemplateSelectorProps) {
  const { templates, isLoading, duplicateTemplate } = useTemplates(workspaceId);
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (templates ?? []).filter(
      (template) =>
        !needle ||
        template.name.toLowerCase().includes(needle) ||
        (template.description ?? "").toLowerCase().includes(needle),
    );
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: matching.filter((template) => template.category === category),
    })).filter((group) => group.items.length > 0);
  }, [templates, query]);

  if (!isOpen) return null;

  const choose = (template: TemplateListItem) => {
    onSelect(template);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Choose a template">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">New document</h2>
            <p className="text-sm text-muted-foreground">
              Start from a template, or from a blank page
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              aria-label="Search templates"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {onGenerateFromCode && !query && (
            <button
              onClick={() => {
                onGenerateFromCode();
                onClose();
              }}
              className="group mb-6 flex w-full items-center gap-4 rounded-xl border border-purple-700/50 bg-gradient-to-r from-purple-900/30 to-blue-900/30 p-4 text-left transition hover:from-purple-900/50 hover:to-blue-900/50"
            >
              <div className="rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 p-3">
                <Sparkles className="h-5 w-5 text-white" aria-hidden />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">Generate from code</h3>
                <p className="text-sm text-muted-foreground">
                  Point AI at a repository and let it draft the document
                </p>
              </div>
            </button>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="xs" label="Loading templates" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No template matches “{query}”.
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.category}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.items.map((template) => (
                      <div
                        key={template.id}
                        className="group relative rounded-xl border border-border bg-muted/40 transition hover:border-primary-500/50 hover:bg-muted"
                      >
                        <button
                          onClick={() => choose(template)}
                          className="flex w-full items-start gap-3 p-4 text-left"
                        >
                          <span className="text-xl leading-none" aria-hidden>
                            {template.icon || "📄"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {template.name}
                            </span>
                            {template.description && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {template.description}
                              </span>
                            )}
                            {!template.is_system && (
                              <span className="mt-1.5 inline-block rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                This workspace
                              </span>
                            )}
                          </span>
                        </button>
                        {/* Forking a system template is how a workspace gets an
                            editable version of it — the model has always supported
                            workspace-scoped templates, with no way in from the UI. */}
                        {template.is_system && (
                          <button
                            onClick={() => duplicateTemplate.mutate(template.id)}
                            disabled={duplicateTemplate.isPending}
                            title="Save an editable copy to this workspace"
                            aria-label={`Customise ${template.name}`}
                            className={cn(
                              "absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition",
                              "opacity-0 hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100",
                            )}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
