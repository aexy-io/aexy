"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import {
  Plus,
  Zap,
  Play,
  Pause,
  Trash2,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAutomations } from "@/hooks/useAutomations";
import { AutomationModule, Automation } from "@/lib/api";
import { formatAbsolute, formatRelative } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ALL_MODULES,
  moduleColors,
  moduleIcons,
  moduleLabels,
} from "@/lib/automationTemplates";

function ModuleBadge({ module }: { module: AutomationModule }) {
  const Icon = moduleIcons[module] || Zap;
  const color = moduleColors[module] || "bg-muted-foreground/20 text-muted-foreground";
  const label = moduleLabels[module] || module;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onDelete,
  editHref,
}: {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
  editHref: string;
}) {
  const t = useTranslations("automations");
  // UX-AGT-DTL-009: wrap content in a real <Link> instead of
  // <div onClick={onEdit}>. Middle-click / cmd-click now open in a
  // new tab; right-click "Copy link" works; screen readers announce
  // the row as a link. Nested action buttons keep their existing
  // stopPropagation so they don't trigger the Link navigation.
  return (
    <Link
      href={editHref}
      className="bg-muted/50 border border-border rounded-xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer group block"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${automation.is_active ? "bg-green-500/20 text-green-700 dark:text-green-400" : "bg-accent text-muted-foreground"}`}>
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-foreground font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{automation.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <ModuleBadge module={automation.module as AutomationModule} />
            </div>
          </div>
        </div>
        {/* Inline actions. preventDefault + stopPropagation each stop
            the parent <Link> from navigating when the user wanted
            Pause / Delete. The Edit-icon button is gone — the whole
            card is already an edit-link, so it was redundant + nested
            buttons inside <Link> is invalid HTML. */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            aria-label={automation.is_active ? "Pause automation" : "Activate automation"}
            title={automation.is_active ? "Pause automation" : "Activate automation"}
            className={`p-2 rounded-lg transition-colors ${
              automation.is_active
                ? "bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30"
                : "bg-accent text-muted-foreground hover:bg-muted"
            }`}
          >
            {automation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete automation"
            title="Delete automation"
            className="p-2 rounded-lg bg-accent text-muted-foreground hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {automation.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{automation.description}</p>
      )}

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Trigger:</span>
          <span className="text-foreground">{automation.trigger_type.replace(/[._]/g, " ")}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Actions:</span>
          <span className="text-foreground">
            {t("card.actions", { count: automation.actions.length })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {t("card.runs", { count: automation.total_runs })}
        </span>
        {automation.last_run_at && (
          <span
            className="flex items-center gap-1"
            // UX-AUT-LST-010: title carries the absolute local time so
            // users hovering can see the precise minute even though
            // the visible label is relative ("3h ago"). Drops the
            // date-only formatting that lost time-of-day in the prior
            // implementation.
            title={formatAbsolute(automation.last_run_at)}
          >
            <Clock className="h-3 w-3" />
            Last run: {formatRelative(automation.last_run_at)}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function AutomationsPage() {
  const t = useTranslations("automations");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  // Track the full automation so the confirm dialog can name it
  // (UX-AUT-LST-007). The prior id-only state lost the name when the
  // delete-target row scrolled off-screen or filters changed.
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);

  // Get initial module filter from URL
  const initialModule = searchParams.get("module") as AutomationModule | null;
  const [selectedModule, setSelectedModule] = useState<AutomationModule | null>(initialModule);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    automations,
    isLoading,
    toggleAutomation,
    deleteAutomation,
  } = useAutomations(workspaceId, { module: selectedModule || undefined });

  const filteredAutomations = automations.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleModuleChange = (module: AutomationModule | null) => {
    setSelectedModule(module);
    // Sync the filter through Next router so the back-button restores
    // the prior filter. The earlier window.history.replaceState path
    // worked visually but bypassed Next's navigation state, so going
    // back from a deeper route landed on the unfiltered list.
    const params = new URLSearchParams(searchParams.toString());
    if (module) {
      params.set("module", module);
    } else {
      params.delete("module");
    }
    const qs = params.toString();
    router.replace(qs ? `/automations?${qs}` : "/automations", {
      scroll: false,
    });
  };

  const handleDeleteAutomation = (automation: Automation) => {
    setDeleteTarget(automation);
  };

  const confirmDeleteAutomation = async () => {
    if (!deleteTarget) return;
    await deleteAutomation(deleteTarget.id);
  };

  const handleCreateNew = () => {
    const url = selectedModule
      ? `/automations/new?module=${selectedModule}`
      : "/automations/new";
    router.push(url);
  };

  return (
    <div>
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex w-full sm:flex-row flex-col sm:items-center sm:justify-between items-start mb-6 gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <Plus className="h-4 w-4" />
              {t("createAutomation")}
            </button>
          </div>

          <UpgradeBanner trigger="automation_limit" compact />

          {/* Module Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 border border-border rounded-xl mb-6 overflow-x-auto">
            <button
              onClick={() => handleModuleChange(null)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                selectedModule === null ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("filter.allModules")}
            </button>
            {ALL_MODULES.map((module) => {
              const Icon = moduleIcons[module];
              return (
                <button
                  key={module}
                  onClick={() => handleModuleChange(module)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    selectedModule === module ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {moduleLabels[module]}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t("search.placeholder")}
              wrapperClassName="flex-1"
            />
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredAutomations.length === 0 ? (
            // UX-AUT-LST-009: distinguish three empty cases — search miss
            // (user knows results exist somewhere, just not matching this
            // query), module-scoped empty (user knows this module is
            // empty but other modules may have content), and global
            // empty. Search miss wins over module filter because clearing
            // the search is the smaller corrective action.
            searchQuery ? (
              <EmptyState
                icon={Zap}
                title={t("empty.searchTitle", { query: searchQuery })}
                description={t("empty.searchDescription")}
                actions={[
                  { label: t("search.clear"), onClick: () => setSearchQuery("") },
                ]}
              />
            ) : selectedModule ? (
              <EmptyState
                icon={Zap}
                title={t("empty.moduleTitle", { module: moduleLabels[selectedModule] })}
                description={t("empty.moduleDescription", { module: moduleLabels[selectedModule] })}
                actions={[
                  { label: t("createAutomation"), onClick: handleCreateNew },
                ]}
                templateHref="/templates?category=automations"
              />
            ) : (
              <EmptyState
                icon={Zap}
                title={t("empty.title")}
                description={t("empty.description")}
                actions={[
                  { label: t("createAutomation"), onClick: handleCreateNew },
                ]}
                templateHref="/templates?category=automations"
              />
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAutomations.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  onToggle={() => toggleAutomation(automation.id)}
                  onDelete={() => handleDeleteAutomation(automation)}
                  editHref={`/automations/${automation.id}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("delete.title")}
        // UX-AUT-LST-007: name the automation in the destructive copy so
        // users about to delete the wrong row catch it. Falls back to
        // generic copy if name is empty (untitled / mid-rename).
        description={
          deleteTarget?.name
            ? t("delete.descriptionNamed", { name: deleteTarget.name })
            : t("delete.description")
        }
        confirmLabel={t("delete.confirm")}
        onConfirm={confirmDeleteAutomation}
        tone="danger"
      />
    </div>
  );
}
