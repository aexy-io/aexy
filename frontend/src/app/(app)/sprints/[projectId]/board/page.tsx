"use client";

import { use, useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
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
  Dices,
  Wand2,
  Target,
  BarChart3,
  Users2,
  Gauge,
  ArrowRightLeft,
  Pencil,
  GitBranch,
  GitPullRequest,
  AlertTriangle,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
import { useProject } from "@/hooks/useProjects";
import { SprintTask, TaskStatus, TaskPriority, SprintListItem, EpicListItem, sprintApi, projectTasksApi, TaskTemplate, taskTemplatesApi } from "@/lib/api";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { TaskCardPremium, TaskCardSkeleton } from "@/components/planning/TaskCardPremium";
import { FilterBar } from "@/components/planning/FilterBar";
import { SavedViewSwitcher } from "@/components/crm/SavedViewSwitcher";
import { useSavedViews } from "@/hooks/useSavedViews";
import { CommandPalette } from "@/components/CommandPalette";
import { TaskDescriptionEditor, TaskDescriptionEditorRef, MentionUser } from "@/components/planning/TaskDescriptionEditor";
import { FileMetadataPopover } from "@/components/files/FileMetadataPopover";
import { FileAILine } from "@/components/files/FileAIBadges";
import type { FileAIMetadata } from "@/lib/api";

// Local helper type for the AI block on task attachments — the SprintTask
// shape from lib/api.ts hasn't been re-typed for `ai` yet (tracked
// separately), so we cast at call sites.
type TaskAttachmentWithAI = {
  id: string;
  file_url: string;
  file_name: string;
  ai?: FileAIMetadata | null;
};
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge, PremiumCard, Skeleton } from "@/components/ui/premium-card";
import { X, Loader2, FileText, Zap } from "lucide-react";
import { CycleTimeChart } from "@/components/planning/CycleTimeChart";
import { CapacityPlanner } from "@/components/planning/CapacityPlanner";
import { PlanningPoker } from "@/components/planning/PlanningPoker";
import { ImportTasksModal } from "@/components/planning/ImportTasksModal";
import {
  CollapsiblePRInsight,
  ReviewerSuggestionsCard,
  SimilarPRsCard,
  TaskAlignmentBadge,
} from "@/components/code-insights";
import {
  SPRINT_STATUS_COLORS as SPRINT_STATUS_COLORS_BASE,
  TASK_STATUS_COLORS as TASK_STATUS_COLORS_BASE,
} from "@/lib/statusColors";

// Status column configuration – derives text/bg from centralized tokens, adds label
const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog: { label: "Backlog", color: TASK_STATUS_COLORS_BASE.backlog.text, bgColor: TASK_STATUS_COLORS_BASE.backlog.bg },
  todo: { label: "To Do", color: TASK_STATUS_COLORS_BASE.todo.text, bgColor: TASK_STATUS_COLORS_BASE.todo.bg },
  in_progress: { label: "In Progress", color: TASK_STATUS_COLORS_BASE.in_progress.text, bgColor: TASK_STATUS_COLORS_BASE.in_progress.bg },
  review: { label: "Review", color: TASK_STATUS_COLORS_BASE.review.text, bgColor: TASK_STATUS_COLORS_BASE.review.bg },
  done: { label: "Done", color: TASK_STATUS_COLORS_BASE.done.text, bgColor: TASK_STATUS_COLORS_BASE.done.bg },
};

