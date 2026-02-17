"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  MessageSquare,
  AlertTriangle,
  Search,
  Users,
  TrendingUp,
  UserCheck,
  Calendar,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { insightsApi, InsightsPeriodType } from "@/lib/api";

type AITab =
  | "narrative"
  | "retro"
  | "trajectory"
  | "root-cause"
  | "composition"
  | "hiring";

const TABS: { id: AITab; label: string; icon: React.ElementType; description: string }[] = [
  { id: "narrative", label: "Team Narrative", icon: MessageSquare, description: "AI-generated summary of team metrics" },
  { id: "retro", label: "Sprint Retro", icon: Calendar, description: "AI-powered retrospective insights" },
  { id: "trajectory", label: "Trajectory", icon: TrendingUp, description: "Team performance trajectory forecast" },
  { id: "root-cause", label: "Root Cause", icon: Search, description: "Analyze why metrics changed" },
  { id: "composition", label: "Team Composition", icon: Users, description: "Recommendations for team structure" },
  { id: "hiring", label: "Hiring Forecast", icon: UserCheck, description: "When to hire next" },
];

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

function AIContentCard({
  content,
  isLoading,
  generated,
  onRefresh,
}: {
  content: string;
  isLoading: boolean;
  generated?: boolean;
  onRefresh?: () => void;
}) {
  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Generating AI insights...</p>
        <p className="text-gray-500 text-xs mt-1">This may take a few seconds</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-xs text-indigo-400 font-medium">
            {generated ? "AI Generated" : "Unavailable"}
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
            title="Regenerate"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="prose prose-invert prose-sm max-w-none">
        {content.split("\n").map((line, i) => {
          if (line.startsWith("**") && line.endsWith("**")) {
            return (
              <h4 key={i} className="text-white font-semibold mt-4 mb-2">
                {line.replace(/\*\*/g, "")}
              </h4>
            );
          }
          if (/^\d+\./.test(line.trim())) {
            return (
              <p key={i} className="text-gray-300 ml-4 mb-1">
                {line}
              </p>
            );
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <p key={i} className="text-gray-300 ml-4 mb-1">
                {line}
              </p>
            );
          }
          if (line.trim() === "") {
            return <br key={i} />;
          }
          return (
            <p key={i} className="text-gray-300 mb-2 whitespace-pre-wrap">
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function AIInsightsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [activeTab, setActiveTab] = useState<AITab>("narrative");
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");

  // Team Narrative
  const {
    data: narrative,
    isLoading: narrativeLoading,
    refetch: refetchNarrative,
  } = useQuery({
    queryKey: ["aiTeamNarrative", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getTeamNarrative(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "narrative",
  });

  // Sprint Retro
  const {
    data: retro,
    isLoading: retroLoading,
    refetch: refetchRetro,
  } = useQuery({
    queryKey: ["aiSprintRetro", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getSprintRetro(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "retro",
  });

  // Trajectory
  const {
    data: trajectory,
    isLoading: trajectoryLoading,
    refetch: refetchTrajectory,
  } = useQuery({
    queryKey: ["aiTeamTrajectory", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getTeamTrajectory(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "trajectory",
  });

  // Root Cause
  const {
    data: rootCause,
    isLoading: rootCauseLoading,
    refetch: refetchRootCause,
  } = useQuery({
    queryKey: ["aiRootCause", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getRootCauseAnalysis(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "root-cause",
  });

  // Composition
  const {
    data: composition,
    isLoading: compositionLoading,
    refetch: refetchComposition,
  } = useQuery({
    queryKey: ["aiComposition", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getCompositionRecommendations(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "composition",
  });

  // Hiring
  const {
    data: hiring,
    isLoading: hiringLoading,
    refetch: refetchHiring,
  } = useQuery({
    queryKey: ["aiHiring", currentWorkspaceId, periodType],
    queryFn: () => insightsApi.getHiringForecast(currentWorkspaceId!, { period_type: periodType }),
    enabled: !!currentWorkspaceId && activeTab === "hiring",
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const getActiveContent = () => {
    switch (activeTab) {
      case "narrative":
        return {
          content: narrative?.narrative || "Click to generate team narrative.",
          isLoading: narrativeLoading,
          generated: narrative?.generated,
          onRefresh: () => refetchNarrative(),
        };
      case "retro":
        return {
          content: retro?.retro || "Click to generate sprint retro.",
          isLoading: retroLoading,
          generated: retro?.generated,
          onRefresh: () => refetchRetro(),
        };
      case "trajectory":
        return {
          content: trajectory?.trajectory || "Click to generate trajectory forecast.",
          isLoading: trajectoryLoading,
          generated: trajectory?.generated,
          onRefresh: () => refetchTrajectory(),
        };
      case "root-cause":
        return {
          content: rootCause?.analysis || "Click to generate root cause analysis.",
          isLoading: rootCauseLoading,
          generated: rootCause?.generated,
          onRefresh: () => refetchRootCause(),
        };
      case "composition":
        return {
          content: composition?.recommendations || "Click to generate recommendations.",
          isLoading: compositionLoading,
          generated: composition?.generated,
          onRefresh: () => refetchComposition(),
        };
      case "hiring":
        return {
          content: hiring?.forecast || "Click to generate hiring forecast.",
          isLoading: hiringLoading,
          generated: hiring?.generated,
          onRefresh: () => refetchHiring(),
        };
      default:
        return {
          content: "",
          isLoading: false,
          generated: false,
        };
    }
  };

  const active = getActiveContent();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/insights"
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <ArrowLeft className="h-5 w-5 text-gray-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-indigo-400" />
              <h1 className="text-2xl font-bold text-white">AI Insights</h1>
            </div>
            <p className="text-gray-400 text-sm mt-1">
              LLM-powered intelligence for your engineering team
            </p>
          </div>
        </div>

        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as InsightsPeriodType)}
          className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tab Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition ${
                isActive
                  ? "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-gray-200"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-indigo-400" : ""}`} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Description */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Sparkles className="h-4 w-4" />
        {TABS.find((t) => t.id === activeTab)?.description}
      </div>

      {/* Content */}
      <AIContentCard
        content={active.content}
        isLoading={active.isLoading}
        generated={active.generated}
        onRefresh={active.onRefresh}
      />

      {/* Stats Footer */}
      {activeTab === "retro" && retro?.metrics_summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(retro.metrics_summary).map(([key, value]) => (
            <div key={key} className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{String(value)}</p>
              <p className="text-xs text-gray-400 mt-1">{key.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "trajectory" && trajectory?.trends && (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(trajectory.trends).map(([key, value]) => (
            <div key={key} className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{String(value)}%</p>
              <p className="text-xs text-gray-400 mt-1">{key.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "hiring" && hiring?.indicators && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(hiring.indicators).map(([key, value]) => (
            <div key={key} className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{String(value)}</p>
              <p className="text-xs text-gray-400 mt-1">{key.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
