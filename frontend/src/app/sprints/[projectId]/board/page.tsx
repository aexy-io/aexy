"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  LayoutGrid,
  Columns3,
  Plus,
  Settings2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCw,
  MoreVertical,
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
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectBoard, BoardViewMode, useBoardSelection } from "@/hooks/useProjectBoard";
import { useEpics } from "@/hooks/useEpics";
import { SprintTask, TaskStatus, TaskPriority, SprintListItem, EpicListItem } from "@/lib/api";
import { TaskCardPremium, TaskCardSkeleton } from "@/components/planning/TaskCardPremium";
import { FilterBar } from "@/components/planning/FilterBar";
import { CommandPalette } from "@/components/CommandPalette";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge, PremiumCard, Skeleton } from "@/components/ui/premium-card";
import { X, Loader2 } from "lucide-react";

// Status column configuration
const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog: { label: "Backlog", color: "text-slate-400", bgColor: "bg-slate-700/30" },
  todo: { label: "To Do", color: "text-blue-400", bgColor: "bg-blue-900/20" },
  in_progress: { label: "In Progress", color: "text-amber-400", bgColor: "bg-amber-900/20" },
  review: { label: "Review", color: "text-purple-400", bgColor: "bg-purple-900/20" },
  done: { label: "Done", color: "text-green-400", bgColor: "bg-green-900/20" },
};

// Sprint status colors
const SPRINT_STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  review: "bg-amber-500",
  retrospective: "bg-purple-500",
  completed: "bg-slate-500",
};

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  bgColor: string;
  tasks: (SprintTask & { sprint_name?: string })[];
  onTaskClick: (task: SprintTask) => void;
  onDeleteTask: (taskId: string) => void;
  showSprintBadge?: boolean;
  isOver?: boolean;
  onSelect?: (taskId: string) => void;
  isSelected?: (taskId: string) => boolean;
}

