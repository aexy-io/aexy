"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  MoreVertical,
  Play,
  Plus,
  Target,
  Trash2,
  Users,
  CheckCircle,
  AlertCircle,
  Pause,
  RotateCcw,
  BookOpen,
  Bug,
  Package,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSprints, useActiveSprint } from "@/hooks/useSprints";
import { useStories } from "@/hooks/useStories";
import { useBugs, useBugStats } from "@/hooks/useBugs";
import { useReleases } from "@/hooks/useReleases";
import { useOKRDashboard } from "@/hooks/useOKRGoals";
import { SprintListItem, SprintStatus } from "@/lib/api";
import { redirect } from "next/navigation";

const STATUS_CONFIG: Record<SprintStatus, { label: string; color: string; icon: React.ReactNode; bgColor: string }> = {
  planning: {
    label: "Planning",
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    icon: <Target className="h-4 w-4" />,
  },
  active: {
    label: "Active",
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    icon: <Play className="h-4 w-4" />,
  },
  review: {
    label: "In Review",
    color: "text-amber-400",
    bgColor: "bg-amber-900/30",
    icon: <Pause className="h-4 w-4" />,
  },
  retrospective: {
    label: "Retrospective",
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    icon: <RotateCcw className="h-4 w-4" />,
  },
  completed: {
    label: "Completed",
    color: "text-slate-400",
    bgColor: "bg-slate-700",
    icon: <CheckCircle className="h-4 w-4" />,
  },
};

