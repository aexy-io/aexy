"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  MoreVertical,
  Check,
  Search,
  Target,
  User,
  Layers,
  LayoutGrid,
  List,
  X,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectBoard } from "@/hooks/useProjectBoard";
import { useEpics } from "@/hooks/useEpics";
import { SprintTask, SprintListItem, TaskPriority, TaskStatus, EpicListItem } from "@/lib/api";
import { CommandPalette } from "@/components/CommandPalette";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge, PremiumCard, Skeleton } from "@/components/ui/premium-card";

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: "Critical", color: "text-red-400", bgColor: "bg-red-900/30" },
  high: { label: "High", color: "text-orange-400", bgColor: "bg-orange-900/30" },
  medium: { label: "Medium", color: "text-yellow-400", bgColor: "bg-yellow-900/30" },
  low: { label: "Low", color: "text-slate-400", bgColor: "bg-slate-700" },
};

interface BacklogItem extends SprintTask {
  sprint_name?: string;
}

interface BacklogItemRowProps {
  task: BacklogItem;
  index: number;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
  onMoveToTodo: (task: BacklogItem) => void;
  onDelete: (task: BacklogItem) => void;
  sprints: SprintListItem[];
}

function BacklogItemRow({
  task,
  index,
  isSelected,
  onSelect,
  onMoveToTodo,
  onDelete,
  sprints,
}: BacklogItemRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[task.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-lg",
        "hover:border-slate-600 hover:bg-slate-800/80 transition-all duration-200",
        isSelected && "ring-2 ring-primary-500/50 border-primary-500/50"
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab active:cursor-grabbing p-1 -ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-slate-500" />
      </div>

      {/* Checkbox */}
      <button
        onClick={() => onSelect(task.id)}
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
          isSelected
            ? "bg-primary-500 border-primary-500"
            : "border-slate-600 hover:border-slate-500"
        )}
      >
        {isSelected && <Check className="h-3 w-3 text-white" />}
      </button>

      {/* Priority */}
      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded font-medium flex-shrink-0",
          priorityConfig.color,
          priorityConfig.bgColor
        )}
      >
        {priorityConfig.label}
      </span>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-white truncate">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {task.description}
          </p>
        )}
        {task.sprint_name && (
          <p className="text-xs text-slate-600 truncate mt-0.5">
            in {task.sprint_name}
          </p>
        )}
      </div>

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {task.labels.slice(0, 2).map((label, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded"
            >
              {label}
            </span>
          ))}
          {task.labels.length > 2 && (
            <span className="text-[10px] text-slate-500">+{task.labels.length - 2}</span>
          )}
        </div>
      )}

      {/* Story Points */}
      {task.story_points && (
        <Badge variant="outline" size="sm" className="flex-shrink-0">
          {task.story_points} SP
        </Badge>
      )}

      {/* Assignee */}
      {task.assignee_id ? (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.assignee_avatar_url ? (
            <Image
              src={task.assignee_avatar_url}
              alt={task.assignee_name || "Assignee"}
              width={24}
              height={24}
              className="rounded-full ring-1 ring-slate-600"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
              <User className="h-3 w-3 text-slate-400" />
            </div>
          )}
        </div>
      ) : (
        <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center flex-shrink-0">
          <User className="h-3 w-3 text-slate-600" />
        </div>
      )}

      {/* Move to Todo */}
      <button
        onClick={() => onMoveToTodo(task)}
        className="flex items-center gap-1 px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs transition-colors flex-shrink-0"
      >
        <Plus className="h-3 w-3" />
        To Do
      </button>

      {/* Menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-full mt-1 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1"
            >
              <button
                onClick={() => {
                  onMoveToTodo(task);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700"
              >
                Move to To Do
              </button>
              <button
                onClick={() => {
                  onDelete(task);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700"
              >
                Delete
              </button>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// Sprint capacity bar component
interface SprintCapacityBarProps {
  sprint: SprintListItem;
  className?: string;
}

function SprintCapacityBar({ sprint, className }: SprintCapacityBarProps) {
  const completionRate = sprint.tasks_count > 0
    ? Math.round((sprint.completed_count / sprint.tasks_count) * 100)
    : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{sprint.total_points} SP committed</span>
        <span className="text-slate-500">{completionRate}% done</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all"
          style={{ width: `${completionRate}%` }}
        />
      </div>
    </div>
  );
}

// Add Backlog Item Modal
interface AddBacklogItemModalProps {
  onClose: () => void;
  onAdd: (data: {
    sprintId: string | null;
    task: {
      title: string;
      description?: string;
      story_points?: number;
      priority: TaskPriority;
      status: TaskStatus;
      epic_id?: string;
    };
  }) => Promise<SprintTask>;
  isAdding: boolean;
  sprints: SprintListItem[];
  epics: EpicListItem[];
}

function AddBacklogItemModal({ onClose, onAdd, isAdding, sprints, epics }: AddBacklogItemModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [epicId, setEpicId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Get default sprint (active or first non-completed)
  const defaultSprint = sprints.find((s) => s.status === "active") ||
    sprints.find((s) => s.status !== "completed") ||
    sprints[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      await onAdd({
        sprintId: sprintId || null, // null means project backlog (no sprint)
        task: {
          title: title.trim(),
          description: description.trim() || undefined,
          story_points: storyPoints ? parseInt(storyPoints) : undefined,
          priority,
          status: "backlog",
          epic_id: epicId || undefined,
        },
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add item";
      setError(errorMessage);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">Add Backlog Item</h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details..."
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 resize-none transition"
              />
            </div>

            {/* Sprint Selection (Optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Sprint <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
              >
                <option value="">Project Backlog (No Sprint)</option>
                {sprints
                  .filter((s) => s.status !== "completed")
                  .map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name} {sprint.status === "active" ? "(Active)" : ""}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Tasks without a sprint go to project backlog
              </p>
            </div>

            {/* Story Points & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Story Points</label>
                <input
                  type="number"
                  min="0"
                  max="21"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Epic */}
            {epics.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Epic (Optional)</label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                >
                  <option value="">No epic</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <div className="relative group">
              <button
                type="submit"
                disabled={isAdding || !title.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAdding ? "Adding..." : "Add to Backlog"}
              </button>
              {!title.trim() && !isAdding && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-700 text-xs text-slate-300 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Enter a title to add item
                </div>
              )}
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function BacklogPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    sprints,
    tasksByStatus,
    isLoading,
    updateTaskStatus,
    addTask,
    isAddingTask,
    deleteTask,
  } = useProjectBoard(currentWorkspaceId, projectId);

  const { epics } = useEpics(currentWorkspaceId);

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // Get backlog items from tasksByStatus
  const backlogItems: BacklogItem[] = useMemo(() => {
    return tasksByStatus.backlog || [];
  }, [tasksByStatus]);

  // Filter backlog items
  const filteredItems = useMemo(() => {
    return backlogItems.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(query) &&
            !item.description?.toLowerCase().includes(query)) {
          return false;
        }
      }
      if (priorityFilter && item.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [backlogItems, searchQuery, priorityFilter]);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedTasks.size === filteredItems.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredItems.map((i) => i.id)));
    }
  }, [filteredItems, selectedTasks.size]);

  const handleMoveToTodo = async (task: BacklogItem) => {
    if (!task.sprint_id) {
      console.error("Cannot move task without sprint - feature coming soon");
      return;
    }
    setIsMoving(true);
    try {
      await updateTaskStatus({
        taskId: task.id,
        sprintId: task.sprint_id,
        status: "todo",
      });
    } catch (error) {
      console.error("Failed to move task:", error);
    } finally {
      setIsMoving(false);
    }
  };

  const handleBulkMoveToTodo = async () => {
    setIsMoving(true);
    try {
      const tasks = backlogItems.filter((t) => selectedTasks.has(t.id) && t.sprint_id);
      for (const task of tasks) {
        if (!task.sprint_id) continue;
        await updateTaskStatus({
          taskId: task.id,
          sprintId: task.sprint_id,
          status: "todo",
        });
      }
      setSelectedTasks(new Set());
    } catch (error) {
      console.error("Failed to move tasks:", error);
    } finally {
      setIsMoving(false);
    }
  };

  const handleDelete = async (task: BacklogItem) => {
    if (!task.sprint_id) {
      console.error("Cannot delete task without sprint - feature coming soon");
      return;
    }
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteTask({
        sprintId: task.sprint_id,
        taskId: task.id,
      });
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  // Stats
  const totalPoints = backlogItems.reduce((sum, i) => sum + (i.story_points || 0), 0);
  const priorityCounts = useMemo(() => {
    const counts: Record<TaskPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    backlogItems.forEach((i) => counts[i.priority]++);
    return counts;
  }, [backlogItems]);

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Active sprint for quick reference
  const activeSprint = sprints?.find((s) => s.status === "active");
  const planningSprints = sprints?.filter((s) => s.status === "planning") || [];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <CommandPalette
        workspaceId={currentWorkspaceId}
        projectId={projectId}
        onCreateTask={() => setShowAddTask(true)}
      />

      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-white">Product Backlog</h1>
                <p className="text-xs text-slate-500">
                  {isLoading ? "Loading..." : `${backlogItems.length} items • ${totalPoints} story points`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "list"
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("board")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "board"
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main backlog list */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Search and filters */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search backlog items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Priority filter */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setPriorityFilter(null)}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    priorityFilter === null
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  All
                </button>
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p === priorityFilter ? null : p)}
                    className={cn(
                      "px-2 py-1 rounded text-xs transition-colors",
                      priorityFilter === p
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    {PRIORITY_CONFIG[p].label}
                    <span className="ml-1 text-slate-500">{priorityCounts[p]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Select all / bulk actions */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                    selectedTasks.size === filteredItems.length && filteredItems.length > 0
                      ? "bg-primary-500 border-primary-500"
                      : "border-slate-600 hover:border-slate-500"
                  )}
                >
                  {selectedTasks.size === filteredItems.length && filteredItems.length > 0 && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </button>
                <span className="text-sm text-slate-400">
                  {selectedTasks.size > 0
                    ? `${selectedTasks.size} selected`
                    : `${filteredItems.length} items`}
                </span>
              </div>

              {selectedTasks.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkMoveToTodo}
                    disabled={isMoving}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                  >
                    {isMoving && <Loader2 className="h-3 w-3 animate-spin" />}
                    Move to To Do
                  </button>
                </div>
              )}
            </div>

            {/* Loading state */}
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                {/* Backlog list */}
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {filteredItems.map((item, index) => (
                      <BacklogItemRow
                        key={item.id}
                        task={item}
                        index={index}
                        isSelected={selectedTasks.has(item.id)}
                        onSelect={toggleSelect}
                        onMoveToTodo={handleMoveToTodo}
                        onDelete={handleDelete}
                        sprints={sprints || []}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {filteredItems.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                      <Target className="h-8 w-8 text-slate-600" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">No items in backlog</h3>
                    <p className="text-slate-500 mb-4">
                      {searchQuery || priorityFilter
                        ? "No items match your filters"
                        : "Add items to your backlog to start planning"}
                    </p>
                    {!searchQuery && !priorityFilter && (
                      <button
                        onClick={() => setShowAddTask(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                      >
                        <Plus className="h-4 w-4" />
                        Add First Item
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Sprint sidebar */}
        <aside className="w-80 border-l border-slate-700 bg-slate-800/30 overflow-y-auto flex-shrink-0 hidden lg:block">
          <div className="p-4">
            <h2 className="text-sm font-medium text-white mb-4">Sprints</h2>

            {/* Active Sprint */}
            {activeSprint && (
              <div className="mb-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Active</div>
                <PremiumCard variant="glass" className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <h3 className="text-sm font-medium text-white truncate">{activeSprint.name}</h3>
                  </div>
                  <SprintCapacityBar sprint={activeSprint} />
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <span>{activeSprint.tasks_count} tasks</span>
                    <Link
                      href={`/sprints/${projectId}/${activeSprint.id}`}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      View board →
                    </Link>
                  </div>
                </PremiumCard>
              </div>
            )}

            {/* Planning Sprints */}
            {planningSprints.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Planning</div>
                <div className="space-y-2">
                  {planningSprints.map((sprint) => (
                    <div
                      key={sprint.id}
                      className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <h3 className="text-sm font-medium text-white truncate">{sprint.name}</h3>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{sprint.tasks_count} tasks • {sprint.total_points} SP</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="mt-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Backlog Stats</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="text-2xl font-bold text-white">{backlogItems.length}</div>
                  <div className="text-xs text-slate-500">Items</div>
                </div>
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="text-2xl font-bold text-white">{totalPoints}</div>
                  <div className="text-xs text-slate-500">Points</div>
                </div>
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="text-2xl font-bold text-red-400">{priorityCounts.critical}</div>
                  <div className="text-xs text-slate-500">Critical</div>
                </div>
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-400">{priorityCounts.high}</div>
                  <div className="text-xs text-slate-500">High</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Add Backlog Item Modal */}
      <AnimatePresence>
        {showAddTask && (
          <AddBacklogItemModal
            onClose={() => setShowAddTask(false)}
            onAdd={addTask}
            isAdding={isAddingTask}
            sprints={sprints}
            epics={epics || []}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