function KanbanColumn({
  id,
  title,
  color,
  bgColor,
  tasks,
  onTaskClick,
  onDeleteTask,
  showSprintBadge,
  isOver,
  onSelect,
  isSelected,
}: KanbanColumnProps) {
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  return (
    <div
      className={cn(
        "flex-shrink-0 w-[300px] rounded-xl transition-all duration-200",
        bgColor,
        isOver && "ring-2 ring-primary-500/50"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-medium text-sm", color)}>{title}</h3>
          <Badge variant="default" size="sm">
            {tasks.length}
          </Badge>
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-slate-500">{totalPoints} SP</span>
        )}
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 min-h-[200px]" data-column-id={id}>
          <AnimatePresence mode="popLayout">
            {tasks.map((task, index) => (
              <TaskCardPremium
                key={task.id}
                task={task}
                onClick={onTaskClick}
                onDelete={onDeleteTask}
                showSprintBadge={showSprintBadge}
                onSelect={onSelect}
                isSelected={isSelected?.(task.id)}
              />
            ))}
          </AnimatePresence>
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

// Sprint column for sprint view
interface SprintColumnProps {
  sprint: SprintListItem;
  tasks: (SprintTask & { sprint_name?: string })[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTaskClick: (task: SprintTask) => void;
  onDeleteTask: (taskId: string) => void;
  isOver?: boolean;
  onSelect?: (taskId: string) => void;
  isSelected?: (taskId: string) => boolean;
}

function SprintColumn({
  sprint,
  tasks,
  isCollapsed,
  onToggleCollapse,
  onTaskClick,
  onDeleteTask,
  isOver,
  onSelect,
  isSelected,
}: SprintColumnProps) {
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-xl bg-slate-800/50 border border-slate-700/50 transition-all duration-200",
        isCollapsed ? "w-[60px]" : "w-[320px]",
        isOver && "ring-2 ring-primary-500/50"
      )}
    >
      {/* Sprint header */}
      <div
        className={cn(
          "flex items-center gap-2 p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-colors",
          isCollapsed && "justify-center"
        )}
        onClick={onToggleCollapse}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span
              className="text-xs font-medium text-white writing-mode-vertical transform rotate-180"
              style={{ writingMode: "vertical-rl" }}
            >
              {sprint.name}
            </span>
            <Badge variant="default" size="sm">
              {tasks.length}
            </Badge>
          </div>
        ) : (
          <>
            <ChevronDown className="h-4 w-4 text-slate-400" />
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                SPRINT_STATUS_COLORS[sprint.status]
              )}
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm text-white truncate">{sprint.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 capitalize">{sprint.status}</span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-500">{completionRate}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="default" size="sm">
                {tasks.length}
              </Badge>
              {totalPoints > 0 && (
                <span className="text-slate-500">{totalPoints} SP</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tasks */}
      {!isCollapsed && (
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto" data-column-id={sprint.id}>
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <TaskCardPremium
                  key={task.id}
                  task={task}
                  onClick={onTaskClick}
                  onDelete={onDeleteTask}
                  showSprintBadge={false}
                  onSelect={onSelect}
                  isSelected={isSelected?.(task.id)}
                />
              ))}
            </AnimatePresence>
            {tasks.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No tasks
              </div>
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// Priority configuration for the modal
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-400" },
  high: { label: "High", color: "text-orange-400" },
  medium: { label: "Medium", color: "text-yellow-400" },
  low: { label: "Low", color: "text-blue-400" },
};

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (data: {
    sprintId: string;
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
  defaultStatus?: TaskStatus;
}

function AddTaskModal({ onClose, onAdd, isAdding, sprints, epics, defaultStatus = "todo" }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [epicId, setEpicId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>(
    sprints.find((s) => s.status === "active")?.id || sprints[0]?.id || ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Task title is required");
      return;
    }

    if (!sprintId) {
      setError("Please select a sprint");
      return;
    }

    try {
      await onAdd({
        sprintId,
        task: {
          title: title.trim(),
          description: description.trim() || undefined,
          story_points: storyPoints ? parseInt(storyPoints) : undefined,
          priority,
          status,
          epic_id: epicId || undefined,
        },
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add task";
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
          <h3 className="text-xl font-semibold text-white">Create Task</h3>
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

            {/* Sprint Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Sprint</label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
              >
                <option value="">Select a sprint</option>
                {sprints
                  .filter((s) => s.status !== "completed")
                  .map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name} {sprint.status === "active" ? "(Active)" : ""}
                    </option>
                  ))}
              </select>
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

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
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
            <button
              type="submit"
              disabled={isAdding || !title.trim() || !sprintId}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAdding ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function ProjectBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;
  const router = useRouter();

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    sprints,
    filteredTasks,
    tasksBySprint,
    tasksByStatus,
    filterOptions,
    isLoading,
    viewMode,
    setViewMode,
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters,
    moveTask,
    isMovingTask,
    updateTaskStatus,
    addTask,
    isAddingTask,
    deleteTask,
  } = useProjectBoard(currentWorkspaceId, projectId);

  const {
    selectedTasks,
    selectedCount,
    toggleTask,
    selectAll,
    clearSelection,
    isSelected,
    hasSelection,
  } = useBoardSelection();

  const { epics } = useEpics(currentWorkspaceId);

  const [selectedTask, setSelectedTask] = useState<SprintTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const toggleSprintCollapse = useCallback((sprintId: string) => {
    setCollapsedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
      }
      return next;
    });
  }, []);

  // Find the active task being dragged
  const activeTask = useMemo(
    () => filteredTasks.find((t) => t.id === activeId),
    [filteredTasks, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const taskId = active.id as string;
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = over.id as string;

    if (viewMode === "sprint") {
      // Moving between sprints
      const targetSprintId = overId;
      const targetSprint = sprints.find((s) => s.id === targetSprintId);

      if (targetSprint && targetSprintId !== task.sprint_id) {
        try {
          await moveTask({
            taskId,
            fromSprintId: task.sprint_id,
            toSprintId: targetSprintId,
          });
        } catch (error) {
          console.error("Failed to move task:", error);
        }
      }
    } else {
      // Changing status
      const statusKeys: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];
      const targetStatus = statusKeys.find((s) => overId === s || tasksByStatus[s]?.some((t) => t.id === overId));

      if (targetStatus && targetStatus !== task.status) {
        try {
          await updateTaskStatus({
            taskId,
            sprintId: task.sprint_id,
            status: targetStatus,
          });
        } catch (error) {
          console.error("Failed to update status:", error);
        }
      }
    }
  };

  const handleTaskClick = (task: SprintTask) => {
    // Navigate to task detail or open modal
    setSelectedTask(task);
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) return;

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

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Command Palette */}
      <CommandPalette
        workspaceId={currentWorkspaceId}
        projectId={projectId}
        onCreateTask={() => setShowAddTask(true)}
      />

      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-white">Project Board</h1>
                <p className="text-xs text-slate-500">
                  {filteredTasks.length} tasks across {sprints.length} sprints
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("sprint")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all",
                    viewMode === "sprint"
                      ? "bg-primary-500 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <Columns3 className="h-4 w-4" />
                  Sprints
                </button>
                <button
                  onClick={() => setViewMode("status")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all",
                    viewMode === "status"
                      ? "bg-primary-500 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Status
                </button>
              </div>

              {/* Add Task */}
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>

              {/* Settings */}
              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                <Settings2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-3">
            <FilterBar
              filters={filters}
              onFilterChange={updateFilters}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              filterOptions={filterOptions}
            />
          </div>
        </div>
      </header>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {hasSelection && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-slate-700 bg-primary-900/30 overflow-hidden"
          >
            <div className="max-w-[1800px] mx-auto px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-white">
                  {selectedCount} task{selectedCount > 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={clearSelection}
                  className="text-sm text-slate-400 hover:text-white transition"
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                  Move to Sprint
                </button>
                <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                  Change Status
                </button>
                <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                  Assign
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Board Content */}
      <main className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex gap-4 p-4 overflow-x-auto">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[300px] bg-slate-800/30 rounded-xl p-3"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton variant="text" className="h-5 w-24" />
                  <Skeleton variant="text" className="h-5 w-8" />
                </div>
                <div className="space-y-2">
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-4 overflow-x-auto h-full">
              {viewMode === "sprint" ? (
                // Sprint View - columns are sprints
                <>
                  {sprints
                    .filter((s) => s.status !== "completed")
                    .sort((a, b) => {
                      // Sort: active first, then planning, then others
                      const order = { active: 0, planning: 1, review: 2, retrospective: 3 };
                      return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
                    })
                    .map((sprint) => (
                      <SprintColumn
                        key={sprint.id}
                        sprint={sprint}
                        tasks={tasksBySprint[sprint.id] || []}
                        isCollapsed={collapsedSprints.has(sprint.id)}
                        onToggleCollapse={() => toggleSprintCollapse(sprint.id)}
                        onTaskClick={handleTaskClick}
                        onDeleteTask={handleDeleteTask}
                        isOver={overId === sprint.id}
                        onSelect={toggleTask}
                        isSelected={isSelected}
                      />
                    ))}

                  {/* Completed sprints section (collapsed by default) */}
                  {sprints.filter((s) => s.status === "completed").length > 0 && (
                    <div className="flex-shrink-0 w-[60px] rounded-xl bg-slate-800/30 border border-slate-700/50 p-2">
                      <div className="flex flex-col items-center gap-2">
                        <span
                          className="text-xs font-medium text-slate-500 writing-mode-vertical"
                          style={{ writingMode: "vertical-rl" }}
                        >
                          Completed ({sprints.filter((s) => s.status === "completed").length})
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // Status View - columns are statuses
                (Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => (
                  <KanbanColumn
                    key={status}
                    id={status}
                    title={STATUS_CONFIG[status].label}
                    color={STATUS_CONFIG[status].color}
                    bgColor={STATUS_CONFIG[status].bgColor}
                    tasks={tasksByStatus[status] || []}
                    onTaskClick={handleTaskClick}
                    onDeleteTask={handleDeleteTask}
                    showSprintBadge={true}
                    isOver={overId === status}
                    onSelect={toggleTask}
                    isSelected={isSelected}
                  />
                ))
              )}
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeTask && (
                <div className="opacity-90 rotate-2">
                  <TaskCardPremium
                    task={activeTask}
                    isDragging
                    onClick={() => {}}
                    showSprintBadge={viewMode === "status"}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Keyboard shortcuts hint */}
      <div className="flex-shrink-0 border-t border-slate-700 bg-slate-800/30 px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">⌘K</kbd> Search
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">C</kbd> Create task
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">Shift+Click</kbd> Select
            </span>
          </div>
          <div>
            <span>Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">?</kbd> for all shortcuts</span>
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAddTask && (
          <AddTaskModal
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