// Sprint status dot colors – derived from centralized tokens
const SPRINT_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SPRINT_STATUS_COLORS_BASE).map(([k, v]) => [k, v.dot || "bg-muted-foreground"])
);

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
  wipLimit?: number | null;
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
  wipLimit,
}: KanbanColumnProps) {
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
  const isAtWipLimit = wipLimit != null && wipLimit > 0 && tasks.length >= wipLimit;
  const isOverWipLimit = wipLimit != null && wipLimit > 0 && tasks.length > wipLimit;

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
        (isOver || isDropOver) && "ring-2 ring-primary-500/50 bg-primary-900/20",
        isOverWipLimit && "ring-2 ring-red-500/50",
        isAtWipLimit && !isOverWipLimit && "ring-2 ring-amber-500/30"
      )}
    >
      {/* Column header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-3 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-medium text-sm", color)}>{title}</h3>
          <Badge variant="default" size="sm">
            {wipLimit != null && wipLimit > 0 ? (
              <span className={cn(
                isOverWipLimit ? "text-red-500" : isAtWipLimit ? "text-amber-500" : ""
              )}>
                {tasks.length}/{wipLimit}
              </span>
            ) : (
              tasks.length
            )}
          </Badge>
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-muted-foreground">{totalPoints} SP</span>
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
            <div className="text-center py-8 text-muted-foreground text-sm">
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
        "flex-shrink-0 rounded-xl bg-muted/50 border border-border/50 transition-all duration-200",
        isCollapsed ? "w-[60px]" : "w-[320px]",
        (isOver || isDropOver) && "ring-2 ring-primary-500/50 bg-primary-900/20"
      )}
    >
      {/* Sprint header */}
      <div
        className={cn(
          "flex items-center gap-2 p-3 border-b border-border/50 cursor-pointer hover:bg-accent/30 transition-colors",
          isCollapsed && "justify-center"
        )}
        onClick={onToggleCollapse}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span
              className="text-xs font-medium text-foreground writing-mode-vertical transform rotate-180"
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
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                SPRINT_STATUS_COLORS[sprint.status]
              )}
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm text-foreground truncate">{sprint.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground capitalize">{sprint.status}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{completionRate}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="default" size="sm">
                {tasks.length}
              </Badge>
              {totalPoints > 0 && (
                <span className="text-muted-foreground">{totalPoints} SP</span>
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
              <div className="text-center py-8 text-muted-foreground text-sm">
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
  critical: { label: "Critical", color: "text-red-600 dark:text-red-400" },
  high: { label: "High", color: "text-orange-600 dark:text-orange-400" },
  medium: { label: "Medium", color: "text-yellow-600 dark:text-yellow-400" },
  low: { label: "Low", color: "text-blue-600 dark:text-blue-400" },
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
        className="bg-muted border border-border rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Keyboard className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h3>
              <p className="text-sm text-muted-foreground">Navigate faster with these shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-2 gap-6">
            {KEYBOARD_SHORTCUTS.map((section) => (
              <div key={section.category}>
                <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Command className="h-3.5 w-3.5" />
                  {section.category}
                </h4>
                <div className="space-y-2">
                  {section.shortcuts.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1.5"
                    >
                      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx}>
                            <kbd className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground font-mono shadow-sm">
                              {key}
                            </kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="text-muted-foreground mx-0.5">+</span>
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

        <div className="p-4 border-t border-border bg-muted/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-accent border border-border rounded text-xs">?</kbd> anytime to show this panel
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
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
      start_date?: string;
      end_date?: string;
      estimated_hours?: number;
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [estimatedHours, setEstimatedHours] = useState<string>("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
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

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setError("End date must be after start date");
      return;
    }

    // Get plain text description from JSON for backwards compatibility
    const plainDescription = descriptionJson
      ? extractPlainText(descriptionJson)
      : undefined;

    try {
      const created = await onAdd({
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
          start_date: startDate ? new Date(startDate).toISOString() : undefined,
          end_date: endDate ? new Date(endDate).toISOString() : undefined,
          estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        },
      });

      // Upload any selected attachments after the task exists. Backlog tasks
      // (no sprint) use the project-task endpoint; sprint tasks use the
      // sprint-scoped endpoint. Both go through the same backend helper.
      if (attachmentFiles.length > 0) {
        setIsUploadingAttachments(true);
        try {
          if (created.sprint_id) {
            await sprintApi.uploadTaskAttachments(
              created.sprint_id,
              created.id,
              attachmentFiles,
            );
          } else if (created.team_id) {
            await projectTasksApi.uploadTaskAttachments(
              created.team_id,
              created.id,
              attachmentFiles,
            );
          } else {
            setError(
              "Task created, but couldn't attach files: task is missing a team. Refresh and try again.",
            );
            return;
          }
        } finally {
          setIsUploadingAttachments(false);
        }
      }

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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-muted border border-border rounded-xl w-full max-w-2xl p-6 shadow-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-xl font-semibold text-foreground">
            {mode === "select" ? "Create Task" : selectedTemplate ? `New Task from "${selectedTemplate.name}"` : "Create Task"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
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
              className="w-full flex items-center gap-3 p-4 bg-background/50 hover:bg-accent/50 border border-border hover:border-primary-500/50 rounded-xl transition text-left group"
            >
              <div className="p-2 bg-primary-500/20 rounded-lg group-hover:bg-primary-500/30 transition">
                <Plus className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <span className="text-foreground font-medium">Start from scratch</span>
                <p className="text-sm text-muted-foreground">Create a blank task</p>
              </div>
            </button>

            {/* Templates */}
            {templates.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Zap className="h-3.5 w-3.5" />
                  Templates
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {templates.filter(t => t.is_active).map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="w-full flex items-center gap-3 p-3 bg-background/30 hover:bg-accent/50 border border-border/50 hover:border-primary-500/50 rounded-lg transition text-left group"
                    >
                      <div className="p-1.5 bg-accent/50 rounded group-hover:bg-muted/50 transition">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-foreground font-medium truncate block">{template.name}</span>
                        {template.description && (
                          <p className="text-xs text-muted-foreground truncate">{template.description}</p>
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
              <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
              />
            </div>

            {/* Description with rich text and mentions */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  Use @ to mention users
                </span>
              </label>
              <TaskDescriptionEditor
                ref={editorRef}
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Add more details... Use @ to mention team members"
                users={users}
                minHeight="150px"
              />
            </div>

            {/* Sprint Selection (Optional) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Sprint <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
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
              <p className="text-xs text-muted-foreground mt-1">
                Tasks without a sprint go to project backlog
              </p>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Start Date & Time
                </label>
                <input
                  type="datetime-local"
                  data-testid="task-start-date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  End Date & Time
                </label>
                <input
                  type="datetime-local"
                  data-testid="task-end-date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                />
              </div>
            </div>

            {/* Story Points, Estimated Hours & Priority */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Story Points</label>
                <input
                  type="number"
                  min="0"
                  max="21"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  data-testid="task-estimated-hours"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Attachments
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  Multiple files supported
                </span>
              </label>
              <input
                type="file"
                multiple
                data-testid="task-attachments-input"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  setAttachmentFiles((prev) => [...prev, ...files]);
                  // Allow re-selecting the same file later
                  e.currentTarget.value = "";
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:font-medium hover:file:bg-primary-700 file:cursor-pointer"
              />
              {attachmentFiles.length > 0 && (
                <ul className="mt-2 space-y-1" data-testid="task-attachments-list">
                  {attachmentFiles.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between text-xs bg-background/50 border border-border rounded px-2 py-1"
                    >
                      <span className="text-foreground truncate max-w-[80%]">
                        {file.name}{" "}
                        <span className="text-muted-foreground">
                          ({Math.round(file.size / 1024)} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Status & Assignee */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
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
                <label className="block text-sm font-medium text-foreground mb-1.5">Epic (Optional)</label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition"
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
                  className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition text-sm"
                >
                  ← Back to templates
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                Cancel
              </button>
              <div className="relative group">
                <button
                  type="submit"
                  disabled={isAdding || isUploadingAttachments || !title.trim()}
                  data-testid="create-task-submit"
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {(isAdding || isUploadingAttachments) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {isUploadingAttachments
                    ? "Uploading attachments…"
                    : isAdding
                      ? "Creating..."
                      : "Create Task"}
                </button>
                {!title.trim() && !isAdding && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-accent text-xs text-foreground rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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

// Full activity log for a task. Lives in the "History" tab of the
// EditTaskModal so every change is attributable to the user who made it —
// creation, assignment, status, priority, points, epic, dates, estimate,
// title/description/labels edits, and comments.
function AssignmentHistoryPanel({
  sprintId,
  teamId,
  taskId,
  users,
}: {
  sprintId: string | null;
  teamId: string | null;
  taskId: string;
  users: MentionUser[];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["taskActivities", sprintId, teamId, taskId],
    queryFn: () => sprintId
      ? sprintApi.getTaskActivities(sprintId, taskId)
      : projectTasksApi.getTaskActivities(teamId!, taskId),
    enabled: !!sprintId || !!teamId,
  });

  if (!sprintId && !teamId) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="task-history-empty">
        No activity available — task is not linked to a sprint or team.
      </p>
    );
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">Failed to load activity.</p>;
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const lookupName = (id: string | null | undefined) =>
    id ? userById.get(id)?.name ?? "Unknown user" : "Unassigned";

  // Show oldest first so the chain reads top-to-bottom in the order it
  // actually happened.
  const events = (data?.activities ?? []).slice().reverse();

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="task-history-empty">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="task-history-list">
      {events.map((event) => {
        const meta = event.metadata as { from_assignee_id?: string | null; to_assignee_id?: string | null } | null;
        const actorName = event.actor_name ?? "System";
        const oldStr = event.old_value ?? "—";
        const newStr = event.new_value ?? "—";

        let line: React.ReactNode;
        switch (event.action) {
          case "created":
            line = <>created this task</>;
            break;
          case "assigned":
            line = (
              <>
                reassigned from{" "}
                <span className="text-foreground">
                  {lookupName(meta?.from_assignee_id ?? event.old_value)}
                </span>{" "}
                to{" "}
                <span className="text-foreground">
                  {lookupName(meta?.to_assignee_id ?? event.new_value)}
                </span>
              </>
            );
            break;
          case "unassigned":
            line = (
              <>
                unassigned{" "}
                <span className="text-foreground">
                  {lookupName(meta?.from_assignee_id ?? event.old_value)}
                </span>
              </>
            );
            break;
          case "status_changed":
            line = (
              <>
                changed status: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "priority_changed":
            line = (
              <>
                changed priority: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "points_changed":
            line = (
              <>
                changed story points: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "epic_changed":
            line = (
              <>
                {event.new_value
                  ? <>linked to epic <span className="text-foreground">{newStr}</span></>
                  : <>removed from epic</>}
              </>
            );
            break;
          case "title_changed":
            line = <>renamed to <span className="text-foreground">{newStr}</span></>;
            break;
          case "description_changed":
            line = <>updated the description</>;
            break;
          case "labels_changed":
            line = <>updated labels</>;
            break;
          case "start_date_changed":
            line = (
              <>
                {event.new_value
                  ? <>set start date to <span className="text-foreground">{newStr}</span></>
                  : <>cleared start date</>}
              </>
            );
            break;
          case "end_date_changed":
            line = (
              <>
                {event.new_value
                  ? <>set due date to <span className="text-foreground">{newStr}</span></>
                  : <>cleared due date</>}
              </>
            );
            break;
          case "estimated_hours_changed":
            line = (
              <>
                {event.new_value
                  ? <>set estimate to <span className="text-foreground">{newStr}h</span></>
                  : <>cleared estimate</>}
              </>
            );
            break;
          case "comment":
            line = <>commented</>;
            break;
          case "attachment_added":
            line = (
              <>
                attached{" "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "attachment_removed":
            line = (
              <>
                removed attachment{" "}
                <span className="text-foreground">{oldStr}</span>
              </>
            );
            break;
          case "archived":
            line = <>archived this task</>;
            break;
          case "unarchived":
            line = <>restored this task</>;
            break;
          case "sprint_changed":
            line = event.new_value
              ? (
                <>
                  moved into sprint{" "}
                  <span className="text-foreground">{newStr}</span>
                </>
              )
              : <>moved to backlog</>;
            break;
          default:
            line = (
              <>
                updated {event.field_name ?? event.action}
                {event.old_value || event.new_value ? (
                  <>: <span className="text-foreground">{oldStr}</span>{" → "}
                    <span className="text-foreground">{newStr}</span></>
                ) : null}
              </>
            );
        }

        return (
          <li
            key={event.id}
            data-testid="task-history-item"
            data-history-action={event.action}
            className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 p-3 text-sm"
          >
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{actorName}</span>{" "}
              {line}
            </span>
            {event.action === "comment" && event.comment && (
              <p className="whitespace-pre-wrap text-foreground text-sm">{event.comment}</p>
            )}
            <time className="text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString()}
            </time>
          </li>
        );
      })}
    </ol>
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
      contributes_to_goal?: boolean;
      mentioned_user_ids?: string[];
      mentioned_file_paths?: string[];
      start_date?: string | null;
      end_date?: string | null;
      estimated_hours?: number | null;
    };
  }) => Promise<SprintTask>;
  onDelete: (data: { sprintId: string | null; taskId: string }) => Promise<void>;
  isUpdating: boolean;
  sprints: SprintListItem[];
  epics: EpicListItem[];
  users: MentionUser[];
}

function EditTaskModal({ task, onClose, onUpdate, onDelete, isUpdating, sprints, epics, users }: EditTaskModalProps) {
  const queryClient = useQueryClient();
  const CACHE_KEY = `task_draft_${task.id}`;

  // Try to restore cached state
  const getCachedState = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }, [CACHE_KEY]);

  const cachedState = getCachedState();

  const [title, setTitle] = useState(cachedState?.title ?? task.title);
  const [descriptionJson, setDescriptionJson] = useState<Record<string, unknown> | null>(
    cachedState?.descriptionJson ?? (task as any).description_json ?? null
  );
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>(
    cachedState?.mentionedUserIds ?? (task as any).mentioned_user_ids ?? []
  );
  const [mentionedFilePaths, setMentionedFilePaths] = useState<string[]>(
    cachedState?.mentionedFilePaths ?? (task as any).mentioned_file_paths ?? []
  );
  const [storyPoints, setStoryPoints] = useState(cachedState?.storyPoints ?? task.story_points?.toString() ?? "");
  const [priority, setPriority] = useState<TaskPriority>(cachedState?.priority ?? task.priority);
  const [status, setStatus] = useState<TaskStatus>(cachedState?.status ?? task.status);
  const [epicId, setEpicId] = useState<string>(cachedState?.epicId ?? task.epic_id ?? "");
  const [sprintId, setSprintId] = useState<string>(cachedState?.sprintId ?? task.sprint_id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(cachedState?.assigneeId ?? task.assignee_id ?? "");
  const [contributesToGoal, setContributesToGoal] = useState(cachedState?.contributesToGoal ?? task.contributes_to_goal ?? false);
  // Schedule + estimated effort fields. Use the first 16 chars of an ISO
  // timestamp ("YYYY-MM-DDTHH:MM") so they bind directly to a
  // <input type="datetime-local">.
  const [startDate, setStartDate] = useState<string>(
    cachedState?.startDate ?? (task.start_date ? task.start_date.slice(0, 16) : ""),
  );
  const [endDate, setEndDate] = useState<string>(
    cachedState?.endDate ?? (task.end_date ? task.end_date.slice(0, 16) : ""),
  );
  const [estimatedHours, setEstimatedHours] = useState<string>(
    cachedState?.estimatedHours ?? task.estimated_hours?.toString() ?? "",
  );
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(!!cachedState);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [prSearch, setPrSearch] = useState("");
  const [selectedPrId, setSelectedPrId] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [selectedIssueKey, setSelectedIssueKey] = useState("");
  const [manualIssueRef, setManualIssueRef] = useState("");
  const [manualIssueRepository, setManualIssueRepository] = useState("");
  const editorRef = useRef<TaskDescriptionEditorRef>(null);

  // Cache form state when values change
  const taskStartDateLocal = task.start_date ? task.start_date.slice(0, 16) : "";
  const taskEndDateLocal = task.end_date ? task.end_date.slice(0, 16) : "";
  const taskEstimatedHoursStr = task.estimated_hours?.toString() ?? "";
  useEffect(() => {
    const currentState = {
      title,
      descriptionJson,
      mentionedUserIds,
      mentionedFilePaths,
      storyPoints,
      priority,
      status,
      epicId,
      sprintId,
      assigneeId,
      startDate,
      endDate,
      estimatedHours,
    };

    // Only cache if there are actual changes from original task
    const hasLocalChanges =
      title !== task.title ||
      JSON.stringify(descriptionJson) !== JSON.stringify((task as any).description_json || null) ||
      storyPoints !== (task.story_points?.toString() || "") ||
      priority !== task.priority ||
      status !== task.status ||
      epicId !== (task.epic_id || "") ||
      sprintId !== (task.sprint_id || "") ||
      assigneeId !== (task.assignee_id || "") ||
      startDate !== taskStartDateLocal ||
      endDate !== taskEndDateLocal ||
      estimatedHours !== taskEstimatedHoursStr;

    if (hasLocalChanges) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(currentState));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  }, [CACHE_KEY, title, descriptionJson, mentionedUserIds, mentionedFilePaths, storyPoints, priority, status, epicId, sprintId, assigneeId, startDate, endDate, estimatedHours, taskStartDateLocal, taskEndDateLocal, taskEstimatedHoursStr, task]);

  // Clear cache helper
  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
  }, [CACHE_KEY]);

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
    assigneeId !== (task.assignee_id || "") ||
    startDate !== taskStartDateLocal ||
    endDate !== taskEndDateLocal ||
    estimatedHours !== taskEstimatedHoursStr ||
    newAttachmentFiles.length > 0;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setError("End date must be after start date");
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
          contributes_to_goal: contributesToGoal,
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          mentioned_file_paths: mentionedFilePaths.length > 0 ? mentionedFilePaths : undefined,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          end_date: endDate ? new Date(endDate).toISOString() : null,
          estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
        },
      });

      // Upload any newly attached files after the task PATCH succeeds.
      // Sprint tasks → sprint-scoped endpoint; backlog tasks → project endpoint.
      if (newAttachmentFiles.length > 0) {
        setIsUploadingAttachments(true);
        try {
          if (task.sprint_id) {
            await sprintApi.uploadTaskAttachments(
              task.sprint_id,
              task.id,
              newAttachmentFiles,
            );
          } else if (task.team_id) {
            await projectTasksApi.uploadTaskAttachments(
              task.team_id,
              task.id,
              newAttachmentFiles,
            );
          }
          await queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
          await queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
          setNewAttachmentFiles([]);
        } finally {
          setIsUploadingAttachments(false);
        }
      }

      clearCache();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update task";
      setError(errorMessage);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      if (task.sprint_id) {
        await sprintApi.deleteTaskAttachment(task.sprint_id, task.id, attachmentId);
      } else if (task.team_id) {
        await projectTasksApi.deleteTaskAttachment(task.team_id, task.id, attachmentId);
      } else {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      await queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  // Handle discard - clear cache and close
  const handleDiscard = () => {
    clearCache();
    onClose();
  };

  const handleRequestClose = useCallback(() => {
    if (hasChanges) {
      setShowCloseConfirm(true);
      return;
    }

    onClose();
  }, [hasChanges, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRequestClose]);

  const handleDelete = async () => {
    try {
      await onDelete({
        sprintId: task.sprint_id || null,
        taskId: task.id,
      });
      clearCache();
      onClose();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    setStatus(newStatus);
  };

  const githubLinksQueryKey = ["taskGithubLinks", task.sprint_id, task.team_id, task.id];
  const pullRequestsQueryKey = ["taskLinkPullRequests", task.sprint_id, task.team_id, prSearch];
  const githubIssuesQueryKey = ["taskLinkGitHubIssues", task.sprint_id, task.team_id, issueSearch];
  const issueRepositoryContextQueryKey = ["taskGitHubIssueRepositories", task.sprint_id, task.team_id, task.id];
  const canUseProjectGitHubLinks = !!task.team_id;

  const { data: githubLinks = [], isLoading: isLoadingGithubLinks } = useQuery({
    queryKey: githubLinksQueryKey,
    queryFn: () => task.sprint_id
      ? sprintApi.getTaskGitHubLinks(task.sprint_id, task.id)
      : projectTasksApi.getTaskGitHubLinks(task.team_id!, task.id),
    enabled: !!task.sprint_id || canUseProjectGitHubLinks,
  });

  // Page size for the search dropdowns. Larger pages = fewer round
  // trips at the cost of a bigger initial payload; 50 is the sweet
  // spot most teams won't paginate past.
  const SEARCH_PAGE_SIZE = 50;

  const {
    data: pullRequestsData,
    isLoading: isLoadingPullRequests,
    fetchNextPage: fetchMorePullRequests,
    hasNextPage: hasMorePullRequests,
    isFetchingNextPage: isFetchingMorePullRequests,
  } = useInfiniteQuery({
    queryKey: pullRequestsQueryKey,
    queryFn: ({ pageParam = 0 }) => task.sprint_id
      ? sprintApi.searchPullRequests(task.sprint_id, prSearch, {
          limit: SEARCH_PAGE_SIZE,
          offset: pageParam,
        })
      : projectTasksApi.searchPullRequests(task.team_id!, prSearch, {
          limit: SEARCH_PAGE_SIZE,
          offset: pageParam,
        }),
    enabled: !!task.sprint_id || canUseProjectGitHubLinks,
    initialPageParam: 0,
    // If the last page came back full, assume there's more. The API
    // returns a plain list so we infer pagination from length.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === SEARCH_PAGE_SIZE
        ? allPages.length * SEARCH_PAGE_SIZE
        : undefined,
  });
  const pullRequests = useMemo(
    () => pullRequestsData?.pages.flat() ?? [],
    [pullRequestsData],
  );

  const {
    data: githubIssuesData,
    isLoading: isLoadingGithubIssues,
    fetchNextPage: fetchMoreGithubIssues,
    hasNextPage: hasMoreGithubIssues,
    isFetchingNextPage: isFetchingMoreGithubIssues,
  } = useInfiniteQuery({
    queryKey: githubIssuesQueryKey,
    queryFn: ({ pageParam = 0 }) => task.sprint_id
      ? sprintApi.searchGitHubIssues(task.sprint_id, issueSearch, {
          limit: SEARCH_PAGE_SIZE,
          offset: pageParam,
        })
      : projectTasksApi.searchGitHubIssues(task.team_id!, issueSearch, {
          limit: SEARCH_PAGE_SIZE,
          offset: pageParam,
        }),
    enabled: !!task.sprint_id || canUseProjectGitHubLinks,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === SEARCH_PAGE_SIZE
        ? allPages.length * SEARCH_PAGE_SIZE
        : undefined,
  });
  const githubIssues = useMemo(
    () => githubIssuesData?.pages.flat() ?? [],
    [githubIssuesData],
  );

  const { data: issueRepositoryContext } = useQuery({
    queryKey: issueRepositoryContextQueryKey,
    queryFn: () => task.sprint_id
      ? sprintApi.getGitHubIssueRepositoryContext(task.sprint_id, task.id)
      : projectTasksApi.getGitHubIssueRepositoryContext(task.team_id!, task.id),
    enabled: !!task.sprint_id || canUseProjectGitHubLinks,
  });

  const linkPullRequestMutation = useMutation({
    mutationFn: (pullRequestId: string) => task.sprint_id
      ? sprintApi.linkPullRequest(task.sprint_id, task.id, pullRequestId)
      : projectTasksApi.linkPullRequest(task.team_id!, task.id, pullRequestId),
    onSuccess: () => {
      setSelectedPrId("");
      queryClient.invalidateQueries({ queryKey: githubLinksQueryKey });
      toast.success("Pull request linked");
    },
    onError: () => {
      toast.error("Failed to link pull request");
    },
  });

  const unlinkGitHubLinkMutation = useMutation({
    mutationFn: (linkId: string) => task.sprint_id
      ? sprintApi.unlinkGitHubLink(task.sprint_id, task.id, linkId)
      : projectTasksApi.unlinkGitHubLink(task.team_id!, task.id, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubLinksQueryKey });
      toast.success("GitHub link removed");
    },
    onError: () => {
      toast.error("Failed to remove GitHub link");
    },
  });

  const linkGitHubIssueMutation = useMutation({
    mutationFn: (payload: { repository: string; issue_number: number; title?: string | null; state?: string | null; url?: string | null }) => {
      return task.sprint_id
        ? sprintApi.linkGitHubIssue(task.sprint_id, task.id, payload)
        : projectTasksApi.linkGitHubIssue(task.team_id!, task.id, payload);
    },
    onSuccess: () => {
      setSelectedIssueKey("");
      setManualIssueRef("");
      queryClient.invalidateQueries({ queryKey: githubLinksQueryKey });
      toast.success("GitHub issue linked");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to link GitHub issue";
      toast.error(message);
    },
  });

  const inferredIssueRepository = issueRepositoryContext?.inferred_repository || null;
  const knownIssueRepositories = issueRepositoryContext?.repositories ?? [];
  const selectedManualRepository = manualIssueRepository.trim() || inferredIssueRepository || "";

  const parseManualIssueReference = useCallback((value: string, fallbackRepository: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { error: "Enter an issue number, owner/repo#123, or GitHub issue URL." };

    const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/issues\/(\d+)(?:[/?#].*)?$/i);
    if (urlMatch) {
      return { repository: urlMatch[1], issueNumber: Number(urlMatch[2]), url: trimmed };
    }

    const repoRefMatch = trimmed.match(/^([^/\s#]+\/[^/\s#]+)#(\d+)$/);
    if (repoRefMatch) {
      return { repository: repoRefMatch[1], issueNumber: Number(repoRefMatch[2]) };
    }

    const numberMatch = trimmed.match(/^#?(\d+)$/);
    if (numberMatch) {
      if (!fallbackRepository) {
        return { error: "Choose a repository or use owner/repo#123." };
      }
      return { repository: fallbackRepository, issueNumber: Number(numberMatch[1]) };
    }

    return { error: "Use #123, owner/repo#123, or a GitHub issue URL." };
  }, []);

  const handleSelectedIssueLink = () => {
    const issue = githubIssues.find((item) => `${item.repository}#${item.number}` === selectedIssueKey);
    if (!issue) {
      toast.error("Select a GitHub issue to link");
      return;
    }
    linkGitHubIssueMutation.mutate({
      repository: issue.repository,
      issue_number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.url,
    });
  };

  const handleManualIssueLink = () => {
    const parsed = parseManualIssueReference(manualIssueRef, selectedManualRepository);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }

    linkGitHubIssueMutation.mutate({
      repository: parsed.repository,
      issue_number: parsed.issueNumber,
      url: parsed.url,
    });
  };

  const selectedSprintName = task.sprint_id
    ? sprints.find((s) => s.id === task.sprint_id)?.name || "Sprint"
    : "Project Backlog";

  const linkedPullRequestIds = new Set(
    githubLinks
      .map((link) => link.pull_request?.id)
      .filter((id): id is string => Boolean(id))
  );
  const availablePullRequests = pullRequests.filter((pr) => !linkedPullRequestIds.has(pr.id));
  const linkedIssueKeys = new Set(
    githubLinks
      .map((link) => link.github_issue ? `${link.github_issue.repository}#${link.github_issue.number}` : null)
      .filter((key): key is string => Boolean(key))
  );
  const availableGitHubIssues = githubIssues.filter((issue) => !linkedIssueKeys.has(`${issue.repository}#${issue.number}`));
  const pullRequestLinks = githubLinks.filter((link) => link.link_type === "pull_request");
  const issueLinks = githubLinks.filter((link) => link.link_type === "github_issue");
  const issueRepositoryLabel = inferredIssueRepository
    ? `Bare #123 links use ${inferredIssueRepository}`
    : knownIssueRepositories.length > 1
      ? "Multiple repos detected. Pick a repo or use owner/repo#123."
      : "Use owner/repo#123 or paste a GitHub issue URL.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      onClick={(e) => e.target === e.currentTarget && handleRequestClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        aria-describedby="task-modal-meta"
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl shadow-black/40 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-r from-background via-muted/70 to-background px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                  autoFocus
                  className="w-full rounded-lg border border-primary-500/40 bg-background/70 px-3 py-2 text-xl font-semibold text-foreground shadow-inner focus:border-primary-400 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  id="task-modal-title"
                  onClick={() => setIsEditingTitle(true)}
                  className="-mx-2 flex max-w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-xl font-semibold text-foreground transition hover:bg-accent/60 focus:bg-accent/60 focus:outline-none"
                >
                  <span className="min-w-0 break-words">{title}</span>
                  <Pencil className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
              )}
              <div id="task-modal-meta" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {selectedSprintName}
                </span>
                <span>•</span>
                <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                {hasChanges && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400">Unsaved changes</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close task modal"
              onClick={handleRequestClose}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Main content */}
          <div className="space-y-5 p-5 sm:p-6">
            {/* Tabs: Details / History */}
            <div className="flex gap-2 border-b border-border" data-testid="task-tabs">
              <button
                type="button"
                data-testid="task-tab-details"
                onClick={() => setActiveTab("details")}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition border-b-2",
                  activeTab === "details"
                    ? "text-foreground border-primary-500"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                Details
              </button>
              <button
                type="button"
                data-testid="task-tab-history"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition border-b-2",
                  activeTab === "history"
                    ? "text-foreground border-primary-500"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                History
              </button>
            </div>

            {activeTab === "history" && (
              <AssignmentHistoryPanel
                sprintId={task.sprint_id}
                teamId={task.team_id}
                taskId={task.id}
                users={users}
              />
            )}

            {activeTab === "details" && (
              <>
            {/* Quick status buttons */}
            <section className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</label>
                <span className="text-xs text-muted-foreground">Saved with the rest of the task</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    disabled={isUpdating}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      status === s
                        ? `${STATUS_CONFIG[s].bgColor} ${STATUS_CONFIG[s].color} shadow-sm ring-1 ring-current`
                        : "bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </section>

            {/* Description with mentions */}
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <span className="text-xs text-muted-foreground">Use @ to mention</span>
              </div>
              <TaskDescriptionEditor
                ref={editorRef}
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Add more details... Use @ to mention team members"
                users={users}
                minHeight="260px"
              />
            </section>

            {/* GitHub PR Links */}
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">GitHub PRs</h3>
                </div>
                {(task.sprint_id || canUseProjectGitHubLinks) && (
                  <div className="flex flex-col gap-2 sm:min-w-[22rem] sm:flex-row">
                    <input
                      type="search"
                      value={prSearch}
                      onChange={(e) => setPrSearch(e.target.value)}
                      placeholder="Search synced PRs..."
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex flex-col gap-1 sm:w-48">
                      <select
                        aria-label="Select pull request"
                        value={selectedPrId}
                        onChange={(e) => setSelectedPrId(e.target.value)}
                        className="min-w-0 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">
                          {isLoadingPullRequests ? "Loading..." : "Select PR"}
                        </option>
                        {availablePullRequests.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.repository} #{pr.number}
                          </option>
                        ))}
                      </select>
                      {hasMorePullRequests && (
                        <button
                          type="button"
                          onClick={() => fetchMorePullRequests()}
                          disabled={isFetchingMorePullRequests}
                          className="text-xs text-primary-400 hover:text-primary-300 px-1 py-0.5 text-left disabled:opacity-50"
                        >
                          {isFetchingMorePullRequests
                            ? "Loading more…"
                            : `Load more (showing ${availablePullRequests.length})`}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedPrId && linkPullRequestMutation.mutate(selectedPrId)}
                      disabled={!selectedPrId || linkPullRequestMutation.isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white transition hover:bg-primary-700 disabled:opacity-50"
                    >
                      {linkPullRequestMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Link
                    </button>
                  </div>
                )}
              </div>
              {!task.sprint_id ? (
                <p className="text-sm text-muted-foreground">Move this backlog task into a sprint before linking pull requests.</p>
              ) : isLoadingGithubLinks ? (
                <p className="text-sm text-muted-foreground">Loading linked pull requests...</p>
              ) : pullRequestLinks.length > 0 ? (
                <div className="space-y-2">
                  {pullRequestLinks.map((link) => {
                    const pr = link.pull_request;
                    if (!pr) return null;

                    return (
                      <div key={link.id} className="space-y-1.5">
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            pr.state === "open"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : pr.state === "merged"
                                ? "bg-violet-500/15 text-violet-300"
                                : "bg-muted text-muted-foreground"
                          )}>
                            {pr.state || "linked"}
                          </span>
                          <a
                            href={pr.url || "#"}
                            target={pr.url ? "_blank" : undefined}
                            rel={pr.url ? "noreferrer" : undefined}
                            className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                          >
                            {pr.repository} #{pr.number}
                            {pr.title ? ` - ${pr.title}` : ""}
                          </a>
                          <button
                            type="button"
                            aria-label="Unlink pull request"
                            onClick={() => unlinkGitHubLinkMutation.mutate(link.id)}
                            disabled={unlinkGitHubLinkMutation.isPending}
                            className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          >
                            {unlinkGitHubLinkMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {/* Phase 4C — alignment badge sits inline next to
                            the PR row; auto-hides until analyzed. */}
                        <TaskAlignmentBadge linkId={link.id} />
                        {/* Collapsed by default — only fires the network call
                            when the user expands. Keeps busy tasks responsive. */}
                        <CollapsiblePRInsight prId={pr.id} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No pull requests linked.</p>
              )}
              {/* When the task is linked to exactly one PR, surface similar
                  past PRs + suggested reviewers (Phase 4A) — both keyed on
                  the same PR id. Only shows for the single-PR case so we
                  don't flood the modal when many PRs are linked. */}
              {pullRequestLinks.length === 1 &&
                pullRequestLinks[0].pull_request && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <SimilarPRsCard prId={pullRequestLinks[0].pull_request.id} />
                    <ReviewerSuggestionsCard
                      prId={pullRequestLinks[0].pull_request.id}
                    />
                  </div>
                )}
            </section>

            {/* GitHub Issue Links */}
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">GitHub Issues</h3>
                </div>
                {canUseProjectGitHubLinks && (
                  <div className="flex flex-col gap-2 sm:min-w-[22rem] sm:flex-row">
                    <input
                      type="search"
                      value={issueSearch}
                      onChange={(e) => setIssueSearch(e.target.value)}
                      placeholder="Search imported issues..."
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex flex-col gap-1 sm:w-48">
                      <select
                        aria-label="Select GitHub issue"
                        value={selectedIssueKey}
                        onChange={(e) => setSelectedIssueKey(e.target.value)}
                        className="min-w-0 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">
                          {isLoadingGithubIssues ? "Loading..." : "Select issue"}
                        </option>
                        {availableGitHubIssues.map((issue) => (
                          <option key={`${issue.repository}#${issue.number}`} value={`${issue.repository}#${issue.number}`}>
                            {issue.repository} #{issue.number}
                          </option>
                        ))}
                      </select>
                      {hasMoreGithubIssues && (
                        <button
                          type="button"
                          onClick={() => fetchMoreGithubIssues()}
                          disabled={isFetchingMoreGithubIssues}
                          className="text-xs text-primary-400 hover:text-primary-300 px-1 py-0.5 text-left disabled:opacity-50"
                        >
                          {isFetchingMoreGithubIssues
                            ? "Loading more…"
                            : `Load more (showing ${availableGitHubIssues.length})`}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectedIssueLink}
                      disabled={!selectedIssueKey || linkGitHubIssueMutation.isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white transition hover:bg-primary-700 disabled:opacity-50"
                    >
                      {linkGitHubIssueMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Link
                    </button>
                  </div>
                )}
              </div>
              {canUseProjectGitHubLinks && (
                <div className="mb-3 rounded-lg border border-border bg-background/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                      <GitBranch className="h-3 w-3" />
                      {issueRepositoryLabel}
                    </span>
                    {knownIssueRepositories.length > 0 && (
                      <span>{knownIssueRepositories.length} imported repo{knownIssueRepositories.length === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_auto]">
                    <div>
                      <label className="sr-only" htmlFor="manual-github-issue-repo">GitHub issue repository</label>
                      <input
                        id="manual-github-issue-repo"
                        type="text"
                        list="github-issue-repositories"
                        value={manualIssueRepository}
                        onChange={(e) => setManualIssueRepository(e.target.value)}
                        placeholder={inferredIssueRepository || "owner/repo"}
                        className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary-500 focus:outline-none"
                      />
                      <datalist id="github-issue-repositories">
                        {knownIssueRepositories.map((repository) => (
                          <option key={repository} value={repository} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="sr-only" htmlFor="manual-github-issue-ref">GitHub issue reference</label>
                      <input
                        id="manual-github-issue-ref"
                        type="text"
                        value={manualIssueRef}
                        onChange={(e) => setManualIssueRef(e.target.value)}
                        placeholder="#123, owner/repo#123, or issue URL"
                        className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleManualIssueLink}
                      disabled={!manualIssueRef.trim() || linkGitHubIssueMutation.isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                    >
                      {linkGitHubIssueMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Link issue
                    </button>
                  </div>
                </div>
              )}
              {!canUseProjectGitHubLinks ? (
                <p className="text-sm text-muted-foreground">Assign this task to a project before linking GitHub issues.</p>
              ) : isLoadingGithubLinks ? (
                <p className="text-sm text-muted-foreground">Loading linked GitHub issues...</p>
              ) : issueLinks.length > 0 ? (
                <div className="space-y-2">
                  {issueLinks.map((link) => {
                    const issue = link.github_issue;
                    if (!issue) return null;

                    return (
                      <div key={link.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          issue.state === "open" || issue.state === "todo" || issue.state === "in_progress"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : issue.state === "done" || issue.state === "closed"
                              ? "bg-violet-500/15 text-violet-300"
                              : "bg-muted text-muted-foreground"
                        )}>
                          {issue.state || "linked"}
                        </span>
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                        >
                          {issue.repository} #{issue.number}
                          {issue.title ? ` - ${issue.title}` : ""}
                        </a>
                        <button
                          type="button"
                          aria-label="Unlink GitHub issue"
                          onClick={() => unlinkGitHubLinkMutation.mutate(link.id)}
                          disabled={unlinkGitHubLinkMutation.isPending}
                          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          {unlinkGitHubLinkMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No GitHub issues linked.</p>
              )}
            </section>

            {/* Attachments */}
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Attachments</h3>
                <input
                  type="file"
                  multiple
                  data-testid="task-attachments-input-edit"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    setNewAttachmentFiles((prev) => [...prev, ...files]);
                    e.currentTarget.value = "";
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary-600 file:text-white file:font-medium hover:file:bg-primary-700 file:cursor-pointer"
                />
              </div>
              {(task.attachments?.length ?? 0) === 0 && newAttachmentFiles.length === 0 && (
                <p className="text-xs text-muted-foreground">No attachments yet.</p>
              )}
              {(task.attachments?.length ?? 0) > 0 && (
                <ul className="space-y-1" data-testid="task-attachments-existing">
                  {task.attachments?.map((a) => {
                    const ai = (a as TaskAttachmentWithAI).ai ?? null;
                    return (
                      <li
                        key={a.id}
                        className="flex flex-col gap-1 rounded border border-border bg-background/50 px-2 py-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <FileMetadataPopover
                            workspaceId={(task as any).workspace_id ?? null}
                            sourceType="task_attachment"
                            sourceId={a.id}
                            initialMetadata={ai}
                          >
                            <a
                              href={a.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-[70%] truncate text-blue-400 hover:underline"
                            >
                              {a.file_name}
                            </a>
                          </FileMetadataPopover>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(a.id)}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                        {ai && (ai.ai_tags.length > 0 || ai.ai_status !== "done") && (
                          <FileAILine ai={ai} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {newAttachmentFiles.length > 0 && (
                <ul className="mt-2 space-y-1" data-testid="task-attachments-pending">
                  {newAttachmentFiles.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between text-xs bg-background/50 border border-dashed border-border rounded px-2 py-1"
                    >
                      <span className="text-foreground truncate max-w-[80%]">
                        {file.name}{" "}
                        <span className="text-muted-foreground">
                          ({Math.round(file.size / 1024)} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 border-t border-border bg-muted/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Properties</h3>
              <p className="mt-1 text-xs text-muted-foreground">Changes are applied when you save.</p>
            </div>
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            {/* Story Points */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Story Points</label>
              <input
                type="number"
                min="0"
                max="21"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Schedule + Estimated Effort */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                data-testid="task-edit-start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                End Date & Time
              </label>
              <input
                type="datetime-local"
                data-testid="task-edit-end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Estimated Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                data-testid="task-edit-estimated-hours"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Sprint */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Sprint</label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
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
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Epic</label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
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
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            {/* Sprint Goal Checkbox */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contributesToGoal}
                  onChange={(e) => setContributesToGoal(e.target.checked)}
                  className="rounded border-border text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-muted-foreground">Contributes to Sprint Goal</span>
              </label>
            </div>

            {/* Archive button */}
            <div className="pt-4 border-t border-border">
              {showDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-400">Archive this task?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-foreground rounded text-xs"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-2 py-1 bg-accent hover:bg-muted text-foreground rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-2 py-1.5 text-amber-400 hover:bg-amber-500/10 rounded text-sm transition"
                >
                  Archive Task
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* Restored from draft notice */}
        {showRestoredNotice && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-2 bg-blue-500/10 border-t border-blue-500/30 text-sm">
            <span className="text-blue-400">Draft restored from previous session</span>
            <button
              onClick={() => setShowRestoredNotice(false)}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? "Review and save your changes." : "No unsaved changes."}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!hasChanges || isUpdating}
              className="px-4 py-2 text-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 transition"
            >
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isUpdating ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {showCloseConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Unsaved changes</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save your edits before closing, or discard them and close the task.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCloseConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm text-foreground transition hover:bg-accent"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="rounded-lg px-4 py-2 text-sm text-amber-300 transition hover:bg-amber-500/10"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function ProjectBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
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
    archiveTask,
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
  const { project } = useProject(currentWorkspaceId, projectId);
  const { members } = useWorkspaceMembers(currentWorkspaceId);

  // Saved views for sprint tasks
  const {
    views: savedViews,
    createView,
    updateView,
    deleteView,
    isCreating: isCreatingView,
    isUpdating: isUpdatingView,
  } = useSavedViews(currentWorkspaceId, "sprint_task", projectId);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

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

  // Apply saved view filters to the board
  const handleSelectView = useCallback((view: typeof savedViews[number] | null) => {
    if (!view) {
      setActiveViewId(null);
      clearFilters();
      return;
    }
    setActiveViewId(view.id);
    // Map saved view filters back to BoardFilters
    const newFilters: Record<string, unknown> = {};
    for (const f of view.filters || []) {
      const attr = f.attribute as string;
      const val = f.value;
      if (attr === "assignee_id" || attr === "assignees") newFilters.assignees = Array.isArray(val) ? val : [val];
      else if (attr === "priority" || attr === "priorities") newFilters.priorities = Array.isArray(val) ? val : [val];
      else if (attr === "labels") newFilters.labels = Array.isArray(val) ? val : [val];
      else if (attr === "epic_id" || attr === "epics") newFilters.epics = Array.isArray(val) ? val : [val];
      else if (attr === "sprint_id" || attr === "sprints") newFilters.sprints = Array.isArray(val) ? val : [val];
      else if (attr === "story_points" || attr === "storyPoints") newFilters.storyPoints = Array.isArray(val) ? val.map(Number) : [Number(val)];
      else if (attr === "search") newFilters.search = val as string;
    }
    updateFilters(newFilters as Parameters<typeof updateFilters>[0]);
    if (view.view_type === "kanban" || view.view_type === "board") setViewMode("status");
    else if (view.view_type === "table") setViewMode("sprint");
  }, [clearFilters, updateFilters, setViewMode]);

  const handleSaveView = useCallback(async (data: Parameters<typeof createView>[0]) => {
    // Convert current BoardFilters into the generic filter format
    const filterList: Record<string, unknown>[] = [];
    if (filters.assignees.length) filterList.push({ attribute: "assignees", operator: "in", value: filters.assignees });
    if (filters.priorities.length) filterList.push({ attribute: "priorities", operator: "in", value: filters.priorities });
    if (filters.labels.length) filterList.push({ attribute: "labels", operator: "in", value: filters.labels });
    if (filters.epics.length) filterList.push({ attribute: "epics", operator: "in", value: filters.epics });
    if (filters.sprints.length) filterList.push({ attribute: "sprints", operator: "in", value: filters.sprints });
    if (filters.storyPoints.length) filterList.push({ attribute: "storyPoints", operator: "in", value: filters.storyPoints });
    if (filters.search) filterList.push({ attribute: "search", operator: "equals", value: filters.search });

    await createView({
      ...data,
      view_type: viewMode === "status" ? "kanban" : "table",
      filters: filterList,
      entity_scope_id: projectId,
    });
  }, [createView, filters, viewMode, projectId]);

  const handleUpdateView = useCallback(async (viewId: string, data: Parameters<typeof updateView>[1]) => {
    await updateView(viewId, data);
  }, [updateView]);

  const [selectedTask, setSelectedTask] = useState<SprintTask | null>(null);
  const dismissedTaskIdFromUrlRef = useRef<string | null>(null);

  // Auto-open task from URL query parameter (e.g. notification deep links)
  const taskIdFromUrl = searchParams.get("task");
  useEffect(() => {
    if (!taskIdFromUrl) {
      dismissedTaskIdFromUrlRef.current = null;
      return;
    }

    if (dismissedTaskIdFromUrlRef.current === taskIdFromUrl || selectedTask) {
      return;
    }

    if (filteredTasks.length > 0) {
      const task = filteredTasks.find((t) => t.id === taskIdFromUrl);
      if (task) setSelectedTask(task);
    }
  }, [taskIdFromUrl, filteredTasks, selectedTask]);

  const handleCloseTaskModal = useCallback(() => {
    setSelectedTask(null);

    if (!taskIdFromUrl) return;

    dismissedTaskIdFromUrlRef.current = taskIdFromUrl;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const queryString = params.toString();

    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, taskIdFromUrl]);

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
  const [showPlanningPoker, setShowPlanningPoker] = useState(false);
  const [showWipSettings, setShowWipSettings] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState<"cycle-time" | "capacity" | null>(null);
  const [showPlanningDropdown, setShowPlanningDropdown] = useState(false);
  const [showAutoAssignConfirm, setShowAutoAssignConfirm] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [showImportTasks, setShowImportTasks] = useState(false);
  const [importTargetSprint, setImportTargetSprint] = useState<{ id: string; name: string } | null>(null);

  // WIP Limits
  const activeSprint = sprints.find((s) => s.status === "active") || sprints.find((s) => s.status !== "completed");
  const wipLimitsRaw = (activeSprint?.settings as Record<string, unknown> | undefined)?.wip_limits as Record<string, unknown> | undefined;
  const wipLimits: Record<string, number | null> = ((wipLimitsRaw?.limits || wipLimitsRaw) as Record<string, number | null>) || {};

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

  const handleArchiveTask = async (taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      await archiveTask({
        sprintId: task.sprint_id || null,
        taskId: task.id,
      });
    } catch (error) {
      console.error("Failed to archive task:", error);
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Command Palette */}
      <CommandPalette
        workspaceId={currentWorkspaceId}
        projectId={projectId}
        onCreateTask={() => setShowAddTask(true)}
      />

      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-muted/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Breadcrumb
                items={[
                  { label: "Sprints", href: "/sprints" },
                  { label: project?.name || "Project", href: `/sprints/${projectId}` },
                  { label: "Board" },
                ]}
                className="mb-0"
              />
              <div>
                <h1 className="text-lg font-semibold text-foreground">Project Board</h1>
                <p className="text-xs text-muted-foreground">
                  {filteredTasks.length} tasks across {sprints.length} sprints
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <SavedViewSwitcher
                views={savedViews}
                activeViewId={activeViewId}
                onSelectView={handleSelectView}
                onSaveView={handleSaveView}
                onUpdateView={handleUpdateView}
                onDeleteView={deleteView}
                currentConfig={{
                  view_type: viewMode === "status" ? "kanban" : "table",
                  sorts: [],
                }}
                isCreating={isCreatingView}
                isUpdating={isUpdatingView}
              />

              <div className="flex items-center bg-muted border border-border rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("sprint")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all",
                    viewMode === "sprint"
                      ? "bg-primary-500 text-white"
                      : "text-muted-foreground hover:text-foreground"
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
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Status
                </button>
              </div>

              {/* Import Tasks */}
              {activeSprint && (
                <button
                  onClick={() => {
                    setImportTargetSprint({ id: activeSprint.id, name: activeSprint.name });
                    setShowImportTasks(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm transition"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Import
                </button>
              )}

              {/* Add Task */}
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>

              {/* Planning Tools Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowPlanningDropdown(!showPlanningDropdown)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition",
                    showAnalyticsPanel
                      ? "bg-primary-500/20 text-primary-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  title="Planning Tools"
                >
                  <Gauge className="h-4 w-4" />
                  Planning
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showPlanningDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowPlanningDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-52 bg-muted border border-border rounded-lg shadow-xl py-1 z-20">
                      <button
                        onClick={() => {
                          setShowPlanningPoker(true);
                          setShowPlanningDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <Dices className="h-4 w-4 text-purple-400" />
                        Planning Poker
                      </button>
                      <button
                        onClick={() => {
                          setShowPlanningDropdown(false);
                          if (!activeSprint) return;
                          setShowAutoAssignConfirm(true);
                        }}
                        disabled={!activeSprint}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2 disabled:opacity-50"
                      >
                        <Wand2 className="h-4 w-4 text-amber-400" />
                        Auto-Assign
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => {
                          setShowAnalyticsPanel(showAnalyticsPanel === "cycle-time" ? null : "cycle-time");
                          setShowPlanningDropdown(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                          showAnalyticsPanel === "cycle-time"
                            ? "text-primary-400 bg-primary-500/10"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        Cycle Time Analytics
                      </button>
                      <button
                        onClick={() => {
                          setShowAnalyticsPanel(showAnalyticsPanel === "capacity" ? null : "capacity");
                          setShowPlanningDropdown(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                          showAnalyticsPanel === "capacity"
                            ? "text-primary-400 bg-primary-500/10"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <Users2 className="h-4 w-4 text-emerald-400" />
                        Capacity Planning
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Templates */}
              <Link
                href={`/sprints/${projectId}/templates`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm transition"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm transition disabled:opacity-50"
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
                    <div className="absolute right-0 top-full mt-1 w-44 bg-muted border border-border rounded-lg shadow-xl py-1 z-20">
                      <button
                        onClick={() => handleExport("csv")}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-green-400" />
                        Export as CSV
                      </button>
                      <button
                        onClick={() => handleExport("xlsx")}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                        Export as Excel
                      </button>
                      <button
                        onClick={() => handleExport("pdf")}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <FileType className="h-4 w-4 text-red-400" />
                        Export as PDF
                      </button>
                      <button
                        onClick={() => handleExport("json")}
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
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
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="h-5 w-5" />
              </button>

              {/* Settings */}
              <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
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
              filterOptions={{
                ...filterOptions,
                epics: filterOptions.epics.map((e) => {
                  const epic = epics?.find((ep: EpicListItem) => ep.id === e.id);
                  return { id: e.id, name: epic?.title || e.name };
                }),
              }}
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
            className="border-b border-border bg-primary-100 dark:bg-primary-900/30 overflow-hidden z-50 relative"
          >
            <div className="px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground font-medium">
                  {selectedCount} task{selectedCount > 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={clearSelection}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
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
                    className="px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkMoveMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Move to Sprint
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showSprintDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-muted border border-border rounded-lg shadow-xl py-1 z-50">
                      {sprints
                        .filter((s) => s.status !== "completed")
                        .map((sprint) => (
                          <button
                            key={sprint.id}
                            onClick={() => bulkMoveMutation.mutate({ targetSprintId: sprint.id })}
                            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                          >
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full",
                                SPRINT_STATUS_COLORS[sprint.status] || "bg-muted-foreground"
                              )}
                            />
                            {sprint.name}
                          </button>
                        ))}
                      {sprints.filter((s) => s.status !== "completed").length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No active sprints</div>
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
                    className="px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkStatusMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Change Status
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showStatusDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-muted border border-border rounded-lg shadow-xl py-1 z-50">
                      {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof STATUS_CONFIG[TaskStatus]][]).map(
                        ([status, config]) => (
                          <button
                            key={status}
                            onClick={() => bulkStatusMutation.mutate({ status })}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                          >
                            <span className={cn("w-2 h-2 rounded-full", config.bgColor, config.color)} />
                            <span className="text-foreground">{config.label}</span>
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
                    className="px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {bulkAssignMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Assign
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showAssignDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-muted border border-border rounded-lg shadow-xl py-1 z-50 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => bulkAssignMutation.mutate({ developerId: null })}
                        className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent flex items-center gap-2"
                      >
                        <UserX className="w-4 h-4" />
                        Unassign
                      </button>
                      <div className="border-t border-border my-1" />
                      {mentionUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => bulkAssignMutation.mutate({ developerId: user.id })}
                          className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                        >
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.name}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                              <User className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                          {user.name}
                        </button>
                      ))}
                      {mentionUsers.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No team members</div>
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

      {/* Sprint Goal Banner */}
      {activeSprint?.goal && (
        <div className="px-4 py-2 border-b border-border bg-primary-500/5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary-500 flex-shrink-0" />
            <span className="text-sm text-foreground font-medium">Sprint Goal:</span>
            <span className="text-sm text-muted-foreground truncate">{activeSprint.goal}</span>
          </div>
        </div>
      )}

      {/* Analytics Panel (collapsible) */}
      <AnimatePresence>
        {showAnalyticsPanel && activeSprint && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border overflow-hidden"
          >
            <div className="p-4 max-h-[400px] overflow-y-auto">
              {showAnalyticsPanel === "cycle-time" && (
                <CycleTimeChart sprintId={activeSprint.id} />
              )}
              {showAnalyticsPanel === "capacity" && (
                <CapacityPlanner sprintId={activeSprint.id} />
              )}
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
                className="flex-shrink-0 w-[300px] bg-muted/30 rounded-xl p-3"
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
                        onDeleteTask={handleArchiveTask}
                        isOver={overId === sprint.id}
                        onSelect={toggleTask}
                        isSelected={isSelected}
                      />
                    ))}

                  {/* Completed sprints section (collapsed by default) */}
                  {sprints.filter((s) => s.status === "completed").length > 0 && (
                    <div className="flex-shrink-0 w-[60px] rounded-xl bg-muted/30 border border-border/50 p-2">
                      <div className="flex flex-col items-center gap-2">
                        <span
                          className="text-xs font-medium text-muted-foreground writing-mode-vertical"
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
                    onDeleteTask={handleArchiveTask}
                    onStatusChange={handleQuickStatusChange}
                    showSprintBadge={true}
                    isOver={overId === status}
                    onSelect={toggleTask}
                    isSelected={isSelected}
                    wipLimit={wipLimits[status] ?? null}
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
      <div className="flex-shrink-0 border-t border-border bg-muted/30 px-4 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded text-muted-foreground">⌘K</kbd> Search
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded text-muted-foreground">C</kbd> Create task
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded text-muted-foreground">Shift+Click</kbd> Select
            </span>
          </div>
          <div>
            <span>Press <kbd className="px-1.5 py-0.5 bg-accent rounded text-muted-foreground">?</kbd> for all shortcuts</span>
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
            onClose={handleCloseTaskModal}
            onUpdate={updateTask}
            onDelete={archiveTask}
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

      {/* Planning Poker Modal */}
      <AnimatePresence>
        {showPlanningPoker && currentWorkspaceId && (
          <PlanningPoker
            sprintId={activeSprint?.id || ""}
            userId={user?.id || ""}
            userName={user?.name || "Anonymous"}
            onClose={() => {
              setShowPlanningPoker(false);
              queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
              queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
            }}
          />
        )}
        {showAutoAssignConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAutoAssignConfirm(false)}>
            <div className="bg-muted border border-border rounded-xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-2">Auto-Assign Tasks</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will use AI to assign unassigned tasks based on developer skills and capacity.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setShowAutoAssignConfirm(false)}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!activeSprint) return;
                    setIsAutoAssigning(true);
                    try {
                      const result = await sprintApi.autoAssign(activeSprint.id);
                      toast.success(`Assigned ${result.total_assigned} tasks. Skipped ${result.total_skipped}.`);
                      queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
                      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
                    } catch {
                      toast.error("Auto-assign failed. Please try again.");
                    } finally {
                      setIsAutoAssigning(false);
                      setShowAutoAssignConfirm(false);
                    }
                  }}
                  disabled={isAutoAssigning}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {isAutoAssigning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isAutoAssigning ? "Assigning..." : "Auto-Assign"}
                </button>
              </div>
            </div>
          </div>
        )}
        {showImportTasks && importTargetSprint && (
          <ImportTasksModal
            projectId={projectId}
            targetSprintId={importTargetSprint.id}
            targetSprintName={importTargetSprint.name}
            sprints={sprints}
            onClose={() => {
              setShowImportTasks(false);
              setImportTargetSprint(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
