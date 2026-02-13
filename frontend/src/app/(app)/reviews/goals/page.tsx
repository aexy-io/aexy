"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Target,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter,
  Search,
  ArrowLeft,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGoals } from "@/hooks/useReviews";
import { WorkGoal, GoalType } from "@/lib/api";

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
  active: { text: "text-blue-400", bg: "bg-blue-500/10", icon: <Clock className="h-3.5 w-3.5" /> },
  in_progress: { text: "text-cyan-400", bg: "bg-cyan-500/10", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  completed: { text: "text-emerald-400", bg: "bg-emerald-500/10", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  cancelled: { text: "text-slate-400", bg: "bg-slate-500/10", icon: <AlertCircle className="h-3.5 w-3.5" /> },
};

// Goal Card Component
function GoalCard({ goal, onDelete }: { goal: WorkGoal; onDelete: (id: string) => void }) {
  const progressPercent = goal.progress_percentage || 0;
  const typeColors = goalTypeColors[goal.goal_type] || goalTypeColors.performance;
  const statusColors = goalStatusColors[goal.status] || goalStatusColors.active;

  return (
    <div className="bg-slate-800/70 rounded-xl border border-slate-700 hover:border-slate-600 transition overflow-hidden">
      <Link href={`/reviews/goals/${goal.id}`} className="block p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`${typeColors.text} ${typeColors.bg} text-xs px-2 py-0.5 rounded-full capitalize`}>
              {goal.goal_type.replace("_", " ")}
            </span>
            <span className={`${statusColors.text} ${statusColors.bg} text-xs px-2 py-0.5 rounded-full capitalize flex items-center gap-1`}>
              {statusColors.icon}
              {goal.status.replace("_", " ")}
            </span>
          </div>
          {goal.priority && (
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              goal.priority === "critical" ? "text-red-400 bg-red-500/10" :
              goal.priority === "high" ? "text-orange-400 bg-orange-500/10" :
              goal.priority === "medium" ? "text-yellow-400 bg-yellow-500/10" :
              "text-slate-400 bg-slate-500/10"
            }`}>
              {goal.priority}
            </span>
          )}
        </div>
        <h3 className="text-lg font-medium text-white mb-2">{goal.title}</h3>
        {goal.description && (
          <p className="text-slate-400 text-sm mb-4 line-clamp-2">{goal.description}</p>
        )}

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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

        {/* Key Results Preview */}
        {goal.key_results && goal.key_results.length > 0 && (
          <div className="text-xs text-slate-500">
            {goal.key_results.length} key result{goal.key_results.length > 1 ? "s" : ""}
          </div>
        )}

        {/* Time bound */}
        {goal.time_bound && (
          <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Due: {new Date(goal.time_bound).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}
      </Link>

      {/* Actions */}
      {goal.status !== "completed" && goal.status !== "cancelled" && (
        <div className="border-t border-slate-700 px-5 py-3 flex items-center justify-between">
          <Link
            href={`/reviews/goals/${goal.id}`}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition"
          >
            View Details
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm("Are you sure you want to delete this goal?")) {
                onDelete(goal.id);
              }
            }}
            className="text-slate-500 hover:text-red-400 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const developerId = user?.id;
  const { goals, isLoading: goalsLoading, deleteGoal } = useGoals(developerId, {
    workspace_id: currentWorkspaceId || undefined,
  });

  // Filter and search goals
  const filteredGoals = useMemo(() => {
    let result = goals;

    // Apply status filter
    if (filter === "active") {
      result = result.filter(g => g.status === "active" || g.status === "in_progress");
    } else if (filter === "completed") {
      result = result.filter(g => g.status === "completed");
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(g =>
        g.title.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [goals, filter, searchQuery]);

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await deleteGoal(goalId);
    } catch (err) {
      console.error("Failed to delete goal:", err);
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading goals...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Goals</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">My Goals</h1>
            <p className="text-slate-400 mt-1">
              Track your SMART goals and key results
            </p>
          </div>
          <Link
            href="/reviews/goals/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-slate-800 rounded-lg p-1">
            {(["all", "active", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${
                  filter === f
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
            />
          </div>
        </div>

        {/* Goals List or Empty State */}
        {goalsLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : filteredGoals.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} onDelete={handleDeleteGoal} />
            ))}
          </div>
        ) : goals.length > 0 && filteredGoals.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No matching goals</h3>
              <p className="text-slate-400 text-sm">
                Try adjusting your filters or search query
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-12">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
                <Target className="w-10 h-10 text-slate-500" />
              </div>
              <h3 className="text-xl font-medium text-white mb-3">No goals yet</h3>
              <p className="text-slate-400 text-sm mb-8">
                SMART goals help you track progress and automatically link your GitHub contributions.
                Set Specific, Measurable, Achievable, Relevant, and Time-bound objectives.
              </p>

              <Link
                href="/reviews/goals/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition font-medium"
              >
                <Plus className="h-4 w-4" />
                Create Your First Goal
              </Link>

              {/* Goal Types */}
              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-cyan-400 text-sm font-medium mb-1">Performance</div>
                  <p className="text-slate-400 text-xs">Delivery & quality targets</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-purple-400 text-sm font-medium mb-1">Skill Development</div>
                  <p className="text-slate-400 text-xs">Learning new technologies</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-emerald-400 text-sm font-medium mb-1">Project</div>
                  <p className="text-slate-400 text-xs">Feature & milestone goals</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-amber-400 text-sm font-medium mb-1">Leadership</div>
                  <p className="text-slate-400 text-xs">Mentoring & team impact</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
