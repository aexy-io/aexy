"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  User,
  Users,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSprint, useSprintTasks, useSprintAI, useSprintStats } from "@/hooks/useSprints";
import { SprintTask, TaskStatus, TaskPriority, AssignmentSuggestion } from "@/lib/api";
import { redirect } from "next/navigation";

const COLUMN_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog: { label: "Backlog", color: "text-slate-400", bgColor: "bg-slate-700/50" },
  todo: { label: "To Do", color: "text-blue-400", bgColor: "bg-blue-900/20" },
  in_progress: { label: "In Progress", color: "text-amber-400", bgColor: "bg-amber-900/20" },
  review: { label: "Review", color: "text-purple-400", bgColor: "bg-purple-900/20" },
  done: { label: "Done", color: "text-green-400", bgColor: "bg-green-900/20" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-400 bg-red-900/30" },
  high: { label: "High", color: "text-orange-400 bg-orange-900/30" },
  medium: { label: "Medium", color: "text-yellow-400 bg-yellow-900/30" },
  low: { label: "Low", color: "text-slate-400 bg-slate-700" },
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  github_issue: <GitBranch className="h-3 w-3" />,
  jira: <FileText className="h-3 w-3" />,
  linear: <Target className="h-3 w-3" />,
  manual: <FileText className="h-3 w-3" />,
};

interface TaskCardProps {
  task: SprintTask;
  isDragging?: boolean;
  onDelete: (taskId: string) => void;
  onAssign: (taskId: string, developerId: string) => void;
  suggestion?: AssignmentSuggestion;
}

