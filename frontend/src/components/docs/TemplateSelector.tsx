"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Pencil, Search, Sparkles, Trash2, X } from "lucide-react";
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

/** Display order. A category with no templates is not rendered; the headings
 *  themselves live in `docs.templates.categories`. */
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
  const t = useTranslations("docs.templates");
  const tc = useTranslations("common");
  const { templates, isLoading, duplicateTemplate, updateTemplate, removeTemplate } =
    useTemplates(workspaceId);
  const [query, setQuery] = useState("");
  // Curating a template happens here rather than on a settings page of its own:
  // this is already the one screen where somebody looks at the whole set, and a
  // fork made from the button beside it is the usual reason to want a rename.
  // Only one card is ever in a non-default state, so this is one id, not a map.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);

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
      label: t(`categories.${category}`),
      items: matching.filter((template) => template.category === category),
    })).filter((group) => group.items.length > 0);
  }, [templates, query, t]);

  if (!isOpen) return null;

  const choose = (template: TemplateListItem) => {
    onSelect(template);
    onClose();
  };

  const commitRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    // An empty name would leave a nameless card that nobody can identify again,
    // so it cancels rather than saves.
    if (name) await updateTemplate.mutateAsync({ templateId: editing.id, name });
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t("dialogLabel")}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("heading")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("subheading")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
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
              placeholder={t("search")}
              aria-label={t("search")}
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
                <h3 className="font-medium text-foreground">{t("generateHeading")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("generateBody")}
                </p>
              </div>
            </button>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="xs" label={t("loading")} />
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("noMatch", { query })}
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
                        {editing?.id === template.id ? (
                          <div className="flex items-center gap-2 p-4">
                            <input
                              autoFocus
                              value={editing.name}
                              aria-label={t("renameLabel", { name: template.name })}
                              onChange={(event) =>
                                setEditing({ id: template.id, name: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRename();
                                if (event.key === "Escape") setEditing(null);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <button
                              onClick={commitRename}
                              disabled={updateTemplate.isPending}
                              aria-label={t("saveName")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              aria-label={t("cancelRename")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : retiring === template.id ? (
                          <div className="flex items-center justify-between gap-2 p-4">
                            <p className="text-sm text-foreground">
                              {t("retireConfirm", { name: template.name })}
                            </p>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={async () => {
                                  await removeTemplate.mutateAsync(template.id);
                                  setRetiring(null);
                                }}
                                disabled={removeTemplate.isPending}
                                className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {t("retire")}
                              </button>
                              <button
                                onClick={() => setRetiring(null)}
                                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                {tc("cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
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
                                {t("workspaceBadge")}
                              </span>
                            )}
                          </span>
                        </button>
                        )}
                        {/* Hover controls. Which ones appear is the whole
                            distinction between the two kinds of template: a
                            system one ships with the code and can only be
                            forked, a workspace one is the workspace's to curate. */}
                        {!editing && retiring !== template.id && (
                          <div
                            className={cn(
                              "absolute right-2 top-2 flex items-center gap-1 transition",
                              "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
                            )}
                          >
                            {template.is_system ? (
                              /* Forking a system template is how a workspace gets
                                 an editable version of it — the model has always
                                 supported workspace-scoped templates, with no way
                                 in from the UI. */
                              <button
                                onClick={() => duplicateTemplate.mutate(template.id)}
                                disabled={duplicateTemplate.isPending}
                                title={t("customiseTitle")}
                                aria-label={t("customiseLabel", { name: template.name })}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() =>
                                    setEditing({ id: template.id, name: template.name })
                                  }
                                  title={t("renameTitle")}
                                  aria-label={t("renameLabel", { name: template.name })}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                                </button>
                                <button
                                  onClick={() => setRetiring(template.id)}
                                  title={t("retireTitle")}
                                  aria-label={t("retireLabel", { name: template.name })}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              </>
                            )}
                          </div>
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
