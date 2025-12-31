"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import { Code, TrendingUp, Clock } from "lucide-react";
import Image from "next/image";
import { analysisApi, DeveloperInsights, SoftSkillsProfile } from "@/lib/api";
import { AppHeader } from "@/components/layout/AppHeader";
import { SoftSkillsCard } from "@/components/SoftSkillsCard";
import { InsightsCard } from "@/components/InsightsCard";
import { GrowthTrajectoryCard } from "@/components/GrowthTrajectoryCard";
import { TaskMatcherCard } from "@/components/TaskMatcherCard";
import { PeerBenchmarkCard } from "@/components/PeerBenchmarkCard";
import { SimpleTooltip as Tooltip } from "@/components/ui/tooltip";

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
      <AppHeader user={user} logout={logout} />

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
                      <Tooltip content={`Score: ${lang.proficiency_score}/100 based on commits & lines of code`}>
                        <span className="text-slate-400 cursor-help">
                          {lang.proficiency_score}
                        </span>
                      </Tooltip>
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
                    <Tooltip
                      key={domain.name}
                      content={`Score: ${domain.confidence_score}/100 based on file types & commits`}
                    >
                      <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm cursor-help">
                        {domain.name.replace("_", " ")}{" "}
                        <span className="text-slate-500">
                          {domain.confidence_score}
                        </span>
                      </span>
                    </Tooltip>
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
                    <Tooltip
                      key={fw.name}
                      content={`Score: ${fw.proficiency_score}/100 | ${fw.category} | ${fw.usage_count} uses`}
                    >
                      <span className="bg-primary-900/50 text-primary-300 px-3 py-1 rounded-full text-sm cursor-help">
                        {fw.name}{" "}
                        <span className="text-primary-400/60">
                          {fw.proficiency_score}
                        </span>
                      </span>
                    </Tooltip>
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
