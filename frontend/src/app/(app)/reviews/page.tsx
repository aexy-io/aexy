"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ClipboardCheck,
  Target,
  Users,
  Calendar,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  TrendingUp,
  GitPullRequest,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useReviewStats,
  useReviewCycles,
  useContributionSummary,
} from "@/hooks/useReviews";
import { WorkGoal, ReviewCycle } from "@/lib/api";
import { GOAL_STATUS_COLORS, REVIEW_CYCLE_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";

// Goal Card Component
function GoalCard({ goal }: { goal: WorkGoal }) {
  const progressPercent = goal.progress_percentage || 0;
  const goalColor = getStatusColor(GOAL_STATUS_COLORS, goal.status);

  return (
    <Link
      href={`/reviews/goals/${goal.id}`}
      className="block bg-muted/50 rounded-lg p-4 hover:bg-muted transition border border-border/50"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-foreground font-medium line-clamp-1">{goal.title}</h4>
        <span
          className={`text-xs px-2 py-0.5 rounded-full capitalize ${goalColor.text} ${goalColor.bg}`}
        >
          {goal.status.replace("_", " ")}
        </span>
      </div>
      {goal.description && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
          {goal.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="capitalize">{goal.goal_type.replace("_", " ")}</span>
        <span>{progressPercent}% complete</span>
      </div>
      <div className="mt-2 h-1.5 bg-accent rounded-full overflow-hidden">
        <div
          className="h-full bg-cyan-500 rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </Link>
  );
}

// Cycle Card Component
function CycleCard({ cycle }: { cycle: ReviewCycle }) {
  const colors = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);

  return (
    <Link
      href={`/reviews/cycles/${cycle.id}`}
      className="block bg-purple-50 dark:bg-purple-900/20 border border-purple-800/50 rounded-lg p-4 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition"
    >
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-4 w-4 text-purple-400" />
        <span className={`${colors.text} text-sm font-medium capitalize`}>
          {cycle.status.replace("_", " ")}
        </span>
      </div>
      <h4 className="text-foreground font-medium mb-1">{cycle.name}</h4>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {new Date(cycle.period_start).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          -{" "}
          {new Date(cycle.period_end).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}

export default function ReviewsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const {
    currentWorkspaceId,
    currentWorkspace,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();

  // Fetch real data using hooks
  const developerId = user?.id;
  const { stats, goals, peerRequests, isLoading: statsLoading } = useReviewStats(
    developerId,
    currentWorkspaceId
  );
  const { cycles, isLoading: cyclesLoading } = useReviewCycles(
    currentWorkspaceId,
    "active"
  );
  const { summary: contributionSummary, isLoading: contributionsLoading, generate: generateSummary } =
    useContributionSummary(developerId);

  const [isGenerating, setIsGenerating] = useState(false);
  const t = useTranslations("reviews");
  const tc = useTranslations("common");

  const handleGenerateSummary = async () => {
    if (!developerId) return;
    setIsGenerating(true);
    try {
      await generateSummary("quarterly");
    } catch (err) {
      console.error("Failed to generate summary:", err);
      toast.error(t("dashboard.failedToGenerateSummary"));
    } finally {
      setIsGenerating(false);
    }
  };

  const activeCycle = cycles.find(
    (c) => c.status !== "completed" && c.status !== "draft"
  );
  const activeGoals = goals.filter(
    (g) => g.status === "active" || g.status === "in_progress"
  );

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-accent rounded" />
            <div className="h-4 w-72 bg-accent rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-accent rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="h-5 w-32 bg-accent rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-accent rounded-lg" />
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="h-5 w-28 bg-accent rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-accent rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 rounded-xl">
              <ClipboardCheck className="h-7 w-7 text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
              <p className="text-muted-foreground text-sm">
                {t("description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/reviews/goals/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              {t("newGoal")}
            </Link>
            {hasWorkspaces && (
              <>
                <Link
                  href="/reviews/manage"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-600/30 rounded-lg transition text-sm"
                >
                  <Users className="h-4 w-4" />
                  {t("managementView")}
                </Link>
                <Link
                  href="/reviews/cycles"
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm"
                >
                  <Settings className="h-4 w-4" />
                  {t("manageCycles")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-muted-foreground text-sm">{t("stats.activeGoals")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.activeGoals}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("stats.inProgress")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-muted-foreground text-sm">{t("stats.completed")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.completedGoals}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("stats.thisQuarter")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-muted-foreground text-sm">{t("stats.peerReviews")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.pendingPeerRequests}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("stats.pendingRequests")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <GitPullRequest className="w-5 h-5 text-orange-400" />
              </div>
              <span className="text-muted-foreground text-sm">{t("stats.contributions")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {contributionsLoading
                ? "-"
                : contributionSummary?.metrics?.pull_requests?.total || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("stats.autoLinkedPRs")}</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* My Goals */}
          <div data-testid="goals-section" className="lg:col-span-2 bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t("dashboard.myGoals")}</h3>
              </div>
              <Link
                href="/reviews/goals"
                className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
              >
                {tc("viewAll")} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              {statsLoading ? (
                <div className="flex justify-center py-12">
                  <div data-testid="loading-spinner" className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500/20 border-t-primary-500"></div>
                </div>
              ) : activeGoals.length > 0 ? (
                <div className="space-y-3">
                  {activeGoals.slice(0, 4).map((goal) => (
                    <GoalCard key={goal.id} goal={goal} />
                  ))}
                  {activeGoals.length > 4 && (
                    <Link
                      href="/reviews/goals"
                      className="block text-center text-sm text-cyan-400 hover:text-cyan-300 py-2"
                    >
                      +{activeGoals.length - 4} more goals
                    </Link>
                  )}
                </div>
              ) : (
                <div data-testid="example-goal" className="space-y-4">
                  {/* Example goal preview */}
                  <div className="opacity-60 border border-dashed border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-cyan-400" />
                        <span className="text-foreground text-sm font-medium">Improve API response times by 50%</span>
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">Performance</span>
                    </div>
                    <div className="w-full bg-accent rounded-full h-2 mb-2">
                      <div className="bg-cyan-500 h-2 rounded-full" style={{ width: "65%" }} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>2 key results</span>
                      <span>3 PRs linked</span>
                      <span className="text-cyan-400">65% complete</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm text-center">
                    This is what your goals will look like. Start tracking your progress now.
                  </p>
                  <div className="text-center">
                    <Link
                      href="/reviews/goals/new"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
                    >
                      <Plus className="h-4 w-4" />
                      Create Your First Goal
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Current Review Cycle */}
          <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t("dashboard.reviewCycle")}</h3>
              </div>
            </div>
            <div className="p-6">
              {cyclesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-4 border-primary-500/20 border-t-primary-500"></div>
                </div>
              ) : activeCycle ? (
                <CycleCard cycle={activeCycle} />
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    {t("dashboard.noActiveReviewCycle")}
                  </p>
                  {hasWorkspaces && (
                    <Link
                      href="/reviews/cycles"
                      className="text-purple-400 hover:text-purple-300 text-sm transition"
                    >
                      {t("dashboard.createReviewCycle")}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Peer Feedback Section */}
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          {/* Pending Peer Reviews */}
          <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t("dashboard.feedbackRequests")}</h3>
              </div>
              <Link
                href="/reviews/peer-requests"
                className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 transition"
              >
                {tc("viewAll")} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              {statsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-4 border-primary-500/20 border-t-primary-500"></div>
                </div>
              ) : peerRequests.length > 0 ? (
                <div className="space-y-3">
                  {peerRequests.slice(0, 3).map((request) => (
                    <Link
                      key={request.id}
                      href={`/reviews/peer-requests/${request.id}`}
                      className="block bg-muted/50 rounded-lg p-3 hover:bg-muted transition border border-border/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground text-sm">{request.message || "Peer review request"}</span>
                        <span className="text-xs text-amber-400 px-2 py-0.5 bg-amber-500/10 rounded capitalize">
                          {request.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t("dashboard.noPendingFeedback")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contribution Summary */}
          <div data-testid="contributions-section" className="bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <GitPullRequest className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t("stats.contributions")}</h3>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating || !developerId}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-lg text-sm transition disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-500/20 border-t-primary-500"></div>
                    {t("dashboard.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("dashboard.generateSummary")}
                  </>
                )}
              </button>
            </div>
            <div className="p-6">
              {contributionsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-4 border-primary-500/20 border-t-primary-500"></div>
                </div>
              ) : contributionSummary ? (
                <div className="space-y-4">
                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.commits?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("dashboard.commits")}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.pull_requests?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("dashboard.prs")}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.code_reviews?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("dashboard.codeReviews")}</p>
                    </div>
                  </div>
                  {/* AI Preview */}
                  {!contributionSummary?.ai_insights && (
                    <div data-testid="ai-preview" className="mt-4 p-3 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                        <span className="text-purple-400 text-xs font-medium">{t("dashboard.aiInsightPreviewLabel")}</span>
                      </div>
                      <p className="text-muted-foreground text-xs italic">
                        &quot;Connect your GitHub account to unlock AI-generated contribution narratives that synthesize your commits, PRs, and code reviews into compelling summaries.&quot;
                      </p>
                    </div>
                  )}
                  {/* AI Insights */}
                  {contributionSummary.ai_insights && (
                    <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-lg p-3">
                      <p className="text-sm text-emerald-300 line-clamp-3">
                        {contributionSummary.ai_insights}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mx-auto mb-3">
                    <GitPullRequest className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm mb-2">
                    No contribution data yet
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Click &quot;Generate Summary&quot; to analyze your GitHub activity
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-cyan-500/10 rounded-lg w-fit mb-3">
              <Target className="h-5 w-5 text-cyan-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">{t("features.smartGoals")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("features.smartGoalsDesc")}
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">{t("features.feedback360")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("features.feedback360Desc")}
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mb-3">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">{t("features.aiSummaries")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("features.aiSummariesDesc")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
