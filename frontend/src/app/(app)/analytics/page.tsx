"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Users,
  TrendingUp,
  Network,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  analyticsApi,
  developerApi,
  SkillHeatmapData,
  ProductivityTrends,
  WorkloadDistribution,
  CollaborationGraph,
  Developer,
} from "@/lib/api";
import {
  SkillHeatmap,
  ProductivityChart,
  WorkloadPieChart,
  CollaborationGraph as CollaborationGraphComponent,
} from "@/components/charts";

export default function AnalyticsPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [skillHeatmap, setSkillHeatmap] = useState<SkillHeatmapData | null>(null);
  const [productivity, setProductivity] = useState<ProductivityTrends | null>(null);
  const [workload, setWorkload] = useState<WorkloadDistribution | null>(null);
  const [collaboration, setCollaboration] = useState<CollaborationGraph | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    developers: true,
    heatmap: false,
    productivity: false,
    workload: false,
    collaboration: false,
  });

  const fetchDevelopers = useCallback(async (): Promise<Developer[]> => {
    try {
      const data = await developerApi.list();
      setDevelopers(data);
      return data;
    } catch (error) {
      console.error("Failed to fetch developers:", error);
      return [];
    } finally {
      setLoadingStates((prev) => ({ ...prev, developers: false }));
    }
  }, []);

  const fetchAnalytics = useCallback(async (developerIds: string[]) => {
    if (developerIds.length === 0) return;

    setLoadingStates((prev) => ({
      ...prev,
      heatmap: true,
      productivity: true,
      workload: true,
      collaboration: true,
    }));

    // Fetch all analytics in parallel
    try {
      const [heatmapData, productivityData, workloadData, collaborationData] =
        await Promise.all([
          analyticsApi.getSkillHeatmap(developerIds).catch(() => null),
          analyticsApi.getProductivityTrends(developerIds).catch(() => null),
          analyticsApi.getWorkloadDistribution(developerIds).catch(() => null),
          analyticsApi.getCollaborationNetwork(developerIds).catch(() => null),
        ]);

      setSkillHeatmap(heatmapData);
      setProductivity(productivityData);
      setWorkload(workloadData);
      setCollaboration(collaborationData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoadingStates((prev) => ({
        ...prev,
        heatmap: false,
        productivity: false,
        workload: false,
        collaboration: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDevelopers().then((devs) => {
        if (devs.length > 0) {
          const developerIds = devs.map((d) => d.id);
          fetchAnalytics(developerIds);
        }
      });
    }
  }, [isAuthenticated, fetchDevelopers, fetchAnalytics]);

  const handleRefresh = () => {
    if (developers.length > 0) {
      fetchAnalytics(developers.map((d) => d.id));
    }
  };

  if (isLoading || loadingStates.developers) {
    // Laid out like the page it becomes, in the page's own container. The
    // full-viewport spinner this replaces was sized for a screen it no longer
    // has: inside the shell it centred against the whole window and pushed the
    // charts down by a header's worth when they arrived.
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="h-9 w-56 rounded bg-accent animate-pulse" />
        <div className="h-14 rounded-xl border border-border bg-muted animate-pulse" />
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="lg:col-span-2 h-64 rounded-xl border border-border bg-muted animate-pulse" />
          <div className="h-72 rounded-xl border border-border bg-muted animate-pulse" />
          <div className="h-72 rounded-xl border border-border bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    /* No page-level header. The (app) layout already wraps every route in
       AppShell, which draws the sidebar, the top bar, the user menu and logout —
       the header that used to sit here was a leftover from before that shell
       existed and rendered a second set of all of it inside the first. */
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Visualize team skills, productivity, and collaboration patterns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Developer Count */}
      <div className="bg-muted rounded-xl p-4 border border-border">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Users className="h-5 w-5" />
          <span>
            Analyzing <span className="text-foreground font-semibold">{developers.length}</span> developers
          </span>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Skill Heatmap */}
        <div className="lg:col-span-2 bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Team Skill Distribution
            </h2>
          </div>
          <SkillHeatmap data={skillHeatmap} isLoading={loadingStates.heatmap} />
        </div>

        {/* Productivity Trends */}
        <div className="bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Productivity Trends
            </h2>
          </div>
          <ProductivityChart
            data={productivity}
            isLoading={loadingStates.productivity}
          />
        </div>

        {/* Workload Distribution */}
        <div className="bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Users className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Workload Distribution
            </h2>
          </div>
          <WorkloadPieChart
            data={workload}
            isLoading={loadingStates.workload}
          />
        </div>

        {/* Collaboration Network */}
        <div className="lg:col-span-2 bg-muted rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Network className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Collaboration Network
            </h2>
          </div>
          <CollaborationGraphComponent
            data={collaboration}
            isLoading={loadingStates.collaboration}
          />
        </div>
      </div>
    </div>
  );
}
