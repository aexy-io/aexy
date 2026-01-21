"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Target,
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  Tag,
  GitCommit,
  GitPullRequest,
  Link2,
  Trash2,
  Edit,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGoalDetail } from "@/hooks/useReviews";
import { GoalType, GoalPriority } from "@/lib/api";

// Goal type colors
const goalTypeColors: Record<GoalType, { text: string; bg: string }> = {
  performance: { text: "text-cyan-400", bg: "bg-cyan-500/10" },
  skill_development: { text: "text-purple-400", bg: "bg-purple-500/10" },
  project: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  leadership: { text: "text-amber-400", bg: "bg-amber-500/10" },
  team_contribution: { text: "text-blue-400", bg: "bg-blue-500/10" },
};

// Goal status colors
const goalStatusColors: Record<string, { text: string; bg: string; icon: React.ReactNode }> = {
  draft: { text: "text-slate-400", bg: "bg-slate-500/10", icon: <Clock className="h-4 w-4" /> },
  active: { text: "text-blue-400", bg: "bg-blue-500/10", icon: <Clock className="h-4 w-4" /> },
  completed: { text: "text-emerald-400", bg: "bg-emerald-500/10", icon: <CheckCircle className="h-4 w-4" /> },
  cancelled: { text: "text-slate-400", bg: "bg-slate-500/10", icon: <AlertCircle className="h-4 w-4" /> },
  deferred: { text: "text-yellow-400", bg: "bg-yellow-500/10", icon: <Clock className="h-4 w-4" /> },
};

// Priority colors
const priorityColors: Record<GoalPriority, { text: string; bg: string }> = {
  critical: { text: "text-red-400", bg: "bg-red-500/10" },
  high: { text: "text-orange-400", bg: "bg-orange-500/10" },
  medium: { text: "text-yellow-400", bg: "bg-yellow-500/10" },
  low: { text: "text-slate-400", bg: "bg-slate-500/10" },
};

