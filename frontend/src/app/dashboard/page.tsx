"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import { GitBranch, Code, TrendingUp, Clock, LogOut, Calendar, GraduationCap, Users } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { analysisApi, DeveloperInsights, SoftSkillsProfile } from "@/lib/api";
import { SoftSkillsCard } from "@/components/SoftSkillsCard";
import { InsightsCard } from "@/components/InsightsCard";
import { GrowthTrajectoryCard } from "@/components/GrowthTrajectoryCard";
import { TaskMatcherCard } from "@/components/TaskMatcherCard";
import { PeerBenchmarkCard } from "@/components/PeerBenchmarkCard";

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [insights, setInsights] = useState<DeveloperInsights | null>(null);
  const [softSkills, setSoftSkills] = useState<SoftSkillsProfile | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [softSkillsLoading, setSoftSkillsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!user?.id) return;
    setInsightsLoading(true);
    try {
      const data = await analysisApi.getDeveloperInsights(user.id);
      setInsights(data);
      if (data.soft_skills) {
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const skillFingerprint = user?.skill_fingerprint;
  const workPatterns = user?.work_patterns;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Gitraki</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/sprint-planning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Sprint Planning
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
        <h1 className="text-3xl font-bold text-white mb-8">
          Developer Profile
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-4 mb-6">
              {user?.avatar_url && (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={64}
                  height={64}
                  className="rounded-full"
                />
              )}
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {user?.name}
                </h2>
                <p className="text-slate-400">{user?.email}</p>
                {user?.github_connection && (
                  <p className="text-primary-400 text-sm">
                    @{user.github_connection.github_username}
                  </p>
                )}
              </div>
            </div>

            {workPatterns && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Complexity Preference</span>
                  <span className="text-white capitalize">
                    {workPatterns.preferred_complexity}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Collaboration Style</span>
                  <span className="text-white capitalize">
                    {workPatterns.collaboration_style}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Avg PR Size</span>
                  <span className="text-white">
                    {workPatterns.average_pr_size} lines
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Languages */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-4">
              <Code className="h-5 w-5 text-primary-400" />
              <h3 className="text-lg font-semibold text-white">Languages</h3>
            </div>
            {skillFingerprint?.languages?.length ? (
              <div className="space-y-4">
                {skillFingerprint.languages.slice(0, 5).map((lang) => (
                  <div key={lang.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white">{lang.name}</span>
                      <span className="text-slate-400">
                        {lang.proficiency_score}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${lang.proficiency_score}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{lang.commits_count} commits</span>
                      <span className={getTrendColor(lang.trend)}>
                        {lang.trend}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">
                No language data yet. Connect your GitHub to analyze your
                contributions.
              </p>
            )}
          </div>

          {/* Domains & Frameworks */}
          <div className="space-y-8">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary-400" />
                <h3 className="text-lg font-semibold text-white">
                  Domain Expertise
                </h3>
              </div>
              {skillFingerprint?.domains?.length ? (
                <div className="flex flex-wrap gap-2">
                  {skillFingerprint.domains.map((domain) => (
                    <span
                      key={domain.name}
                      className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm"
                    >
                      {domain.name.replace("_", " ")}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No domains detected.</p>
              )}
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-primary-400" />
                <h3 className="text-lg font-semibold text-white">Frameworks</h3>
              </div>
              {skillFingerprint?.frameworks?.length ? (
                <div className="flex flex-wrap gap-2">
                  {skillFingerprint.frameworks.map((fw) => (
                    <span
                      key={fw.name}
                      className="bg-primary-900/50 text-primary-300 px-3 py-1 rounded-full text-sm"
                    >
                      {fw.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">
                  No frameworks detected.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
        <h2 className="text-2xl font-bold text-white mt-12 mb-6">
          AI-Powered Insights
        </h2>
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <InsightsCard
            insights={insights}
            isLoading={insightsLoading}
            onRefresh={handleRefreshInsights}
            isRefreshing={isRefreshing}
          />
          <SoftSkillsCard
            softSkills={softSkills}
            isLoading={softSkillsLoading}
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-8">
          <GrowthTrajectoryCard growth={user?.growth_trajectory || null} />
          {user?.id && <PeerBenchmarkCard developerId={user.id} />}
        </div>

        {/* Task Matching Section */}
        <h2 className="text-2xl font-bold text-white mt-12 mb-6">
          Task Matching
        </h2>
        <div className="grid lg:grid-cols-2 gap-8">
          <TaskMatcherCard />
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              How Task Matching Works
            </h3>
            <div className="space-y-4 text-sm text-slate-300">
              <p>
                Our AI analyzes task descriptions to extract required skills,
                complexity, and domain expertise needed.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-1">1.</span>
                  <span>
                    <strong className="text-white">Signal Extraction</strong> -
                    AI identifies programming languages, frameworks, and
                    expertise required.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-1">2.</span>
                  <span>
                    <strong className="text-white">Skill Matching</strong> -
                    Compares task requirements against developer profiles.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-1">3.</span>
                  <span>
                    <strong className="text-white">Growth Opportunity</strong> -
                    Considers tasks that help developers grow while ensuring
                    capability.
                  </span>
                </li>
              </ul>
              <p className="text-slate-400">
                Connect your Jira, Linear, or GitHub Issues for automatic task
                imports.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case "growing":
      return "text-green-400";
    case "declining":
      return "text-red-400";
    default:
      return "text-slate-500";
  }
}