function TaskCard({ task, isDragging, onDelete, suggestion }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[task.priority];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-slate-600 cursor-grab active:cursor-grabbing ${
        suggestion ? "ring-2 ring-primary-500/50" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {task.source_type && SOURCE_ICONS[task.source_type]}
          <span className={`text-xs px-1.5 py-0.5 rounded ${priorityConfig.color}`}>
            {priorityConfig.label}
          </span>
          {task.story_points && (
            <span className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">
              {task.story_points} SP
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
          >
            <MoreVertical className="h-3 w-3" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-32 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                {task.source_url && (
                  <a
                    href={task.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-600 flex items-center gap-2"
                    onClick={() => setShowMenu(false)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Source
                  </a>
                )}
                <button
                  onClick={() => {
                    onDelete(task.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-slate-600 flex items-center gap-2"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <h4 className="text-sm font-medium text-white mb-2 line-clamp-2">{task.title}</h4>

      {task.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>
      )}

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 3).map((label, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded">
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-xs text-slate-500">+{task.labels.length - 3}</span>
          )}
        </div>
      )}

      {/* Assignee */}
      <div className="flex items-center justify-between">
        {task.assignee_id ? (
          <div className="flex items-center gap-2">
            {task.assignee_avatar_url ? (
              <Image
                src={task.assignee_avatar_url}
                alt={task.assignee_name || "Assignee"}
                width={20}
                height={20}
                className="rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
                <User className="h-3 w-3 text-slate-400" />
              </div>
            )}
            <span className="text-xs text-slate-300">{task.assignee_name || "Assigned"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <User className="h-3 w-3" />
            Unassigned
          </div>
        )}

        {suggestion && (
          <div className="flex items-center gap-1 text-xs text-primary-400">
            <Sparkles className="h-3 w-3" />
            AI Suggested
          </div>
        )}
      </div>

      {/* AI Suggestion info */}
      {suggestion && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <p className="text-xs text-slate-400">
            <span className="text-primary-400">Suggestion:</span> {suggestion.suggested_developer_name}
            <span className="text-slate-500 ml-1">
              ({Math.round(suggestion.confidence * 100)}% match)
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{suggestion.reasoning}</p>
        </div>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: SprintTask[];
  onDelete: (taskId: string) => void;
  onAssign: (taskId: string, developerId: string) => void;
  suggestions: AssignmentSuggestion[];
}

function KanbanColumn({ status, tasks, onDelete, onAssign, suggestions }: KanbanColumnProps) {
  const config = COLUMN_CONFIG[status];
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  const getSuggestionForTask = (taskId: string) =>
    suggestions.find((s) => s.task_id === taskId);

  return (
    <div className={`flex-1 min-w-[280px] ${config.bgColor} rounded-xl p-3`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className={`font-medium ${config.color}`}>{config.label}</h3>
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-slate-400">{totalPoints} SP</span>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={onDelete}
              onAssign={onAssign}
              suggestion={getSuggestionForTask(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description?: string;
    story_points?: number;
    priority?: TaskPriority;
    status?: TaskStatus;
  }) => Promise<unknown>;
  isAdding: boolean;
}

function AddTaskModal({ onClose, onAdd, isAdding }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Task title is required");
      return;
    }

    try {
      await onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        story_points: storyPoints ? parseInt(storyPoints) : undefined,
        priority,
        status,
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add task";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Add Task</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description"
                rows={3}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Story Points</label>
                <input
                  type="number"
                  min="0"
                  max="21"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                {Object.entries(COLUMN_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
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
              disabled={isAdding}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {isAdding ? "Adding..." : "Add Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SprintBoardPage({
  params,
}: {
  params: { teamId: string; sprintId: string };
}) {
  const { teamId, sprintId } = params;

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    sprint,
    isLoading: sprintLoading,
    startSprint,
    startReview,
    startRetrospective,
    completeSprint,
    isStarting,
  } = useSprint(currentWorkspaceId, teamId, sprintId);

  const {
    tasks,
    isLoading: tasksLoading,
    addTask,
    deleteTask,
    updateTaskStatus,
    assignTask,
    isAddingTask,
    isUpdatingStatus,
  } = useSprintTasks(sprintId);

  const { stats, refetch: refetchStats } = useSprintStats(currentWorkspaceId, teamId, sprintId);

  const {
    suggestAssignments,
    isSuggesting,
    suggestions,
  } = useSprintAI(sprintId);

  const [showAddTask, setShowAddTask] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, SprintTask[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    tasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    return grouped;
  }, [tasks]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId),
    [tasks, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine target status from where it was dropped
    let targetStatus: TaskStatus | null = null;
    for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
      if (statusTasks.some((t) => t.id === over.id) || over.id === status) {
        targetStatus = status as TaskStatus;
        break;
      }
    }

    if (targetStatus && targetStatus !== task.status) {
      try {
        await updateTaskStatus({ taskId, status: targetStatus });
        refetchStats();
      } catch (error) {
        console.error("Failed to update task status:", error);
      }
    }
  };

  const handleDelete = async (taskId: string) => {
    if (confirm("Remove this task from the sprint?")) {
      try {
        await deleteTask(taskId);
        refetchStats();
      } catch (error) {
        console.error("Failed to delete task:", error);
      }
    }
  };

  const handleAssign = async (taskId: string, developerId: string) => {
    try {
      await assignTask({ taskId, developerId });
    } catch (error) {
      console.error("Failed to assign task:", error);
    }
  };

  const handleLifecycleAction = async (action: "start" | "review" | "retro" | "complete") => {
    try {
      switch (action) {
        case "start":
          await startSprint();
          break;
        case "review":
          await startReview();
          break;
        case "retro":
          await startRetrospective();
          break;
        case "complete":
          await completeSprint();
          break;
      }
    } catch (error) {
      console.error(`Failed to ${action} sprint:`, error);
    }
  };

  const handleSuggestAssignments = async () => {
    try {
      await suggestAssignments();
    } catch (error) {
      console.error("Failed to get suggestions:", error);
    }
  };

  if (authLoading || currentWorkspaceLoading || sprintLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading sprint...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!sprint) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-white mb-2">Sprint Not Found</h2>
          <Link href={`/sprints/${teamId}`} className="text-primary-400 hover:underline">
            Back to sprints
          </Link>
        </div>
      </div>
    );
  }

  const completionRate = stats
    ? Math.round((stats.completed_tasks / Math.max(stats.total_tasks, 1)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${teamId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-white">{sprint.name}</h1>
                {sprint.goal && (
                  <p className="text-slate-400 text-sm">{sprint.goal}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sprint Info */}
              <div className="flex items-center gap-4 mr-4 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {sprint.start_date
                      ? new Date(sprint.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "TBD"}{" "}
                    -{" "}
                    {sprint.end_date
                      ? new Date(sprint.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "TBD"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span>{completionRate}% complete</span>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>

              <button
                onClick={handleSuggestAssignments}
                disabled={isSuggesting}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm disabled:opacity-50"
              >
                {isSuggesting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI Suggest
              </button>

              <Link
                href={`/sprints/${teamId}/${sprintId}/analytics`}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>

              {/* Lifecycle Action */}
              {sprint.status === "planning" && (
                <button
                  onClick={() => handleLifecycleAction("start")}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm"
                >
                  <Play className="h-4 w-4" />
                  Start Sprint
                </button>
              )}
              {sprint.status === "active" && (
                <button
                  onClick={() => handleLifecycleAction("review")}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition text-sm"
                >
                  Start Review
                </button>
              )}
              {sprint.status === "review" && (
                <button
                  onClick={() => handleLifecycleAction("retro")}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
                >
                  Start Retro
                </button>
              )}
              {sprint.status === "retrospective" && (
                <button
                  onClick={() => handleLifecycleAction("complete")}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
                >
                  Complete Sprint
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sprint Stats Bar */}
      {stats && (
        <div className="border-b border-slate-700 bg-slate-800/30">
          <div className="max-w-[1600px] mx-auto px-4 py-3">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Tasks:</span>
                <span className="text-white font-medium">{stats.total_tasks}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Completed:</span>
                <span className="text-green-400 font-medium">{stats.completed_tasks}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">In Progress:</span>
                <span className="text-amber-400 font-medium">{stats.in_progress_tasks}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Total Points:</span>
                <span className="text-white font-medium">{stats.total_points}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Completed Points:</span>
                <span className="text-green-400 font-medium">{stats.completed_points}</span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 max-w-xs">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {tasksLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {(Object.keys(COLUMN_CONFIG) as TaskStatus[]).map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onDelete={handleDelete}
                  onAssign={handleAssign}
                  suggestions={suggestions || []}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  isDragging
                  onDelete={() => {}}
                  onAssign={() => {}}
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Add Task Modal */}
      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onAdd={addTask}
          isAdding={isAddingTask}
        />
      )}
    </div>
  );
}
