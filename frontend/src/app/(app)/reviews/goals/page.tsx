"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
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
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/EmptyState";
import { WorkGoal, GoalType } from "@/lib/api";
import { GOAL_TYPE_COLORS, GOAL_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";

// Goal status colors extended with icons
const goalStatusIcons: Record<string, React.ReactNode> = {
  active: <Clock className="h-3.5 w-3.5" />,
  in_progress: <TrendingUp className="h-3.5 w-3.5" />,
  completed: <CheckCircle className="h-3.5 w-3.5" />,
  cancelled: <AlertCircle className="h-3.5 w-3.5" />,
};

// Goal Card Component
function GoalCard({ goal, onDelete }: { goal: WorkGoal; onDelete: (id: string) => void }) {
  const progressPercent = goal.progress_percentage || 0;
  const typeColors = getStatusColor(GOAL_TYPE_COLORS, goal.goal_type);
  const statusColors = getStatusColor(GOAL_STATUS_COLORS, goal.status);
  const statusIcon = goalStatusIcons[goal.status] || null;

  return (
    <div className="bg-muted/70 rounded-xl border border-border hover:border-border transition overflow-hidden">
      <Link href={`/reviews/goals/${goal.id}`} className="block p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`${typeColors.text} ${typeColors.bg} text-xs px-2 py-0.5 rounded-full capitalize`}>
              {goal.goal_type.replace("_", " ")}
            </span>
            <span className={`${statusColors.text} ${statusColors.bg} text-xs px-2 py-0.5 rounded-full capitalize flex items-center gap-1`}>
              {statusIcon}
              {goal.status.replace("_", " ")}
            </span>
          </div>
          {goal.priority && (
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              goal.priority === "critical" ? "text-red-400 bg-red-500/10" :
              goal.priority === "high" ? "text-orange-400 bg-orange-500/10" :
              goal.priority === "medium" ? "text-yellow-400 bg-yellow-500/10" :
              "text-muted-foreground bg-muted-foreground/10"
            }`}>
              {goal.priority}
            </span>
          )}
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{goal.title}</h3>
        {goal.description && (
          <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{goal.description}</p>
        )}

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-accent rounded-full overflow-hidden">
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
          <div className="text-xs text-muted-foreground">
            {goal.key_results.length} key result{goal.key_results.length > 1 ? "s" : ""}
          </div>
        )}

        {/* Time bound */}
        {goal.time_bound && (
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
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
        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <Link
            href={`/reviews/goals/${goal.id}`}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition"
          >
            View Details
          </Link>
          <button
            data-testid="delete-goal-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(goal.id);
            }}
            className="text-muted-foreground hover:text-red-400 transition"
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
  const [deleteConfirmGoalId, setDeleteConfirmGoalId] = useState<string | null>(null);

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

  const filterCounts = useMemo(() => {
    const active = goals.filter(g => g.status !== "completed" && g.status !== "cancelled").length;
    const completed = goals.filter(g => g.status === "completed").length;
    return { all: goals.length, active, completed };
  }, [goals]);

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await deleteGoal(goalId);
      toast.success("Goal deleted");
      setDeleteConfirmGoalId(null);
    } catch (err) {
      console.error("Failed to delete goal:", err);
      toast.error("Failed to delete goal");
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background animate-pulse">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-sm mb-6">
            <div className="h-4 w-16 bg-accent rounded" />
            <div className="h-4 w-4 bg-accent rounded" />
            <div className="h-4 w-12 bg-accent rounded" />
          </div>
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="h-8 w-32 bg-accent rounded mb-2" />
              <div className="h-4 w-56 bg-accent rounded" />
            </div>
            <div className="h-9 w-28 bg-accent rounded-lg" />
          </div>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex bg-muted rounded-lg p-1 gap-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-20 bg-accent rounded-lg" />
              ))}
            </div>
            <div className="h-9 flex-1 bg-accent rounded-lg" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-5 w-48 bg-accent rounded" />
                  <div className="h-6 w-20 bg-accent rounded-full" />
                </div>
                <div className="h-3 w-full bg-accent rounded mb-2" />
                <div className="h-3 w-2/3 bg-accent rounded mb-4" />
                <div className="h-2 w-full bg-accent rounded-full" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-muted-foreground hover:text-foreground transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">Goals</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Goals</h1>
            <p className="text-muted-foreground mt-1">
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
          <div className="flex bg-muted rounded-lg p-1">
            {(["all", "active", "completed"] as const).map((f) => (
              <button
                key={f}
                data-testid={`filter-tab-${f}`}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${
                  filter === f
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  filter === f ? "bg-muted" : "bg-accent"
                }`}>
                  {filterCounts[f]}
                </span>
              </button>
            ))}
          </div>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search goals..."
            wrapperClassName="flex-1"
          />
        </div>

        {/* Goals List or Empty State */}
        {goalsLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : filteredGoals.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} onDelete={(id) => setDeleteConfirmGoalId(id)} />
            ))}
          </div>
        ) : goals.length > 0 && filteredGoals.length === 0 ? (
          <div className="bg-muted rounded-xl border border-border p-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No matching goals</h3>
              <p className="text-muted-foreground text-sm">
                Try adjusting your filters or search query
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Set goals to track progress and align team objectives with company priorities."
            actions={[
              { label: "Create Goal", href: "/reviews/goals/new" },
            ]}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmGoalId && (
          <div data-testid="delete-confirm-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-muted border border-border rounded-xl p-6 max-w-md mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Goal</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Are you sure you want to delete this goal? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  data-testid="delete-confirm-cancel"
                  onClick={() => setDeleteConfirmGoalId(null)}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground transition text-sm"
                >
                  Cancel
                </button>
                <button
                  data-testid="delete-confirm-submit"
                  onClick={() => handleDeleteGoal(deleteConfirmGoalId)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition text-sm font-medium"
                >
                  Delete Goal
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
