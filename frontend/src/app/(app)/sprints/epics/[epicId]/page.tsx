"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect, useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Edit2,
  Flag,
  GitBranch,
  GraduationCap,
  Layers,
  LogOut,
  Plus,
  Settings,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useEpic,
  useEpicDetail,
  useEpicProgress,
  useEpicTimeline,
} from "@/hooks/useEpics";
import { EpicStatus, EpicPriority } from "@/lib/api";

const STATUS_COLORS: Record<EpicStatus, { bg: string; text: string; border: string }> = {
  open: { bg: "bg-accent/50", text: "text-foreground", border: "border-border" },
  in_progress: { bg: "bg-blue-900/30", text: "text-blue-400", border: "border-blue-800/50" },
  done: { bg: "bg-green-900/30", text: "text-green-400", border: "border-green-800/50" },
  cancelled: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-800/50" },
};

const PRIORITY_COLORS: Record<EpicPriority, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

function ProgressCard({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="bg-muted rounded-lg border border-border p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-foreground font-medium">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 bg-accent rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {Math.round(percentage)}%
      </div>
    </div>
  );
}

export default function EpicDetailPage() {
  const params = useParams();
  const epicId = params.epicId as string;

  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();

  const { epic, isLoading: epicLoading, updateEpic, isUpdating } = useEpic(currentWorkspaceId, epicId);
  const { epicDetail } = useEpicDetail(currentWorkspaceId, epicId);
  const { progress } = useEpicProgress(currentWorkspaceId, epicId);
  const { timeline } = useEpicTimeline(currentWorkspaceId, epicId);

  const [isEditingStatus, setIsEditingStatus] = useState(false);

  if (authLoading || currentWorkspaceLoading || epicLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!epic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Layers className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">Epic Not Found</h2>
          <Link href="/sprints?tab=epics" className="text-primary-400 hover:underline">
            Back to Epics
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[epic.status];

  const handleStatusChange = async (newStatus: EpicStatus) => {
    await updateEpic({ status: newStatus });
    setIsEditingStatus(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-muted">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-foreground">Aexy</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/sprints"
                className="px-3 py-2 text-foreground bg-accent rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Planning
              </Link>
              <Link
                href="/learning"
                className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/settings/repositories"
                className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
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
              <span className="text-foreground">{user?.name || user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="text-muted-foreground hover:text-foreground transition"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/sprints?tab=epics" className="hover:text-foreground transition">
            Epics
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{epic.key}</span>
        </div>

        {/* Epic Header */}
        <div className="bg-muted rounded-xl border border-border p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: epic.color }}
              />
              <span className="text-muted-foreground font-mono">{epic.key}</span>
              {isEditingStatus ? (
                <select
                  value={epic.status}
                  onChange={(e) => handleStatusChange(e.target.value as EpicStatus)}
                  className="px-3 py-1 bg-accent border border-border rounded-lg text-foreground text-sm"
                  autoFocus
                  onBlur={() => setIsEditingStatus(false)}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              ) : (
                <button
                  onClick={() => setIsEditingStatus(true)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border} hover:opacity-80 transition`}
                >
                  {epic.status.replace("_", " ")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Flag className={`h-4 w-4 ${PRIORITY_COLORS[epic.priority]}`} />
                <span className="text-muted-foreground capitalize text-sm">{epic.priority}</span>
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">{epic.title}</h1>
          {epic.description && (
            <p className="text-muted-foreground mb-4">{epic.description}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-6 text-sm">
            {epic.owner_name && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Owner:</span>
                <span className="text-foreground">{epic.owner_name}</span>
              </div>
            )}
            {epic.start_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Started:</span>
                <span className="text-foreground">
                  {new Date(epic.start_date).toLocaleDateString()}
                </span>
              </div>
            )}
            {epic.target_date && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Target:</span>
                <span className="text-foreground">
                  {new Date(epic.target_date).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <ProgressCard
            label="Tasks"
            value={epic.completed_tasks}
            max={epic.total_tasks}
            color={epic.color}
          />
          <ProgressCard
            label="Story Points"
            value={epic.completed_story_points}
            max={epic.total_story_points}
            color={epic.color}
          />
          {progress && (
            <>
              <div className="bg-muted rounded-lg border border-border p-4">
                <div className="text-muted-foreground text-sm mb-1">In Progress</div>
                <div className="text-2xl font-bold text-foreground">{progress.in_progress_tasks}</div>
              </div>
              <div className="bg-muted rounded-lg border border-border p-4">
                <div className="text-muted-foreground text-sm mb-1">This Week</div>
                <div className="text-2xl font-bold text-green-400">
                  +{progress.tasks_completed_this_week}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Task Distribution */}
          <div className="lg:col-span-2 bg-muted rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Task Distribution</h2>
            {epicDetail?.tasks_by_status && Object.keys(epicDetail.tasks_by_status).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(epicDetail.tasks_by_status).map(([status, count]) => {
                  const total = epic.total_tasks;
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  const style = STATUS_COLORS[status as EpicStatus] || STATUS_COLORS.open;

                  return (
                    <div key={status}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                        <span className={`text-sm capitalize ${style.text}`}>
                          {status.replace("_", " ")}
                        </span>
                        <span className="text-sm text-muted-foreground">{count} tasks</span>
                      </div>
                      <div className="h-2 bg-accent rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${style.bg}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p>No tasks in this epic yet</p>
                <p className="text-sm mt-1">Add tasks from sprints to track progress</p>
              </div>
            )}
          </div>

          {/* Sprint Timeline */}
          <div className="bg-muted rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Sprint Timeline</h2>
            {timeline?.sprints && timeline.sprints.length > 0 ? (
              <div className="space-y-3">
                {timeline.sprints.map((sprint) => (
                  <Link
                    key={sprint.sprint_id}
                    href={`/sprints/${sprint.team_id}/${sprint.sprint_id}`}
                    className="block p-3 bg-accent/50 rounded-lg hover:bg-accent transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                      <span className="text-foreground font-medium text-sm">
                        {sprint.sprint_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{sprint.team_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {sprint.completed_count}/{sprint.task_count} tasks
                      </span>
                      <span>{sprint.story_points} pts</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p>No sprints yet</p>
                <p className="text-sm mt-1">Tasks will appear here when added to sprints</p>
              </div>
            )}

            {timeline && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-lg font-bold text-green-400">
                      {timeline.completed_sprints}
                    </div>
                    <div className="text-muted-foreground">Completed</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-400">
                      {timeline.current_sprints}
                    </div>
                    <div className="text-muted-foreground">Active</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-muted-foreground">
                      {timeline.planned_sprints}
                    </div>
                    <div className="text-muted-foreground">Planned</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Estimated Completion */}
        {progress?.estimated_completion_date && (
          <div className="mt-6 bg-muted rounded-xl border border-border p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary-400" />
              <div>
                <h3 className="text-foreground font-medium">Estimated Completion</h3>
                <p className="text-muted-foreground text-sm">
                  Based on current velocity, this epic should be completed by{" "}
                  <span className="text-foreground font-medium">
                    {new Date(progress.estimated_completion_date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
