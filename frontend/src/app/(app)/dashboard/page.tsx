"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart3, Check, Globe, Pencil, Settings2, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useMyWorkItems } from "@/hooks/useMyWorkItems";
import { useMyWorkStore } from "@/stores/myWorkStore";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useDashboardStore } from "@/stores/dashboardStore";
import { DASHBOARD_WIDGETS, isSelfContainedWidget } from "@/config/dashboardWidgets";
import { widgetRegistry } from "@/config/widgetRegistry";
import { DashboardCustomizeModal, SortableWidgetGrid } from "@/components/dashboard";
import { ComingSoonWidget } from "@/components/dashboard/widgets/ComingSoonWidget";
import { ModuleAutomationsPanel } from "@/components/ModuleAutomationsPanel";

/**
 * Home — what is on your plate right now.
 *
 * This is the landing page, and it used to be the personal *insights* dashboard:
 * language proficiency, growth trajectory, peer benchmarks. Useful, but not what
 * you open the app to find out. The insights dashboard still exists, one click
 * away at /dashboard/overview; the work you have been assigned is what greets
 * you.
 *
 * Built out of the same widget system as that dashboard — same registry, same
 * drag-to-reorder, same customize modal — but its layout is stored under its own
 * surface, so rearranging one does not disturb the other.
 */
export default function HomePage() {
  const t = useTranslations("myWork");
  const { user } = useAuth();
  const { switchWorkspace } = useWorkspace();
  const { workspaces, showWorkspaceFilter, scope, canSeeTickets, currentWorkspaceId } =
    useMyWorkItems();
  const { setWorkspaceScope } = useMyWorkStore();
  const { preferences, isLoading: prefsLoading, reorderWidgets } =
    useDashboardPreferences("my_work");
  const { isModalOpen, setModalOpen, isCustomizing, setCustomizing } = useDashboardStore();
  const [showAutomations, setShowAutomations] = useState(false);

  // Widgets that read props from the Insights dashboard's own state are dropped
  // rather than rendered bare. The picker already hides them here, but a layout
  // saved before that — or by a future surface — would still list them.
  const visibleWidgets = useMemo(
    () => (preferences?.visible_widgets ?? []).filter(isSelfContainedWidget),
    [preferences?.visible_widgets]
  );
  const orderedVisibleWidgets = useMemo(() => {
    const visible = new Set(visibleWidgets);
    const ordered = (preferences?.widget_order ?? visibleWidgets).filter((id: string) =>
      visible.has(id)
    );
    for (const id of visibleWidgets) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }, [preferences?.widget_order, visibleWidgets]);

  const getWidgetGridClass = (widgetId: string): string => {
    const size = preferences?.widget_sizes?.[widgetId] || DASHBOARD_WIDGETS[widgetId]?.defaultSize;
    switch (size) {
      case "large":
        return "col-span-1 sm:col-span-2";
      case "full":
        return "col-span-full";
      default:
        return "col-span-1";
    }
  };

  const renderWidget = (widgetId: string): React.ReactNode => {
    if (!(widgetId in widgetRegistry)) {
      return <ComingSoonWidget key={widgetId} widgetId={widgetId} />;
    }
    const Widget = widgetRegistry[widgetId];
    return <Widget key={widgetId} />;
  };

  /**
   * Changing the scope to a single workspace switches the app's workspace too.
   * Leaving the header pointed at one workspace while the list showed another
   * is exactly the confusion this filter exists to end.
   */
  const handleScopeChange = (value: string) => {
    setWorkspaceScope(value);
    if (value !== "all" && value !== currentWorkspaceId) {
      switchWorkspace(value);
    }
  };

  const firstName = (user?.name || user?.email || "").split(/[\s@]/)[0];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {firstName ? t("greetingNamed", { name: firstName }) : t("greeting")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showWorkspaceFilter && (
            <label className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">{t("workspaceScope")}</span>
              <select
                value={scope ?? ""}
                onChange={(e) => handleScopeChange(e.target.value)}
                data-testid="my-work-workspace-scope"
                className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent transition"
              >
                <option value="all">{t("allWorkspaces")}</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canSeeTickets && (
            <button
              type="button"
              onClick={() => setShowAutomations((v) => !v)}
              aria-pressed={showAutomations}
              data-testid="my-work-automations-toggle"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border transition"
            >
              <Zap className="h-4 w-4" />
              {t("automations")}
            </button>
          )}

          <Link
            href="/dashboard/overview"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border transition"
          >
            <BarChart3 className="h-4 w-4" />
            {t("insightsLink")}
          </Link>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border transition"
          >
            <Settings2 className="h-4 w-4" />
            {t("customize")}
          </button>

          <button
            type="button"
            onClick={() => setCustomizing(!isCustomizing)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              isCustomizing
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            {isCustomizing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {isCustomizing ? t("done") : t("editLayout")}
          </button>
        </div>
      </div>

      {prefsLoading ? (
        // A skeleton, not the empty state: preferences arrive a moment after
        // the page does, and "your dashboard is empty" is a claim, not a
        // loading indicator.
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl" />
          ))}
          <div className="sm:col-span-2 h-80 bg-card border border-border rounded-xl" />
          <div className="h-80 bg-card border border-border rounded-xl" />
        </div>
      ) : orderedVisibleWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Settings2 className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">{t("noWidgets")}</h3>
          <p className="text-muted-foreground text-sm mb-6">{t("noWidgetsDescription")}</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition"
          >
            <Settings2 className="w-4 h-4" />
            {t("customize")}
          </button>
        </div>
      ) : (
        <SortableWidgetGrid
          widgetOrder={orderedVisibleWidgets}
          onReorder={reorderWidgets}
          isEditing={isCustomizing}
          renderWidget={renderWidget}
          getGridClass={getWidgetGridClass}
        />
      )}

      {/* Ticket automations were a tab on the old My Work page. They are
          configuration rather than work, so they open on request instead of
          taking a permanent slot on a dashboard about what is on your plate. */}
      {showAutomations && canSeeTickets && (
        <ModuleAutomationsPanel module="tickets" moduleLabel={t("stats.tickets")} />
      )}

      <DashboardCustomizeModal
        open={isModalOpen}
        onOpenChange={setModalOpen}
        surface="my_work"
      />
    </div>
  );
}
