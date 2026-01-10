"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Code,
  TrendingUp,
  Clock,
  Sparkles,
  Target,
  GitPullRequest,
  Activity,
  ChevronRight,
  Zap,
  Users,
  Calendar,
  BarChart3,
  ClipboardCheck,
} from "lucide-react";
import Image from "next/image";
import { analysisApi, DeveloperInsights, SoftSkillsProfile } from "@/lib/api";
import { AppHeader } from "@/components/layout/AppHeader";
import { SoftSkillsCard } from "@/components/SoftSkillsCard";
import { InsightsCard } from "@/components/InsightsCard";
import { GrowthTrajectoryCard } from "@/components/GrowthTrajectoryCard";
import { TaskMatcherCard } from "@/components/TaskMatcherCard";
import { PeerBenchmarkCard } from "@/components/PeerBenchmarkCard";
import { SimpleTooltip as Tooltip } from "@/components/ui/tooltip";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useDashboardStore } from "@/stores/dashboardStore";
import {
  DashboardCustomizeModal,
  CustomizeButton,
  TicketStatsWidget,
  SprintOverviewWidget,
  TrackingSummaryWidget,
  CRMPipelineWidget,
} from "@/components/dashboard";

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [insights, setInsights] = useState<DeveloperInsights | null>(null);
  const [softSkills, setSoftSkills] = useState<SoftSkillsProfile | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [softSkillsLoading, setSoftSkillsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dashboard customization
  const { preferences, isLoading: prefsLoading } = useDashboardPreferences();
  const { isModalOpen, setModalOpen } = useDashboardStore();
  const visibleWidgets = preferences?.visible_widgets || [
    "welcome", "quickStats", "languageProficiency", "workPatterns",
    "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
    "growthTrajectory", "peerBenchmark", "taskMatcher", "myGoals", "performanceReviews"
  ];

  // Helper to check if a widget should be shown
  const showWidget = (widgetId: string) => visibleWidgets.includes(widgetId);

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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading your profile...</p>
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

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {user?.avatar_url && (
                <div className="relative">
                  <Image
                    src={user.avatar_url}
                    alt={user.name || "User"}
                    width={56}
                    height={56}
                    className="rounded-full ring-2 ring-slate-700"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-950"></div>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Welcome back, {user?.name?.split(" ")[0] || "Developer"}
                </h1>
                <p className="text-slate-400 text-sm">
                  {user?.github_connection ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Connected as @{user.github_connection.github_username}
                    </span>
                  ) : (
                    "Connect your GitHub to get started"
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CustomizeButton onClick={() => setModalOpen(true)} />
              <Link
                href="/reviews"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <ClipboardCheck className="w-4 h-4" />
                Reviews
              </Link>
              <Link
                href="/learning"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Learning Path
              </Link>
              <Link
                href="/sprints"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Sprint Planning
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        {showWidget("quickStats") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Code className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-slate-400 text-sm">Languages</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalLanguages}</p>
            <p className="text-xs text-slate-500 mt-1">Top: {topLanguage}</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-slate-400 text-sm">Frameworks</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalFrameworks}</p>
            <p className="text-xs text-slate-500 mt-1">Active technologies</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <GitPullRequest className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-slate-400 text-sm">Avg PR Size</span>
            </div>
            <p className="text-2xl font-bold text-white">{avgPRSize.toFixed(0)}</p>
            <p className="text-xs text-slate-500 mt-1">lines per PR</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Activity className="w-5 h-5 text-orange-400" />
              </div>
              <span className="text-slate-400 text-sm">Work Style</span>
            </div>
            <p className="text-lg font-bold text-white capitalize">
              {workPatterns?.collaboration_style || "N/A"}
            </p>
            <p className="text-xs text-slate-500 mt-1">Collaboration type</p>
          </div>
        </div>
        )}

        {/* Main Content Grid */}
        {(showWidget("languageProficiency") || showWidget("workPatterns")) && (
        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          {/* Languages Card */}
          {showWidget("languageProficiency") && (
          <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-500/10 rounded-lg">
                  <Code className="h-5 w-5 text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Language Proficiency</h3>
              </div>
              <Link href="/profile" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1 transition">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              {skillFingerprint?.languages?.length ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {skillFingerprint.languages.slice(0, 6).map((lang, index) => (
                    <div key={lang.name} className="group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-xs font-mono">#{index + 1}</span>
                          <span className="text-white font-medium">{lang.name}</span>
                        </div>
                        <Tooltip content={`Score: ${lang.proficiency_score}/100 based on commits & lines of code`}>
                          <span className="text-slate-400 text-sm cursor-help tabular-nums">
                            {lang.proficiency_score}%
                          </span>
                        </Tooltip>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500 group-hover:from-primary-500 group-hover:to-primary-300"
                          style={{ width: `${lang.proficiency_score}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500 mt-1.5">
                        <span>{lang.commits_count.toLocaleString()} commits</span>
                        <span className={`flex items-center gap-1 ${getTrendColor(lang.trend)}`}>
                          {lang.trend === "growing" && <TrendingUp className="w-3 h-3" />}
                          {lang.trend}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Code className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">
                    No language data yet. Connect your GitHub to analyze your contributions.
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Work Patterns Card */}
          {showWidget("workPatterns") && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Work Patterns</h3>
              </div>
            </div>
            <div className="p-6">
              {workPatterns ? (
                <div className="space-y-5">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-sm">Complexity Preference</span>
                    </div>
                    <p className="text-white font-medium capitalize">
                      {workPatterns.preferred_complexity || "Balanced"}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-sm">Peak Hours</span>
                    </div>
                    <p className="text-white font-medium">
                      {workPatterns.peak_productivity_hours?.length > 0
                        ? workPatterns.peak_productivity_hours.slice(0, 3).map(h => `${h}:00`).join(", ")
                        : "Not analyzed"}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-sm">Review Turnaround</span>
                    </div>
                    <p className="text-white font-medium">
                      {workPatterns.average_review_turnaround_hours
                        ? `${workPatterns.average_review_turnaround_hours.toFixed(1)} hours`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-sm">PR Efficiency</span>
                    </div>
                    <p className="text-white font-medium">
                      {workPatterns.average_pr_size > 200 ? "Large PRs" :
                       workPatterns.average_pr_size > 50 ? "Medium PRs" : "Small PRs"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">
                    Work patterns will appear after more activity is analyzed.
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
        )}

        {/* Skills Section */}
        {(showWidget("domainExpertise") || showWidget("frameworksTools")) && (
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          {/* Domain Expertise */}
          {showWidget("domainExpertise") && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Domain Expertise</h3>
              </div>
            </div>
            <div className="p-6">
              {skillFingerprint?.domains?.length ? (
                <div className="flex flex-wrap gap-2">
                  {skillFingerprint.domains.map((domain) => (
                    <Tooltip
                      key={domain.name}
                      content={`Confidence: ${domain.confidence_score}% based on file types & commits`}
                    >
                      <span className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm cursor-help transition">
                        {domain.name.replace("_", " ")}
                        <span className="text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">
                          {domain.confidence_score}%
                        </span>
                      </span>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm">No domains detected yet.</p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Frameworks */}
          {showWidget("frameworksTools") && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Clock className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Frameworks & Tools</h3>
              </div>
            </div>
            <div className="p-6">
              {skillFingerprint?.frameworks?.length ? (
                <div className="flex flex-wrap gap-2">
                  {skillFingerprint.frameworks.map((fw) => (
                    <Tooltip
                      key={fw.name}
                      content={`${fw.proficiency_score}% proficiency | ${fw.category} | ${fw.usage_count} uses`}
                    >
                      <span className="inline-flex items-center gap-2 bg-primary-900/30 hover:bg-primary-900/50 text-primary-300 px-4 py-2 rounded-lg text-sm cursor-help transition">
                        {fw.name}
                        <span className="text-xs text-primary-400/60 bg-primary-900/50 px-2 py-0.5 rounded-full">
                          {fw.proficiency_score}%
                        </span>
                      </span>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm">No frameworks detected yet.</p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
        )}

        {/* AI Insights Section */}
        {(showWidget("aiInsights") || showWidget("softSkills") || showWidget("growthTrajectory") || showWidget("peerBenchmark")) && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary-400" />
            </div>
            <h2 className="text-xl font-bold text-white">AI-Powered Insights</h2>
          </div>
          {(showWidget("aiInsights") || showWidget("softSkills")) && (
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {showWidget("aiInsights") && (
            <InsightsCard
              insights={insights}
              isLoading={insightsLoading}
              onRefresh={handleRefreshInsights}
              isRefreshing={isRefreshing}
            />
            )}
            {showWidget("softSkills") && (
            <SoftSkillsCard
              softSkills={softSkills}
              isLoading={softSkillsLoading}
            />
            )}
          </div>
          )}
          {(showWidget("growthTrajectory") || showWidget("peerBenchmark")) && (
          <div className="grid lg:grid-cols-2 gap-6">
            {showWidget("growthTrajectory") && (
            <GrowthTrajectoryCard growth={user?.growth_trajectory || null} />
            )}
            {showWidget("peerBenchmark") && user?.id && <PeerBenchmarkCard developerId={user.id} />}
          </div>
          )}
        </div>
        )}

        {/* Task Matching Section */}
        {showWidget("taskMatcher") && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
              <Target className="h-5 w-5 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Task Matching</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <TaskMatcherCard />
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-lg">
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">How Task Matching Works</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center text-primary-400 font-semibold text-sm">
                    1
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1">Signal Extraction</h4>
                    <p className="text-slate-400 text-sm">
                      AI identifies programming languages, frameworks, and expertise required.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center text-primary-400 font-semibold text-sm">
                    2
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1">Skill Matching</h4>
                    <p className="text-slate-400 text-sm">
                      Compares task requirements against developer profiles.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center text-primary-400 font-semibold text-sm">
                    3
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-1">Growth Opportunity</h4>
                    <p className="text-slate-400 text-sm">
                      Considers tasks that help developers grow while ensuring capability.
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-slate-400 text-sm">
                    Connect your <span className="text-white">Jira</span>, <span className="text-white">Linear</span>, or <span className="text-white">GitHub Issues</span> for automatic task imports.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Tracking & Sprint Section (for Manager/Product personas) */}
        {(showWidget("trackingSummary") || showWidget("sprintOverview")) && (
        <div className="grid lg:grid-cols-2 gap-6 mt-10">
          {showWidget("trackingSummary") && <TrackingSummaryWidget />}
          {showWidget("sprintOverview") && <SprintOverviewWidget />}
        </div>
        )}

        {/* Tickets & CRM Section (for Support/Sales personas) */}
        {(showWidget("ticketStats") || showWidget("crmPipeline")) && (
        <div className="grid lg:grid-cols-2 gap-6 mt-10">
          {showWidget("ticketStats") && <TicketStatsWidget />}
          {showWidget("crmPipeline") && <CRMPipelineWidget />}
        </div>
        )}

        {/* Reviews & Goals Section */}
        {(showWidget("myGoals") || showWidget("performanceReviews")) && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Reviews & Goals</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Goals Overview Card */}
            {showWidget("myGoals") && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Target className="h-5 w-5 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">My Goals</h3>
                </div>
                <Link href="/reviews/goals" className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="p-6">
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Target className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm mb-4">
                    Set SMART goals to track your progress and contributions.
                  </p>
                  <Link
                    href="/reviews/goals/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition"
                  >
                    Create Your First Goal
                  </Link>
                </div>
              </div>
            </div>
            )}

            {/* Reviews Overview Card */}
            {showWidget("performanceReviews") && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500/10 rounded-lg">
                    <ClipboardCheck className="h-5 w-5 text-teal-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Performance Reviews</h3>
                </div>
                <Link href="/reviews" className="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-white font-medium text-sm">360° Feedback</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Request anonymous feedback from peers and managers with the COIN framework.
                  </p>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-white font-medium text-sm">Auto-Contributions</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    GitHub activity automatically linked to your review summaries.
                  </p>
                </div>
                <Link
                  href="/reviews"
                  className="block w-full text-center px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-600/30 rounded-lg text-sm font-medium transition"
                >
                  Go to Reviews
                </Link>
              </div>
            </div>
            )}
          </div>
        </div>
        )}
      </main>

      {/* Dashboard Customize Modal */}
      <DashboardCustomizeModal
        open={isModalOpen}
        onOpenChange={setModalOpen}
      />
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
