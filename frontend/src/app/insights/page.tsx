"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  GitBranch,
  BarChart3,
  Users,
  AlertTriangle,
  TrendingUp,
  Brain,
  RefreshCw,
  LogOut,
  GraduationCap,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  predictionsApi,
  developerApi,
  TeamHealthAnalysis,
  AttritionRiskAnalysis,
  BurnoutRiskAssessment,
  PerformanceTrajectory,
  Developer,
} from "@/lib/api";
import { TeamHealthGauge } from "@/components/charts";

interface DeveloperInsight {
  developer: Developer;
  attrition?: AttritionRiskAnalysis;
  burnout?: BurnoutRiskAssessment;
  trajectory?: PerformanceTrajectory;
  loading: boolean;
  expanded: boolean;
}

export default function InsightsPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [teamHealth, setTeamHealth] = useState<TeamHealthAnalysis | null>(null);
  const [developerInsights, setDeveloperInsights] = useState<DeveloperInsight[]>([]);
  const [loadingTeamHealth, setLoadingTeamHealth] = useState(false);
  const [loadingDevelopers, setLoadingDevelopers] = useState(true);

  const fetchDevelopers = useCallback(async (): Promise<Developer[]> => {
    try {
      const data: Developer[] = await developerApi.list();
      setDevelopers(data);
      setDeveloperInsights(
        data.map((dev) => ({
          developer: dev,
          loading: false,
          expanded: false,
        }))
      );
      return data;
    } catch (error) {
      console.error("Failed to fetch developers:", error);
      return [];
    } finally {
      setLoadingDevelopers(false);
    }
  }, []);

  const fetchTeamHealth = useCallback(async (developerIds: string[]) => {
    if (developerIds.length === 0) return;
    setLoadingTeamHealth(true);
    try {
      const data = await predictionsApi.getTeamHealth(developerIds);
      setTeamHealth(data);
    } catch (error) {
      console.error("Failed to fetch team health:", error);
    } finally {
      setLoadingTeamHealth(false);
    }
  }, []);

  const fetchDeveloperInsight = async (developerId: string, index: number) => {
    setDeveloperInsights((prev) =>
      prev.map((insight, i) =>
        i === index ? { ...insight, loading: true } : insight
      )
    );

    try {
      const [attrition, burnout, trajectory] = await Promise.all([
        predictionsApi.getAttritionRisk(developerId).catch(() => undefined),
        predictionsApi.getBurnoutRisk(developerId).catch(() => undefined),
        predictionsApi.getPerformanceTrajectory(developerId).catch(() => undefined),
      ]);

      setDeveloperInsights((prev) =>
        prev.map((insight, i) =>
          i === index
            ? { ...insight, attrition, burnout, trajectory, loading: false }
            : insight
        )
      );
    } catch (error) {
      console.error("Failed to fetch developer insight:", error);
      setDeveloperInsights((prev) =>
        prev.map((insight, i) =>
          i === index ? { ...insight, loading: false } : insight
        )
      );
    }
  };

  const toggleExpanded = (index: number) => {
    const insight = developerInsights[index];
    if (!insight.expanded && !insight.attrition && !insight.loading) {
      fetchDeveloperInsight(insight.developer.id, index);
    }
    setDeveloperInsights((prev) =>
      prev.map((insight, i) =>
        i === index ? { ...insight, expanded: !insight.expanded } : insight
      )
    );
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDevelopers().then((devs) => {
        if (devs.length > 0) {
          fetchTeamHealth(devs.map((d) => d.id));
        }
      });
    }
  }, [isAuthenticated, fetchDevelopers, fetchTeamHealth]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return "text-red-400 bg-red-400/10";
      case "high":
        return "text-orange-400 bg-orange-400/10";
      case "moderate":
        return "text-yellow-400 bg-yellow-400/10";
      default:
        return "text-green-400 bg-green-400/10";
    }
  };

  const getTrajectoryColor = (trajectory: string) => {
    switch (trajectory) {
      case "accelerating":
        return "text-green-400";
      case "steady":
        return "text-blue-400";
      case "plateauing":
        return "text-yellow-400";
      case "declining":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  if (isLoading || loadingDevelopers) {
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
              <span className="text-2xl font-bold text-white">Devograph</span>
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
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
              <Link
                href="/insights"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary-400" />
              Predictive Insights
            </h1>
            <p className="text-slate-400 mt-1">
              AI-powered analysis of team health, attrition risk, and performance trajectories
            </p>
          </div>
          <button
            onClick={() => fetchTeamHealth(developers.map((d) => d.id))}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            <RefreshCw className={`h-4 w-4 ${loadingTeamHealth ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Team Health Section */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Health Gauge */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Team Health</h2>
            <TeamHealthGauge data={teamHealth} isLoading={loadingTeamHealth} />
          </div>

          {/* Strengths & Risks */}
          <div className="lg:col-span-2 grid md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                Team Strengths
              </h3>
              {teamHealth?.strengths.length ? (
                <ul className="space-y-2">
                  {teamHealth.strengths.map((strength, i) => (
                    <li
                      key={i}
                      className="text-sm text-slate-300 flex items-start gap-2"
                    >
                      <span className="text-green-400 mt-1">✓</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400 text-sm">Loading...</p>
              )}
            </div>

            {/* Risks */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
                Team Risks
              </h3>
              {teamHealth?.risks.length ? (
                <ul className="space-y-3">
                  {teamHealth.risks.map((risk, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${getRiskColor(
                            risk.severity
                          )}`}
                        >
                          {risk.severity}
                        </span>
                        <span className="text-white">{risk.risk}</span>
                      </div>
                      <p className="text-slate-400 text-xs ml-4">
                        {risk.mitigation}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400 text-sm">No risks identified</p>
              )}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {teamHealth?.recommendations && teamHealth.recommendations.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">
              Recommendations
            </h3>
            <ul className="grid md:grid-cols-2 gap-4">
              {teamHealth.recommendations.map((rec, i) => (
                <li
                  key={i}
                  className="text-sm text-slate-300 flex items-start gap-2"
                >
                  <span className="text-primary-400 mt-1">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Individual Developer Insights */}
        <h2 className="text-xl font-bold text-white mb-4">
          Individual Developer Insights
        </h2>
        <div className="space-y-4">
          {developerInsights.map((insight, index) => (
            <div
              key={insight.developer.id}
              className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
            >
              {/* Header - always visible */}
              <button
                onClick={() => toggleExpanded(index)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-700/50 transition"
              >
                <div className="flex items-center gap-4">
                  {insight.developer.avatar_url && (
                    <Image
                      src={insight.developer.avatar_url}
                      alt={insight.developer.name || "Developer"}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  )}
                  <div>
                    <h3 className="text-white font-medium">
                      {insight.developer.name || insight.developer.email}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {insight.developer.github_connection?.github_username &&
                        `@${insight.developer.github_connection.github_username}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {insight.attrition && (
                    <span
                      className={`px-2 py-1 rounded text-xs ${getRiskColor(
                        insight.attrition.risk_level
                      )}`}
                    >
                      Attrition: {insight.attrition.risk_level}
                    </span>
                  )}
                  {insight.trajectory && (
                    <span
                      className={`text-sm ${getTrajectoryColor(
                        insight.trajectory.trajectory
                      )}`}
                    >
                      {insight.trajectory.trajectory}
                    </span>
                  )}
                  {insight.loading ? (
                    <RefreshCw className="h-5 w-5 text-slate-400 animate-spin" />
                  ) : insight.expanded ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {insight.expanded && (
                <div className="border-t border-slate-700 p-4 grid md:grid-cols-3 gap-6">
                  {/* Attrition Risk */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-3">
                      Attrition Risk
                    </h4>
                    {insight.attrition ? (
                      <div className="space-y-2">
                        <div
                          className={`inline-flex px-3 py-1 rounded-full text-sm ${getRiskColor(
                            insight.attrition.risk_level
                          )}`}
                        >
                          {insight.attrition.risk_level.toUpperCase()} (
                          {(insight.attrition.risk_score * 100).toFixed(0)}%)
                        </div>
                        {insight.attrition.factors.slice(0, 3).map((f, i) => (
                          <p key={i} className="text-xs text-slate-300">
                            • {f.factor}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">Click to analyze</p>
                    )}
                  </div>

                  {/* Burnout Risk */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-3">
                      Burnout Risk
                    </h4>
                    {insight.burnout ? (
                      <div className="space-y-2">
                        <div
                          className={`inline-flex px-3 py-1 rounded-full text-sm ${getRiskColor(
                            insight.burnout.risk_level
                          )}`}
                        >
                          {insight.burnout.risk_level.toUpperCase()} (
                          {(insight.burnout.risk_score * 100).toFixed(0)}%)
                        </div>
                        {insight.burnout.indicators.slice(0, 3).map((ind, i) => (
                          <p key={i} className="text-xs text-slate-300">
                            • {ind}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">Click to analyze</p>
                    )}
                  </div>

                  {/* Performance Trajectory */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-3">
                      Performance Trajectory
                    </h4>
                    {insight.trajectory ? (
                      <div className="space-y-2">
                        <div
                          className={`text-lg font-semibold ${getTrajectoryColor(
                            insight.trajectory.trajectory
                          )}`}
                        >
                          {insight.trajectory.trajectory.charAt(0).toUpperCase() +
                            insight.trajectory.trajectory.slice(1)}
                        </div>
                        <p className="text-xs text-slate-400">
                          Career readiness:{" "}
                          {(insight.trajectory.career_readiness.readiness_score * 100).toFixed(0)}%
                        </p>
                        {insight.trajectory.opportunities.slice(0, 2).map((opp, i) => (
                          <p key={i} className="text-xs text-slate-300">
                            • {opp}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">Click to analyze</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
