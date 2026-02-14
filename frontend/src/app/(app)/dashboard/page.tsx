"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import { analysisApi, DeveloperInsights, SoftSkillsProfile } from "@/lib/api";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useDashboardStore } from "@/stores/dashboardStore";
import { DASHBOARD_WIDGETS } from "@/config/dashboardWidgets";
import { getWidgetComponent, widgetRegistry } from "@/config/widgetRegistry";
import {
  DashboardCustomizeModal,
  SortableWidgetGrid,
} from "@/components/dashboard";
import { ComingSoonWidget } from "@/components/dashboard/widgets/ComingSoonWidget";
import { Pencil, Check } from "lucide-react";

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [insights, setInsights] = useState<DeveloperInsights | null>(null);
  const [softSkills, setSoftSkills] = useState<SoftSkillsProfile | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [softSkillsLoading, setSoftSkillsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dashboard customization
  const { preferences, isLoading: prefsLoading, reorderWidgets } = useDashboardPreferences();
  const { isModalOpen, setModalOpen, isCustomizing, setCustomizing } = useDashboardStore();

  const defaultWidgetOrder = [
    "welcome", "quickStats", "languageProficiency", "workPatterns",
    "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
    "growthTrajectory", "peerBenchmark", "taskMatcher",
    "trackingSummary", "sprintOverview",
    "ticketStats", "crmPipeline",
    "aiAgents",
    "myGoals", "performanceReviews",
  ];

  const visibleWidgets = preferences?.visible_widgets || defaultWidgetOrder;
  const widgetOrder = preferences?.widget_order || visibleWidgets;

  // Compute the ordered list of visible widgets
  const orderedVisibleWidgets = useMemo(() => {
    const visibleSet = new Set(visibleWidgets);
    // Start with widgets from the order that are also visible
    const ordered = widgetOrder.filter((id: string) => visibleSet.has(id));
    // Add any visible widgets not yet in the order
    visibleWidgets.forEach((id: string) => {
      if (!ordered.includes(id)) {
        ordered.push(id);
      }
    });
    return ordered;
  }, [widgetOrder, visibleWidgets]);

  const fetchInsights = useCallback(async () => {
    if (!user?.id) return;
    setInsightsLoading(true);
    try {
      const data = await analysisApi.getDeveloperInsights(user.id);
      setInsights(data);
      if (data?.soft_skills) {
        setSoftSkills(data.soft_skills);
      }
    } catch (error) {
      console.error("Failed to fetch insights:", error);
    } finally {
      setInsightsLoading(false);
    }
  }, [user?.id]);

  const fetchSoftSkills = useCallback(async () => {
    if (!user?.id) return;
    setSoftSkillsLoading(true);
    try {
      const data = await analysisApi.getSoftSkills(user.id);
      setSoftSkills(data);
    } catch (error) {
      console.error("Failed to fetch soft skills:", error);
    } finally {
      setSoftSkillsLoading(false);
    }
  }, [user?.id]);

  const handleRefreshInsights = useCallback(async () => {
    if (!user?.id) return;
    setIsRefreshing(true);
    try {
      await analysisApi.refreshAnalysis(user.id, true);
      await fetchInsights();
    } catch (error) {
      console.error("Failed to refresh insights:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.id, fetchInsights]);

  useEffect(() => {
    if (user?.id) {
      fetchInsights();
      fetchSoftSkills();
    }
  }, [user?.id, fetchInsights, fetchSoftSkills]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const skillFingerprint = user?.skill_fingerprint;
  const workPatterns = user?.work_patterns;

  // Calculate quick stats
  const totalLanguages = skillFingerprint?.languages?.length || 0;
  const totalFrameworks = skillFingerprint?.frameworks?.length || 0;
  const topLanguage = skillFingerprint?.languages?.[0]?.name || "N/A";
  const avgPRSize = workPatterns?.average_pr_size || 0;

  // Map widget IDs to the props they need
  const getWidgetProps = (widgetId: string): Record<string, unknown> => {
    switch (widgetId) {
      case "welcome":
        return { user, onCustomize: () => setModalOpen(true) };
      case "quickStats":
        return {
          totalLanguages,
          totalFrameworks,
          topLanguage,
          avgPRSize,
          collaborationStyle: workPatterns?.collaboration_style || "N/A",
        };
      case "languageProficiency":
        return { languages: skillFingerprint?.languages };
      case "workPatterns":
        return { workPatterns };
      case "domainExpertise":
        return { domains: skillFingerprint?.domains };
      case "frameworksTools":
        return { frameworks: skillFingerprint?.frameworks };
      case "aiInsights":
        return {
          insights,
          softSkills,
          insightsLoading,
          softSkillsLoading,
          isRefreshing,
          onRefresh: handleRefreshInsights,
          growth: user?.growth_trajectory,
          userId: user?.id,
          showInsights: visibleWidgets.includes("aiInsights"),
          showSoftSkills: visibleWidgets.includes("softSkills"),
          showGrowth: visibleWidgets.includes("growthTrajectory"),
          showBenchmark: visibleWidgets.includes("peerBenchmark"),
        };
      case "softSkills":
        // The SoftSkillsWidget here is the Reviews & Goals section
        return {
          showGoals: visibleWidgets.includes("myGoals"),
          showReviews: visibleWidgets.includes("performanceReviews"),
        };
      default:
        // For widgets without special props (AIAgentsWidget, TicketStats, etc.)
        // or unimplemented widgets (ComingSoonWidget)
        if (!(widgetId in widgetRegistry)) {
          return { widgetId };
        }
        return {};
    }
  };

  // Widget size mapping for grid column spans
  const getWidgetGridClass = (widgetId: string): string => {
    const widgetSizes = preferences?.widget_sizes || {};
    const widget = DASHBOARD_WIDGETS[widgetId];
    const size = widgetSizes[widgetId] || widget?.defaultSize || "medium";

    switch (size) {
      case "small":
        return "col-span-1";
      case "medium":
        return "col-span-1 lg:col-span-1";
      case "large":
        return "col-span-1 lg:col-span-2";
      case "full":
        return "col-span-full";
      default:
        return "col-span-1";
    }
  };

  // Handle reorder from SortableWidgetGrid
  const handleReorder = (fromIndex: number, toIndex: number) => {
    reorderWidgets(fromIndex, toIndex);
  };

  // Render a single widget by ID
  const renderWidget = (widgetId: string): React.ReactNode => {
    // Skip sub-widgets that are rendered inside composite widgets
    const compositeChildren = [
      "growthTrajectory", "peerBenchmark", "myGoals", "performanceReviews",
    ];
    if (compositeChildren.includes(widgetId)) {
      return null;
    }

    const props = getWidgetProps(widgetId);

    if (!(widgetId in widgetRegistry)) {
      return <ComingSoonWidget key={widgetId} widgetId={widgetId} />;
    }

    const Widget = widgetRegistry[widgetId];
    return <Widget key={widgetId} {...props} />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      {/* Edit Layout Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setCustomizing(!isCustomizing)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            isCustomizing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border"
          }`}
        >
          {isCustomizing ? (
            <>
              <Check className="w-4 h-4" />
              Done
            </>
          ) : (
            <>
              <Pencil className="w-4 h-4" />
              Edit Layout
            </>
          )}
        </button>
      </div>

      {/* Dynamic Widget Rendering */}
      <SortableWidgetGrid
        widgetOrder={orderedVisibleWidgets}
        onReorder={handleReorder}
        isEditing={isCustomizing}
        renderWidget={renderWidget}
        getGridClass={getWidgetGridClass}
      />

      {/* Dashboard Customize Modal */}
      <DashboardCustomizeModal
        open={isModalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
