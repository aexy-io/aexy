"use client";

import { useState, useMemo, useCallback, useRef } from "react";
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
  Check,
  User,
  UserX,
  Download,
  FileSpreadsheet,
  FileJson,
  FileType,
  Keyboard,
  Command,
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
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useProjectBoard, BoardViewMode, useBoardSelection } from "@/hooks/useProjectBoard";
import { useEpics } from "@/hooks/useEpics";
import { SprintTask, TaskStatus, TaskPriority, SprintListItem, EpicListItem, sprintApi, TaskTemplate, taskTemplatesApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { TaskCardPremium, TaskCardSkeleton } from "@/components/planning/TaskCardPremium";
import { FilterBar } from "@/components/planning/FilterBar";
import { CommandPalette } from "@/components/CommandPalette";
import { TaskDescriptionEditor, TaskDescriptionEditorRef, MentionUser } from "@/components/planning/TaskDescriptionEditor";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge, PremiumCard, Skeleton } from "@/components/ui/premium-card";
import { X, Loader2, FileText, Zap } from "lucide-react";

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
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
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
  onStatusChange,
  showSprintBadge,
  isOver,
  onSelect,
  isSelected,
}: KanbanColumnProps) {
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  // Make the column a droppable target
  const { setNodeRef, isOver: isDropOver } = useDroppable({
    id: id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[300px] rounded-xl transition-all duration-200",
        bgColor,
        (isOver || isDropOver) && "ring-2 ring-primary-500/50 bg-primary-900/20"
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
                onStatusChange={onStatusChange}
                showSprintBadge={showSprintBadge}
                onSelect={onSelect}
                isSelected={isSelected?.(task.id)}
              />
            ))}
          </AnimatePresence>
          {tasks.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Drop tasks here
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

  // Make the sprint column a droppable target
  const { setNodeRef, isOver: isDropOver } = useDroppable({
    id: sprint.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 rounded-xl bg-slate-800/50 border border-slate-700/50 transition-all duration-200",
        isCollapsed ? "w-[60px]" : "w-[320px]",
        (isOver || isDropOver) && "ring-2 ring-primary-500/50 bg-primary-900/20"
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

// Keyboard Shortcuts Modal
interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const KEYBOARD_SHORTCUTS = [
  { category: "Navigation", shortcuts: [
    { keys: ["?"], description: "Show keyboard shortcuts" },
    { keys: ["Esc"], description: "Close modal / Cancel" },
    { keys: ["g", "b"], description: "Go to Board" },
    { keys: ["g", "l"], description: "Go to Backlog" },
    { keys: ["g", "r"], description: "Go to Roadmap" },
  ]},
  { category: "Task Actions", shortcuts: [
    { keys: ["n"], description: "Create new task" },
    { keys: ["e"], description: "Edit selected task" },
    { keys: ["Enter"], description: "Open task details" },
    { keys: ["Delete"], description: "Delete selected task" },
  ]},
  { category: "Selection", shortcuts: [
    { keys: ["Click"], description: "Select task" },
    { keys: ["Shift", "Click"], description: "Multi-select tasks" },
    { keys: ["⌘", "a"], description: "Select all visible tasks" },
    { keys: ["Esc"], description: "Clear selection" },
  ]},
  { category: "Quick Status", shortcuts: [
    { keys: ["1"], description: "Set status to Backlog" },
    { keys: ["2"], description: "Set status to To Do" },
    { keys: ["3"], description: "Set status to In Progress" },
    { keys: ["4"], description: "Set status to Review" },
    { keys: ["5"], description: "Set status to Done" },
  ]},
  { category: "View", shortcuts: [
    { keys: ["v", "s"], description: "Switch to Sprint view" },
    { keys: ["v", "b"], description: "Switch to Status (Board) view" },
    { keys: ["f"], description: "Focus search / filters" },
  ]},
];

function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Keyboard className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Keyboard Shortcuts</h3>
              <p className="text-sm text-slate-400">Navigate faster with these shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-2 gap-6">
            {KEYBOARD_SHORTCUTS.map((section) => (
              <div key={section.category}>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <Command className="h-3.5 w-3.5" />
                  {section.category}
                </h4>
                <div className="space-y-2">
                  {section.shortcuts.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-slate-400">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx}>
                            <kbd className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-xs text-slate-300 font-mono shadow-sm">
                              {key}
                            </kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="text-slate-600 mx-0.5">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/80">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Press <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs">?</kbd> anytime to show this panel
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Need to import React for useEffect
import React from "react";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (data: {
    sprintId: string | null;
    task: {
      title: string;
      description?: string;
      description_json?: Record<string, unknown>;
      story_points?: number;
      priority: TaskPriority;
      status: TaskStatus;
      epic_id?: string;
      assignee_id?: string;
      mentioned_user_ids?: string[];
      mentioned_file_paths?: string[];
    };
  }) => Promise<SprintTask>;
  isAdding: boolean;
  sprints: SprintListItem[];
  epics: EpicListItem[];
  defaultStatus?: TaskStatus;
  users?: MentionUser[];
  templates?: TaskTemplate[];
  workspaceId?: string;
}

function AddTaskModal({ onClose, onAdd, isAdding, sprints, epics, defaultStatus = "todo", users = [], templates = [], workspaceId }: AddTaskModalProps) {
  const [mode, setMode] = useState<"select" | "form">(templates.length > 0 ? "select" : "form");
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [descriptionJson, setDescriptionJson] = useState<Record<string, unknown> | null>(null);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionedFilePaths, setMentionedFilePaths] = useState<string[]>([]);
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [epicId, setEpicId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<TaskDescriptionEditorRef>(null);

  // Apply template when selected
  const applyTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    setTitle(template.title_template);
    setPriority(template.default_priority as TaskPriority);
    if (template.default_story_points !== null) {
      setStoryPoints(template.default_story_points.toString());
    }
    setMode("form");
  };

  // Get default sprint (active or first non-completed)
  const defaultSprint = sprints.find((s) => s.status === "active") ||
    sprints.find((s) => s.status !== "completed") ||
    sprints[0];

  const handleDescriptionChange = useCallback((content: Record<string, unknown>, mentions: { user_ids: string[]; file_paths: string[] }) => {
    setDescriptionJson(content);
    setMentionedUserIds(mentions.user_ids);
    setMentionedFilePaths(mentions.file_paths);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Task title is required");
      return;
    }

    // Get plain text description from JSON for backwards compatibility
    const plainDescription = descriptionJson
      ? extractPlainText(descriptionJson)
      : undefined;

    try {
      await onAdd({
        sprintId: sprintId || null, // null means project backlog (no sprint)
        task: {
          title: title.trim(),
          description: plainDescription,
          description_json: descriptionJson || undefined,
          story_points: storyPoints ? parseInt(storyPoints) : undefined,
          priority,
          status,
          epic_id: epicId || undefined,
          assignee_id: assigneeId || undefined,
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          mentioned_file_paths: mentionedFilePaths.length > 0 ? mentionedFilePaths : undefined,
        },
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add task";
      setError(errorMessage);
    }
  };

  // Extract plain text from TipTap JSON
  function extractPlainText(doc: Record<string, unknown>): string {
    let text = "";
    const traverse = (node: any) => {
      if (node?.type === "text" && node.text) {
        text += node.text;
      }
      if (node?.type === "paragraph" || node?.type === "heading") {
        text += "\n";
      }
      if (node?.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    };
    traverse(doc);
    return text.trim();
  }

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
          <h3 className="text-xl font-semibold text-white">
            {mode === "select" ? "Create Task" : selectedTemplate ? `New Task from "${selectedTemplate.name}"` : "Create Task"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Template Selection Mode */}
        {mode === "select" && (
          <div className="space-y-4">
            {/* Start from scratch option */}
            <button
              type="button"
              onClick={() => setMode("form")}
              className="w-full flex items-center gap-3 p-4 bg-slate-900/50 hover:bg-slate-700/50 border border-slate-700 hover:border-primary-500/50 rounded-xl transition text-left group"
            >
              <div className="p-2 bg-primary-500/20 rounded-lg group-hover:bg-primary-500/30 transition">
                <Plus className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <span className="text-white font-medium">Start from scratch</span>
                <p className="text-sm text-slate-400">Create a blank task</p>
              </div>
            </button>

            {/* Templates */}
            {templates.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
                  <Zap className="h-3.5 w-3.5" />
                  Templates
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {templates.filter(t => t.is_active).map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-900/30 hover:bg-slate-700/50 border border-slate-700/50 hover:border-primary-500/50 rounded-lg transition text-left group"
                    >
                      <div className="p-1.5 bg-slate-700/50 rounded group-hover:bg-slate-600/50 transition">
                        <FileText className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium truncate block">{template.name}</span>
                        {template.description && (
                          <p className="text-xs text-slate-500 truncate">{template.description}</p>
                        )}
                      </div>
                      {template.category && (
                        <Badge variant="default" size="sm" className="shrink-0">
                          {template.category}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Task Form Mode */}
        {mode === "form" && (
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

            {/* Description with rich text and mentions */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Description
                <span className="text-xs text-slate-500 font-normal ml-2">
                  Use @ to mention users
                </span>
              </label>
              <TaskDescriptionEditor
                ref={editorRef}
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Add more details... Use @ to mention team members"
                users={users}
                minHeight="80px"
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

            {/* Status & Assignee */}
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                >
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
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
          <div className="flex justify-between gap-3 mt-6">
            <div>
              {templates.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("select");
                    setSelectedTemplate(null);
                    setTitle("");
                    setPriority("medium");
                    setStoryPoints("");
                  }}
                  className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition text-sm"
                >
                  ← Back to templates
                </button>
              )}
            </div>
            <div className="flex gap-3">
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
                  {isAdding ? "Creating..." : "Create Task"}
                </button>
                {!title.trim() && !isAdding && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-700 text-xs text-slate-300 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Enter a task title to create
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
        )}
      </motion.div>
    </motion.div>
  );
}

// Edit Task Modal - Trello-like task detail view
interface EditTaskModalProps {
  task: SprintTask;
  onClose: () => void;
  onUpdate: (data: {
    taskId: string;
    sprintId: string | null;
    updates: {
      title?: string;
      description?: string;
      description_json?: Record<string, unknown>;
      story_points?: number;
      priority?: TaskPriority;
      status?: TaskStatus;
      labels?: string[];
      epic_id?: string | null;
      assignee_id?: string | null;
      mentioned_user_ids?: string[];
      mentioned_file_paths?: string[];
    };
  }) => Promise<SprintTask>;
  onDelete: (data: { sprintId: string | null; taskId: string }) => Promise<void>;
  isUpdating: boolean;
  sprints: SprintListItem[];
  epics: EpicListItem[];
  users: MentionUser[];
}

function EditTaskModal({ task, onClose, onUpdate, onDelete, isUpdating, sprints, epics, users }: EditTaskModalProps) {
  const [title, setTitle] = useState(task.title);
  const [descriptionJson, setDescriptionJson] = useState<Record<string, unknown> | null>(
    (task as any).description_json || null
  );
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>(
    (task as any).mentioned_user_ids || []
  );
  const [mentionedFilePaths, setMentionedFilePaths] = useState<string[]>(
    (task as any).mentioned_file_paths || []
  );
  const [storyPoints, setStoryPoints] = useState(task.story_points?.toString() || "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [epicId, setEpicId] = useState<string>(task.epic_id || "");
  const [sprintId, setSprintId] = useState<string>(task.sprint_id || "");
  const [assigneeId, setAssigneeId] = useState<string>(task.assignee_id || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editorRef = useRef<TaskDescriptionEditorRef>(null);

  const handleDescriptionChange = useCallback((content: Record<string, unknown>, mentions: { user_ids: string[]; file_paths: string[] }) => {
    setDescriptionJson(content);
    setMentionedUserIds(mentions.user_ids);
    setMentionedFilePaths(mentions.file_paths);
  }, []);

  // Extract plain text from TipTap JSON
  function extractPlainText(doc: Record<string, unknown>): string {
    let text = "";
    const traverse = (node: any) => {
      if (node?.type === "text" && node.text) {
        text += node.text;
      }
      if (node?.type === "paragraph" || node?.type === "heading") {
        text += "\n";
      }
      if (node?.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    };
    traverse(doc);
    return text.trim();
  }

  const hasChanges =
    title !== task.title ||
    JSON.stringify(descriptionJson) !== JSON.stringify((task as any).description_json || null) ||
    storyPoints !== (task.story_points?.toString() || "") ||
    priority !== task.priority ||
    status !== task.status ||
    epicId !== (task.epic_id || "") ||
    sprintId !== (task.sprint_id || "") ||
    assigneeId !== (task.assignee_id || "");

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    const plainDescription = descriptionJson ? extractPlainText(descriptionJson) : undefined;

    try {
      await onUpdate({
        taskId: task.id,
        sprintId: task.sprint_id || null,
        updates: {
          title: title.trim(),
          description: plainDescription,
          description_json: descriptionJson || undefined,
          story_points: storyPoints ? parseInt(storyPoints) : undefined,
          priority,
          status,
          epic_id: epicId || null,
          assignee_id: assigneeId || null,
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          mentioned_file_paths: mentionedFilePaths.length > 0 ? mentionedFilePaths : undefined,
        },
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update task";
      setError(errorMessage);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete({
        sprintId: task.sprint_id || null,
        taskId: task.id,
      });
      onClose();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleQuickStatusChange = async (newStatus: TaskStatus) => {
    try {
      await onUpdate({
        taskId: task.id,
        sprintId: task.sprint_id || null,
        updates: { status: newStatus },
      });
      setStatus(newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-700">
          <div className="flex-1 mr-4">
            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                autoFocus
                className="w-full text-xl font-semibold bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-primary-500"
              />
            ) : (
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="text-xl font-semibold text-white cursor-pointer hover:bg-slate-700/50 rounded px-2 py-1 -mx-2"
              >
                {title}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-400">
              {task.sprint_id ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {sprints.find(s => s.id === task.sprint_id)?.name || "Sprint"}
                </span>
              ) : (
                <span className="text-slate-500">Project Backlog</span>
              )}
              <span>•</span>
              <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex">
          {/* Main content */}
          <div className="flex-1 p-4 space-y-4">
            {/* Quick status buttons */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Status</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleQuickStatusChange(s)}
                    disabled={isUpdating}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      status === s
                        ? `${STATUS_CONFIG[s].bgColor} ${STATUS_CONFIG[s].color} ring-2 ring-offset-2 ring-offset-slate-800 ring-current`
                        : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white"
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description with mentions */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                Description
                <span className="text-slate-500 font-normal ml-2">Use @ to mention</span>
              </label>
              <TaskDescriptionEditor
                ref={editorRef}
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Add more details... Use @ to mention team members"
                users={users}
                minHeight="100px"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-48 border-l border-slate-700 p-4 space-y-4 bg-slate-800/50">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-2 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
              >
                {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            {/* Story Points */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Story Points</label>
              <input
                type="number"
                min="0"
                max="21"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Sprint */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Sprint</label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">No Sprint</option>
                {sprints.filter(s => s.status !== "completed").map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Epic */}
            {epics.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Epic</label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">No Epic</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>{epic.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            {/* Delete button */}
            <div className="pt-4 border-t border-slate-700">
              {showDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-400">Delete this task?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-2 py-1.5 text-red-400 hover:bg-red-500/10 rounded text-sm transition"
                >
                  Delete Task
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        {hasChanges && (
          <div className="flex justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/80">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 transition"
            >
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isUpdating ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
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
    updateTask,
    isUpdatingTask,
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
  const { members } = useWorkspaceMembers(currentWorkspaceId);

  // Fetch task templates for the workspace
  const { data: templatesData } = useQuery({
    queryKey: ["taskTemplates", currentWorkspaceId],
    queryFn: () => taskTemplatesApi.list(currentWorkspaceId!, { is_active: true, limit: 50 }),
    enabled: !!currentWorkspaceId,
  });
  const templates = templatesData?.items || [];

  // Convert members to MentionUser format
  const mentionUsers: MentionUser[] = useMemo(() => {
    return (members || [])
      .filter((m) => m.status === "active") // Only show active members
      .map((m) => ({
        id: m.developer_id,
        name: m.developer_name || m.developer_email?.split("@")[0] || "Unknown",
        avatar_url: m.developer_avatar_url || undefined,
      }));
  }, [members]);

  const [selectedTask, setSelectedTask] = useState<SprintTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [overId, setOverId] = useState<string | null>(null);

  // Bulk action dropdown state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showSprintDropdown, setShowSprintDropdown] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const queryClient = useQueryClient();

  // Get the first selected task's sprint ID for bulk operations
  const getSourceSprintId = useCallback(() => {
    const firstTaskId = Array.from(selectedTasks)[0];
    const firstTask = filteredTasks.find((t) => t.id === firstTaskId);
    return firstTask?.sprint_id || null;
  }, [selectedTasks, filteredTasks]);

  // Bulk status update mutation
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: TaskStatus }) => {
      const sprintId = getSourceSprintId();
      if (!sprintId) {
        throw new Error("No sprint ID found for selected tasks");
      }
      return sprintApi.bulkUpdateStatus(sprintId, Array.from(selectedTasks), status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", currentWorkspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      clearSelection();
      setShowStatusDropdown(false);
    },
  });

  // Bulk move to sprint mutation
  const bulkMoveMutation = useMutation({
    mutationFn: async ({ targetSprintId }: { targetSprintId: string }) => {
      const sprintId = getSourceSprintId();
      if (!sprintId) {
        throw new Error("No sprint ID found for selected tasks");
      }
      return sprintApi.bulkMoveTasks(sprintId, Array.from(selectedTasks), targetSprintId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", currentWorkspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
      clearSelection();
      setShowSprintDropdown(false);
    },
  });

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ developerId }: { developerId: string | null }) => {
      const sprintId = getSourceSprintId();
      if (!sprintId) {
        throw new Error("No sprint ID found for selected tasks");
      }
      if (developerId) {
        const assignments = Array.from(selectedTasks).map((taskId) => ({
          task_id: taskId,
          developer_id: developerId,
        }));
        return sprintApi.bulkAssignTasks(sprintId, assignments);
      }
      // Unassign: update each task individually
      return Promise.all(
        Array.from(selectedTasks).map((taskId) =>
          sprintApi.unassignTask(sprintId, taskId)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", currentWorkspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      clearSelection();
      setShowAssignDropdown(false);
    },
  });

  // Export handler
  const handleExport = useCallback(async (format: 'csv' | 'xlsx' | 'pdf' | 'json') => {
    // Get the active sprint or first non-completed sprint
    const activeSprint = sprints.find((s) => s.status === "active") || sprints.find((s) => s.status !== "completed");
    if (!activeSprint) {
      alert("No active sprint to export");
      return;
    }

    setIsExporting(true);
    setShowExportDropdown(false);

    try {
      const blob = await sprintApi.exportTasks(activeSprint.id, format);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeSprint.name.replace(/\s+/g, "_")}_tasks.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export tasks. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [sprints]);

  // Keyboard shortcuts listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // ? - Show keyboard shortcuts
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
        return;
      }

      // n - New task
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowAddTask(true);
        return;
      }

      // Escape - Clear selection or close modals
      if (e.key === "Escape") {
        if (showAddTask || selectedTask || showKeyboardShortcuts) {
          // Modal will handle its own escape
          return;
        }
        if (hasSelection) {
          clearSelection();
        }
        return;
      }

      // Quick status changes for selected tasks (1-5)
      if (hasSelection && ["1", "2", "3", "4", "5"].includes(e.key)) {
        const statusMap: Record<string, TaskStatus> = {
          "1": "backlog",
          "2": "todo",
          "3": "in_progress",
          "4": "review",
          "5": "done",
        };
        const newStatus = statusMap[e.key];
        if (newStatus) {
          bulkStatusMutation.mutate({ status: newStatus });
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddTask, selectedTask, showKeyboardShortcuts, hasSelection, clearSelection, bulkStatusMutation]);

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

    const dropTargetId = over.id as string;

    if (viewMode === "sprint") {
      // Moving between sprints
      // Check if dropped on a sprint column or a task within a sprint
      let targetSprintId = dropTargetId;

      // If dropped on a task, find which sprint that task belongs to
      const targetTask = filteredTasks.find((t) => t.id === dropTargetId);
      if (targetTask) {
        targetSprintId = targetTask.sprint_id || "";
      }

      const targetSprint = sprints.find((s) => s.id === targetSprintId);

      if (targetSprint && targetSprintId !== task.sprint_id && task.sprint_id) {
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

      // First check if dropped directly on a status column
      let targetStatus: TaskStatus | undefined = statusKeys.find((s) => dropTargetId === s);

      // If dropped on a task, find which status that task belongs to
      if (!targetStatus) {
        const targetTask = filteredTasks.find((t) => t.id === dropTargetId);
        if (targetTask) {
          targetStatus = targetTask.status;
        }
      }

      if (targetStatus && targetStatus !== task.status) {
        try {
          await updateTaskStatus({
            taskId,
            sprintId: task.sprint_id || null, // Works for both sprint and project-level tasks
            status: targetStatus,
          });
        } catch (error) {
          console.error("Failed to update status:", error);
        }
      }
    }
  };

  const handleTaskClick = (task: SprintTask) => {
    // Open edit modal
    setSelectedTask(task);
  };

  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    try {
      await updateTaskStatus({
        taskId,
        sprintId: task.sprint_id || null,
        status: newStatus,
      });
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await deleteTask({
        sprintId: task.sprint_id || null,
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

              {/* Templates */}
              <Link
                href={`/sprints/${projectId}/templates`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition"
                title="Task Templates"
              >
                <FileText className="h-4 w-4" />
                Templates
              </Link>

              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition disabled:opacity-50"
                  title="Export Tasks"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showExportDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowExportDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-20">
                      <button
                        onClick={() => handleExport("csv")}
                        className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-green-400" />
                        Export as CSV
                      </button>
                      <button
                        onClick={() => handleExport("xlsx")}
                        className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                        Export as Excel
                      </button>
                      <button
                        onClick={() => handleExport("pdf")}
                        className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileType className="h-4 w-4 text-red-400" />
                        Export as PDF
                      </button>
                      <button
                        onClick={() => handleExport("json")}
                        className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileJson className="h-4 w-4 text-yellow-400" />
                        Export as JSON
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Keyboard Shortcuts */}
              <button
                onClick={() => setShowKeyboardShortcuts(true)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="h-5 w-5" />
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
            className="border-b border-slate-700 bg-primary-900/30 overflow-hidden z-50 relative"
          >
            <div className="max-w-[1800px] mx-auto px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-white font-medium">
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
                {/* Move to Sprint Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSprintDropdown(!showSprintDropdown);
                      setShowStatusDropdown(false);
                      setShowAssignDropdown(false);
                    }}
                    disabled={bulkMoveMutation.isPending}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkMoveMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Move to Sprint
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showSprintDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
                      {sprints
                        .filter((s) => s.status !== "completed")
                        .map((sprint) => (
                          <button
                            key={sprint.id}
                            onClick={() => bulkMoveMutation.mutate({ targetSprintId: sprint.id })}
                            className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                          >
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full",
                                SPRINT_STATUS_COLORS[sprint.status] || "bg-slate-500"
                              )}
                            />
                            {sprint.name}
                          </button>
                        ))}
                      {sprints.filter((s) => s.status !== "completed").length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No active sprints</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Change Status Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowStatusDropdown(!showStatusDropdown);
                      setShowSprintDropdown(false);
                      setShowAssignDropdown(false);
                    }}
                    disabled={bulkStatusMutation.isPending}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkStatusMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Change Status
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showStatusDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
                      {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof STATUS_CONFIG[TaskStatus]][]).map(
                        ([status, config]) => (
                          <button
                            key={status}
                            onClick={() => bulkStatusMutation.mutate({ status })}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 flex items-center gap-2"
                          >
                            <span className={cn("w-2 h-2 rounded-full", config.bgColor, config.color)} />
                            <span className="text-slate-200">{config.label}</span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Assign Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowAssignDropdown(!showAssignDropdown);
                      setShowSprintDropdown(false);
                      setShowStatusDropdown(false);
                    }}
                    disabled={bulkAssignMutation.isPending}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkAssignMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Assign
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showAssignDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => bulkAssignMutation.mutate({ developerId: null })}
                        className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <UserX className="w-4 h-4" />
                        Unassign
                      </button>
                      <div className="border-t border-slate-700 my-1" />
                      {mentionUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => bulkAssignMutation.mutate({ developerId: user.id })}
                          className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                        >
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.name}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
                              <User className="w-3 h-3 text-slate-400" />
                            </div>
                          )}
                          {user.name}
                        </button>
                      ))}
                      {mentionUsers.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No team members</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside handler for dropdowns */}
      {(showStatusDropdown || showSprintDropdown || showAssignDropdown) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowStatusDropdown(false);
            setShowSprintDropdown(false);
            setShowAssignDropdown(false);
          }}
        />
      )}

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
                    onStatusChange={handleQuickStatusChange}
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
            users={mentionUsers}
            templates={templates}
            workspaceId={currentWorkspaceId || undefined}
          />
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {selectedTask && (
          <EditTaskModal
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={updateTask}
            onDelete={deleteTask}
            isUpdating={isUpdatingTask}
            sprints={sprints}
            epics={epics || []}
            users={mentionUsers}
          />
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showKeyboardShortcuts && (
          <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
