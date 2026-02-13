"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  GitBranch,
  BarChart3,
  Users,
  TrendingUp,
  Network,
  Download,
  RefreshCw,
  LogOut,
  Calendar,
  GraduationCap,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
  const { user, isLoading, isAuthenticated, logout } = useAuth();
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
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Aexy</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/analytics"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
              <Link
                href="/insights"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Lightbulb className="h-4 w-4" />
                Insights
              </Link>
              <Link
                href="/learning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/hiring"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Hiring
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.avatar_url && (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-white">{user?.name || user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Team Analytics</h1>
            <p className="text-slate-400 mt-1">
              Visualize team skills, productivity, and collaboration patterns
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
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
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-8">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <Users className="h-5 w-5" />
            <span>
              Analyzing <span className="text-white font-semibold">{developers.length}</span> developers
            </span>
          </div>
        </div>

        {/* Analytics Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Skill Heatmap */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">
                Team Skill Distribution
              </h2>
            </div>
            <SkillHeatmap data={skillHeatmap} isLoading={loadingStates.heatmap} />
          </div>

          {/* Productivity Trends */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">
                Productivity Trends
              </h2>
            </div>
            <ProductivityChart
              data={productivity}
              isLoading={loadingStates.productivity}
            />
          </div>

          {/* Workload Distribution */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-6">
              <Users className="h-5 w-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">
                Workload Distribution
              </h2>
            </div>
            <WorkloadPieChart
              data={workload}
              isLoading={loadingStates.workload}
            />
          </div>

          {/* Collaboration Network */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-6">
              <Network className="h-5 w-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">
                Collaboration Network
              </h2>
            </div>
            <CollaborationGraphComponent
              data={collaboration}
              isLoading={loadingStates.collaboration}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