function formatDate(dateString: string | null) {
  if (!dateString) return "Not set";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysRemaining(endDate: string | null) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

interface SprintCardProps {
  sprint: SprintListItem;
  projectId: string;
  onDelete: (sprintId: string) => void;
  isActive?: boolean;
}

function SprintCard({ sprint, projectId, onDelete, isActive }: SprintCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const statusConfig = STATUS_CONFIG[sprint.status];
  const daysRemaining = getDaysRemaining(sprint.end_date);
  const completionRate = sprint.tasks_count > 0
    ? Math.round((sprint.completed_count / sprint.tasks_count) * 100)
    : 0;

  return (
    <div className={`bg-slate-800 rounded-xl overflow-hidden border ${isActive ? 'border-primary-500' : 'border-slate-700'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isActive && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-900/30 text-primary-400 rounded">
                  Current Sprint
                </span>
              )}
              <span className={`px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 ${statusConfig.color} ${statusConfig.bgColor}`}>
                {statusConfig.icon}
                {statusConfig.label}
              </span>
            </div>
            <Link
              href={`/sprints/${projectId}/${sprint.id}`}
              className="text-lg font-semibold text-white hover:text-primary-400 transition"
            >
              {sprint.name}
            </Link>
            {sprint.goal && (
              <p className="text-slate-400 text-sm mt-1 line-clamp-2">{sprint.goal}</p>
            )}
          </div>
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                setShowMenu(!showMenu);
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <Link
                    href={`/sprints/${projectId}/${sprint.id}`}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                    View Board
                  </Link>
                  <button
                    onClick={() => {
                      onDelete(sprint.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-4 text-sm text-slate-400 mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(sprint.start_date)} - {formatDate(sprint.end_date)}</span>
          </div>
          {sprint.status === "active" && daysRemaining !== null && (
            <div className={`flex items-center gap-1.5 ${daysRemaining < 3 ? 'text-amber-400' : 'text-slate-400'}`}>
              <Clock className="h-4 w-4" />
              <span>
                {daysRemaining > 0
                  ? `${daysRemaining} days left`
                  : daysRemaining === 0
                    ? "Ends today"
                    : `${Math.abs(daysRemaining)} days overdue`}
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-400">Progress</span>
            <span className="text-white font-medium">{completionRate}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-700/50 rounded-lg p-2">
            <div className="text-lg font-semibold text-white">{sprint.tasks_count}</div>
            <div className="text-xs text-slate-400">Total Tasks</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-2">
            <div className="text-lg font-semibold text-green-400">{sprint.completed_count}</div>
            <div className="text-xs text-slate-400">Completed</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-2">
            <div className="text-lg font-semibold text-blue-400">{sprint.total_points || 0}</div>
            <div className="text-xs text-slate-400">Story Points</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CreateSprintModalProps {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    goal?: string;
    start_date: string;
    end_date: string;
  }) => Promise<unknown>;
  isCreating: boolean;
}

function CreateSprintModal({ onClose, onCreate, isCreating }: CreateSprintModalProps) {
  // Calculate default dates (today and 2 weeks from now)
  const today = new Date().toISOString().split("T")[0];
  const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(twoWeeksLater);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Sprint name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        goal: goal.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create sprint";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Create Sprint</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sprint Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint 24"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sprint Goal (optional)</label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What do you want to achieve in this sprint?"
                rows={2}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate || today}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate || twoWeeksLater}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Sprint
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SprintsPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    sprints,
    isLoading: sprintsLoading,
    createSprint,
    deleteSprint,
    isCreating,
  } = useSprints(currentWorkspaceId, projectId);

  const { sprint: activeSprint } = useActiveSprint(currentWorkspaceId, projectId);

  // New feature hooks
  const { stories, total: storiesTotal } = useStories(currentWorkspaceId, { project_id: projectId });
  const { stats: bugStats } = useBugStats(currentWorkspaceId, projectId);
  const { releases, total: releasesTotal } = useReleases(currentWorkspaceId, { project_id: projectId });
  const { summary: okrSummary } = useOKRDashboard(currentWorkspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleDelete = async (sprintId: string) => {
    if (confirm("Are you sure you want to delete this sprint? This action cannot be undone.")) {
      try {
        await deleteSprint(sprintId);
      } catch (error) {
        console.error("Failed to delete sprint:", error);
      }
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Group sprints by status
  const activeSprints = sprints.filter((s) => s.status === "active");
  const planningSprints = sprints.filter((s) => s.status === "planning");
  const reviewSprints = sprints.filter((s) => s.status === "review" || s.status === "retrospective");
  const completedSprints = sprints.filter((s) => s.status === "completed");

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/sprints"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <Target className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">Sprint Planning</h1>
                  <p className="text-slate-400 text-sm">
                    Manage sprints and track progress
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
            >
              <Plus className="h-4 w-4" />
              New Sprint
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Quick Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Stories Widget */}
          <Link
            href={`/sprints/${projectId}/stories`}
            className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-blue-500/50 transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <BookOpen className="h-5 w-5 text-blue-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 transition" />
            </div>
            <div className="text-2xl font-bold text-white">{storiesTotal}</div>
            <div className="text-sm text-slate-400">User Stories</div>
            <div className="mt-2 text-xs text-slate-500">
              {stories.filter(s => s.status === 'in_progress').length} in progress
            </div>
          </Link>

          {/* Bugs Widget */}
          <Link
            href={`/sprints/${projectId}/bugs`}
            className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-red-500/50 transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Bug className="h-5 w-5 text-red-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-red-400 transition" />
            </div>
            <div className="text-2xl font-bold text-white">{bugStats?.total || 0}</div>
            <div className="text-sm text-slate-400">Open Bugs</div>
            <div className="mt-2 text-xs">
              <span className="text-red-400">{bugStats?.by_severity?.blocker || 0} blockers</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-orange-400">{bugStats?.by_severity?.critical || 0} critical</span>
            </div>
          </Link>

          {/* Releases Widget */}
          <Link
            href={`/sprints/${projectId}/releases`}
            className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-green-500/50 transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Package className="h-5 w-5 text-green-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-green-400 transition" />
            </div>
            <div className="text-2xl font-bold text-white">{releasesTotal}</div>
            <div className="text-sm text-slate-400">Releases</div>
            <div className="mt-2 text-xs text-slate-500">
              {releases.filter(r => r.status === 'in_progress').length} in progress
            </div>
          </Link>

          {/* Goals Widget */}
          <Link
            href={`/sprints/${projectId}/goals`}
            className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-purple-500/50 transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-purple-400 transition" />
            </div>
            <div className="text-2xl font-bold text-white">{okrSummary.total_objectives}</div>
            <div className="text-sm text-slate-400">OKR Goals</div>
            <div className="mt-2 text-xs">
              <span className="text-green-400">{okrSummary.on_track} on track</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-amber-400">{okrSummary.at_risk} at risk</span>
            </div>
          </Link>
        </div>

        {/* Sprint Progress Overview */}
        {activeSprint && (
          <div className="bg-gradient-to-r from-primary-900/30 to-slate-800 rounded-xl p-6 border border-primary-500/30 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-primary-400 mb-1">Current Sprint</div>
                <h3 className="text-xl font-semibold text-white">{activeSprint.name}</h3>
              </div>
              <Link
                href={`/sprints/${projectId}/${activeSprint.id}`}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm transition flex items-center gap-2"
              >
                View Board
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {activeSprint.goal && (
              <p className="text-slate-400 text-sm mb-4">{activeSprint.goal}</p>
            )}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{activeSprint.tasks_count}</div>
                <div className="text-xs text-slate-400">Total Tasks</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{activeSprint.completed_count}</div>
                <div className="text-xs text-slate-400">Completed</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{activeSprint.total_points || 0}</div>
                <div className="text-xs text-slate-400">Story Points</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">
                  {activeSprint.tasks_count > 0
                    ? Math.round((activeSprint.completed_count / activeSprint.tasks_count) * 100)
                    : 0}%
                </div>
                <div className="text-xs text-slate-400">Progress</div>
              </div>
            </div>
          </div>
        )}

        {sprintsLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : sprints.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <Target className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No Sprints Yet</h3>
            <p className="text-slate-400 mb-6">
              Create your first sprint to start planning and tracking work.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Sprint
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Sprint */}
            {activeSprints.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Play className="h-5 w-5 text-green-400" />
                  Active Sprint
                </h2>
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                  {activeSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      projectId={projectId}
                      onDelete={handleDelete}
                      isActive={activeSprint?.id === sprint.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Planning */}
            {planningSprints.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-400" />
                  Planning ({planningSprints.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                  {planningSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      projectId={projectId}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* In Review / Retrospective */}
            {reviewSprints.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                  In Review ({reviewSprints.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                  {reviewSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      projectId={projectId}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed */}
            {completedSprints.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-slate-400" />
                  Completed ({completedSprints.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                  {completedSprints.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      projectId={projectId}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Create Sprint Modal */}
      {showCreateModal && (
        <CreateSprintModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createSprint}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}