export default function GoalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params.goalId as string;
  const { user, isLoading: authLoading } = useAuth();
  const { goal, isLoading, error, updateProgress, autoLink, complete } = useGoalDetail(goalId);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [isAutoLinking, setIsAutoLinking] = useState(false);

  const handleUpdateProgress = async (newProgress: number) => {
    setIsUpdatingProgress(true);
    try {
      await updateProgress(newProgress);
    } catch (err) {
      console.error("Failed to update progress:", err);
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleAutoLink = async () => {
    setIsAutoLinking(true);
    try {
      await autoLink();
    } catch (err) {
      console.error("Failed to auto-link:", err);
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Are you sure you want to mark this goal as completed?")) return;
    try {
      await complete();
    } catch (err) {
      console.error("Failed to complete goal:", err);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading goal...</p>
        </div>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Target className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-white mb-2">Goal not found</h2>
          <p className="text-slate-400 mb-6">The goal you're looking for doesn't exist or you don't have access.</p>
          <Link href="/reviews/goals" className="text-cyan-400 hover:text-cyan-300 transition">
            Back to Goals
          </Link>
        </div>
      </div>
    );
  }

  const typeColors = goalTypeColors[goal.goal_type] || goalTypeColors.performance;
  const statusColors = goalStatusColors[goal.status] || goalStatusColors.active;
  const prioColors = priorityColors[goal.priority] || priorityColors.medium;
  const progressPercent = goal.progress_percentage || 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link href="/reviews/goals" className="text-slate-400 hover:text-white transition">
            Goals
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white truncate max-w-xs">{goal.title}</span>
        </div>

        {/* Header */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${typeColors.text} ${typeColors.bg} text-sm px-3 py-1 rounded-full capitalize`}>
                {goal.goal_type.replace("_", " ")}
              </span>
              <span className={`${statusColors.text} ${statusColors.bg} text-sm px-3 py-1 rounded-full capitalize flex items-center gap-1.5`}>
                {statusColors.icon}
                {goal.status.replace("_", " ")}
              </span>
              <span className={`${prioColors.text} ${prioColors.bg} text-sm px-3 py-1 rounded-full capitalize`}>
                {goal.priority}
              </span>
              {goal.is_private && (
                <span className="text-slate-400 bg-slate-700/50 text-sm px-3 py-1 rounded-full">
                  Private
                </span>
              )}
            </div>
            {goal.status !== "completed" && goal.status !== "cancelled" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleComplete}
                  className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition flex items-center gap-1.5"
                >
                  <CheckCircle className="h-4 w-4" />
                  Complete
                </button>
              </div>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">{goal.title}</h1>
          {goal.description && (
            <p className="text-slate-400 mb-4">{goal.description}</p>
          )}

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">Progress</span>
              <span className="text-white font-medium">{progressPercent}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPercent >= 100 ? "bg-emerald-500" :
                  progressPercent >= 50 ? "bg-cyan-500" :
                  "bg-blue-500"
                }`}
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Quick Actions */}
          {goal.status !== "completed" && goal.status !== "cancelled" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleUpdateProgress(Math.min(progressPercent + 10, 100))}
                disabled={isUpdatingProgress}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <TrendingUp className="h-4 w-4" />
                +10%
              </button>
              <button
                onClick={handleAutoLink}
                disabled={isAutoLinking}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Link2 className="h-4 w-4" />
                {isAutoLinking ? "Linking..." : "Auto-Link GitHub"}
              </button>
            </div>
          )}

          {/* Meta Info */}
          <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
            {goal.time_bound && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Due: {new Date(goal.time_bound).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Created: {new Date(goal.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* SMART Framework */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-cyan-400" />
                SMART Framework
              </h2>
              <div className="space-y-4">
                {goal.specific && (
                  <div>
                    <h3 className="text-sm font-medium text-cyan-400 mb-1">Specific</h3>
                    <p className="text-slate-300">{goal.specific}</p>
                  </div>
                )}
                {goal.measurable && (
                  <div>
                    <h3 className="text-sm font-medium text-purple-400 mb-1">Measurable</h3>
                    <p className="text-slate-300">{goal.measurable}</p>
                  </div>
                )}
                {goal.achievable && (
                  <div>
                    <h3 className="text-sm font-medium text-emerald-400 mb-1">Achievable</h3>
                    <p className="text-slate-300">{goal.achievable}</p>
                  </div>
                )}
                {goal.relevant && (
                  <div>
                    <h3 className="text-sm font-medium text-amber-400 mb-1">Relevant</h3>
                    <p className="text-slate-300">{goal.relevant}</p>
                  </div>
                )}
                {!goal.specific && !goal.measurable && !goal.achievable && !goal.relevant && (
                  <p className="text-slate-500 text-sm">No SMART framework details added.</p>
                )}
              </div>
            </div>

            {/* Key Results */}
            {goal.key_results && goal.key_results.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-400" />
                  Key Results ({goal.key_results.length})
                </h2>
                <div className="space-y-4">
                  {goal.key_results.map((kr, index) => (
                    <div key={kr.id || index} className="bg-slate-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white">{kr.description}</span>
                        <span className="text-sm text-slate-400">
                          {kr.current || 0} / {kr.target} {kr.unit}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.min((kr.current || 0) / kr.target * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Contributions */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <GitCommit className="h-5 w-5 text-emerald-400" />
                Linked Contributions
              </h2>

              {goal.linked_commits && goal.linked_commits.length > 0 ? (
                <div className="space-y-3 mb-6">
                  <h3 className="text-sm font-medium text-slate-400">Commits ({goal.linked_commits.length})</h3>
                  {goal.linked_commits.slice(0, 5).map((commit, i) => (
                    <div key={commit.sha || i} className="flex items-center gap-3 text-sm">
                      <GitCommit className="h-4 w-4 text-slate-500" />
                      <span className="text-slate-300 truncate flex-1">{commit.title}</span>
                      <span className="text-emerald-400">+{commit.additions}</span>
                      <span className="text-red-400">-{commit.deletions}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm mb-4">No commits linked yet.</p>
              )}

              {goal.linked_pull_requests && goal.linked_pull_requests.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-400">Pull Requests ({goal.linked_pull_requests.length})</h3>
                  {goal.linked_pull_requests.slice(0, 5).map((pr, i) => (
                    <div key={pr.id || i} className="flex items-center gap-3 text-sm">
                      <GitPullRequest className="h-4 w-4 text-slate-500" />
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 truncate flex-1"
                      >
                        {pr.title}
                      </a>
                      <span className="text-emerald-400">+{pr.additions}</span>
                      <span className="text-red-400">-{pr.deletions}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No pull requests linked yet.</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tracking Keywords */}
            {goal.tracking_keywords && goal.tracking_keywords.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-amber-400" />
                  Tracking Keywords
                </h2>
                <div className="flex flex-wrap gap-2">
                  {goal.tracking_keywords.map((keyword, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-sm"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Commits and PRs with these keywords will auto-link to this goal.
                </p>
              </div>
            )}

            {/* Quick Stats */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-medium text-white mb-4">Quick Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Key Results</span>
                  <span className="text-white">{goal.key_results?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Linked Commits</span>
                  <span className="text-white">{goal.linked_commits?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Linked PRs</span>
                  <span className="text-white">{goal.linked_pull_requests?.length || 0}</span>
                </div>
                {goal.completed_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Completed</span>
                    <span className="text-emerald-400">
                      {new Date(goal.completed_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
