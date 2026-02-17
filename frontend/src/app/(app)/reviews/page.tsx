"use client";

import { useState } from "react";
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

// Goal Card Component
function GoalCard({ goal }: { goal: WorkGoal }) {
  const progressPercent = goal.progress_percentage || 0;
  const statusColors: Record<string, string> = {
    active: "text-blue-400 bg-blue-500/10",
    in_progress: "text-cyan-400 bg-cyan-500/10",
    completed: "text-emerald-400 bg-emerald-500/10",
    cancelled: "text-muted-foreground bg-muted-foreground/10",
  };

  return (
    <Link
      href={`/reviews/goals/${goal.id}`}
      className="block bg-muted/50 rounded-lg p-4 hover:bg-muted transition border border-border/50"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-foreground font-medium line-clamp-1">{goal.title}</h4>
        <span
          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
            statusColors[goal.status] || statusColors.active
          }`}
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
  const statusColors: Record<string, { text: string; bg: string }> = {
    draft: { text: "text-muted-foreground", bg: "bg-muted-foreground/10" },
    active: { text: "text-green-400", bg: "bg-green-500/10" },
    self_review: { text: "text-blue-400", bg: "bg-blue-500/10" },
    peer_review: { text: "text-purple-400", bg: "bg-purple-500/10" },
    manager_review: { text: "text-amber-400", bg: "bg-amber-500/10" },
    completed: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  };
  const colors = statusColors[cycle.status] || statusColors.draft;

  return (
    <Link
      href={`/reviews/cycles/${cycle.id}`}
      className="block bg-purple-900/20 border border-purple-800/50 rounded-lg p-4 hover:bg-purple-900/30 transition"
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

  const handleGenerateSummary = async () => {
    if (!developerId) return;
    setIsGenerating(true);
    try {
      await generateSummary("quarterly");
    } catch (err) {
      console.error("Failed to generate summary:", err);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading reviews...</p>
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
              <h1 className="text-2xl font-bold text-foreground">Performance Reviews</h1>
              <p className="text-muted-foreground text-sm">
                Track goals, contributions, and 360° feedback
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/reviews/goals/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              New Goal
            </Link>
            {hasWorkspaces && (
              <>
                <Link
                  href="/reviews/manage"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-600/30 rounded-lg transition text-sm"
                >
                  <Users className="h-4 w-4" />
                  Management View
                </Link>
                <Link
                  href="/reviews/cycles"
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm"
                >
                  <Settings className="h-4 w-4" />
                  Manage Cycles
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
              <span className="text-muted-foreground text-sm">Active Goals</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.activeGoals}
            </p>
            <p className="text-xs text-muted-foreground mt-1">In progress</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-muted-foreground text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.completedGoals}
            </p>
            <p className="text-xs text-muted-foreground mt-1">This quarter</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-muted-foreground text-sm">Peer Reviews</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statsLoading ? "-" : stats.pendingPeerRequests}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pending requests</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border hover:border-border transition">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <GitPullRequest className="w-5 h-5 text-orange-400" />
              </div>
              <span className="text-muted-foreground text-sm">Contributions</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {contributionsLoading
                ? "-"
                : contributionSummary?.metrics?.pull_requests?.total || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Auto-linked PRs</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* My Goals */}
          <div className="lg:col-span-2 bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">My Goals</h3>
              </div>
              <Link
                href="/reviews/goals"
                className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              {statsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
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
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
                    <Target className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">No goals yet</h3>
                  <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                    Create SMART goals to track your progress and automatically link your GitHub contributions.
                  </p>
                  <Link
                    href="/reviews/goals/new"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Create Your First Goal
                  </Link>
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
                <h3 className="text-lg font-semibold text-foreground">Review Cycle</h3>
              </div>
            </div>
            <div className="p-6">
              {cyclesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : activeCycle ? (
                <CycleCard cycle={activeCycle} />
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    No active review cycle
                  </p>
                  {hasWorkspaces && (
                    <Link
                      href="/reviews/cycles"
                      className="text-purple-400 hover:text-purple-300 text-sm transition"
                    >
                      Create a review cycle
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
                <h3 className="text-lg font-semibold text-foreground">Feedback Requests</h3>
              </div>
              <Link
                href="/reviews/peer-requests"
                className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 transition"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              {statsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500"></div>
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
                    No pending feedback requests
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contribution Summary */}
          <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <GitPullRequest className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Contributions</h3>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating || !developerId}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-lg text-sm transition disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-emerald-400"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Summary
                  </>
                )}
              </button>
            </div>
            <div className="p-6">
              {contributionsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-emerald-500"></div>
                </div>
              ) : contributionSummary ? (
                <div className="space-y-4">
                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.commits?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Commits</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.pull_requests?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">PRs</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {contributionSummary.metrics?.code_reviews?.total || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Reviews</p>
                    </div>
                  </div>
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
            <h4 className="text-foreground font-medium mb-2">SMART Goals</h4>
            <p className="text-muted-foreground text-sm">
              Set Specific, Measurable, Achievable, Relevant, and Time-bound goals with key results tracking.
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">360° Feedback</h4>
            <p className="text-muted-foreground text-sm">
              Request anonymous peer reviews using the COIN framework (Context, Observation, Impact, Next Steps).
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mb-3">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">AI Summaries</h4>
            <p className="text-muted-foreground text-sm">
              Auto-generate contribution narratives from your GitHub commits, PRs, and code reviews.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
