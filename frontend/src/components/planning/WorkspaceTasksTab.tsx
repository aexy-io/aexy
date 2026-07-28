"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  AlertCircle,
  ArchiveRestore,
  ChevronDown,
  Filter,
  Folder,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  Settings2,
  Table2,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/premium-card";
import { TaskCardPremium } from "@/components/planning/TaskCardPremium";
import {
  useWorkspaceTasks,
  WorkspaceTaskWithMeta,
  WorkspaceTasksView,
} from "@/hooks/useWorkspaceTasks";
import { useUnarchiveTask } from "@/hooks/useUnarchiveTask";
import { useQuery } from "@tanstack/react-query";
import {
  SprintTask,
  TaskPriority,
  TaskStatus,
  workspaceTasksApi,
} from "@/lib/api";
import {
  EditTaskModal,
  EditTaskModalProps,
} from "@/components/sprints/EditTaskModal";
import { MentionUser } from "@/components/planning/TaskDescriptionEditor";
import { TASK_STATUS_COLORS } from "@/lib/statusColors";
import {
  AddWorkspaceTaskModal,
  InlineQuickAddRow,
} from "@/components/planning/AddWorkspaceTaskModal";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useShortcut } from "@/hooks/useKeyboardShortcuts";
import { useTaskStatuses } from "@/hooks/useTaskConfig";
import { useTasksLayout } from "@/hooks/useTasksLayout";
import { TaskTableView } from "@/components/planning/TaskTableView";

const KANBAN_ROW_CLASSES =
  "flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-4";

interface WorkspaceTasksTabProps {
  workspaceId: string | null;
}

const STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];

// Maps a TaskStatus slug to the i18n key used in `sprints.taskStatus.*`. Keeps
// the translation lookup data-driven so labels switch with the active locale.
const STATUS_I18N_KEY: Record<TaskStatus, string> = {
  backlog: "backlog",
  todo: "todo",
  in_progress: "inProgress",
  review: "review",
  done: "done",
};

const PRIORITY_OPTIONS: { value: TaskPriority; color: string }[] = [
  { value: "critical", color: "bg-red-500" },
  { value: "high", color: "bg-orange-500" },
  { value: "medium", color: "bg-yellow-500" },
  { value: "low", color: "bg-muted-foreground" },
];

/**
 * Dropdown with checkboxes for multi-select filters. Self-contained — closes
 * on outside click via a fixed backdrop.
 */
function MultiSelectDropdown({
  label,
  icon,
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  label: string;
  icon: React.ReactNode;
  options: { id: string; name: string; avatar?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors",
          selected.length > 0
            ? "bg-primary-500/20 border-primary-500/50 text-primary-300"
            : "bg-muted border-border text-foreground hover:border-muted-foreground",
        )}
      >
        {icon}
        <span>{label}</span>
        {selected.length > 0 && (
          <Badge variant="info" size="sm">
            {selected.length}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 ml-1" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] max-h-64 overflow-y-auto bg-muted/95 backdrop-blur-xl border border-border rounded-lg shadow-xl py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
            ) : (
              options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      selected.includes(o.id)
                        ? "bg-primary-500 border-primary-500"
                        : "border-border",
                    )}
                  >
                    {selected.includes(o.id) && (
                      <svg
                        className="h-3 w-3 text-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {o.avatar ? (
                    <Image
                      src={o.avatar}
                      alt={o.name}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  ) : null}
                  <span className="text-foreground truncate">{o.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PriorityDropdown({
  selected,
  onChange,
  buttonLabel,
  optionLabels,
}: {
  selected: TaskPriority[];
  onChange: (next: TaskPriority[]) => void;
  buttonLabel: string;
  optionLabels: Record<TaskPriority, string>;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (p: TaskPriority) =>
    onChange(selected.includes(p) ? selected.filter((s) => s !== p) : [...selected, p]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors",
          selected.length > 0
            ? "bg-primary-500/20 border-primary-500/50 text-primary-300"
            : "bg-muted border-border text-foreground hover:border-muted-foreground",
        )}
      >
        <AlertCircle className="h-4 w-4" />
        <span>{buttonLabel}</span>
        {selected.length > 0 && (
          <Badge variant="info" size="sm">
            {selected.length}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 ml-1" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-muted/95 backdrop-blur-xl border border-border rounded-lg shadow-xl py-1">
            {PRIORITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center",
                    selected.includes(o.value)
                      ? "bg-primary-500 border-primary-500"
                      : "border-border",
                  )}
                >
                  {selected.includes(o.value) && (
                    <svg
                      className="h-3 w-3 text-foreground"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className={cn("w-2 h-2 rounded-full", o.color)} />
                <span className="text-foreground">{optionLabels[o.value]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Single Kanban column for the workspace board. Droppable for drag-drop
 * status transitions. Also hosts:
 *   - a header "+" button that opens the full modal pre-filtered to this column
 *   - an inline quick-add row at the bottom (Trello/Linear pattern)
 */
function KanbanColumn({
  status,
  label,
  emptyLabel,
  tasks,
  onTaskClick,
  onOpenAddModal,
  onInlineCreate,
  isCreating,
  defaultProjectId,
  selectedIds,
  onToggleSelected,
}: {
  status: TaskStatus;
  label: string;
  emptyLabel: string;
  tasks: WorkspaceTaskWithMeta[];
  onTaskClick: (task: SprintTask) => void;
  onOpenAddModal: (status: TaskStatus) => void;
  onInlineCreate: (payload: {
    title: string;
    project_id: string;
    status: TaskStatus;
  }) => Promise<unknown>;
  isCreating: boolean;
  defaultProjectId: string | null;
  selectedIds: Set<string>;
  onToggleSelected: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tone = TASK_STATUS_COLORS[status] ?? TASK_STATUS_COLORS.backlog;
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/col flex-shrink-0 w-full md:w-[320px] rounded-xl transition-all duration-200",
        tone.bg,
        isOver && "ring-2 ring-primary-500/50 bg-primary-900/20",
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b border-border/30 backdrop-blur-md bg-background/40 rounded-t-xl">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-medium text-sm", tone.text)}>{label}</h3>
          <Badge variant="default" size="sm">
            {tasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {totalPoints > 0 && (
            <span className="text-xs text-muted-foreground">{totalPoints} SP</span>
          )}
          <button
            type="button"
            onClick={() => onOpenAddModal(status)}
            className={cn(
              "opacity-0 group-hover/col:opacity-100 transition-opacity",
              "p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50",
              "focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary-500/60",
            )}
            title={`Add to ${label}`}
            aria-label={`Add task to ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 min-h-[120px] md:min-h-[200px] md:max-h-[calc(100vh-340px)] md:overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {tasks.map((task) => (
              <TaskCardPremium
                key={task.id}
                task={task}
                onClick={onTaskClick}
                showSprintBadge
                showTeamBadge
                isSelected={selectedIds.has(task.id)}
                onSelect={onToggleSelected}
              />
            ))}
          </AnimatePresence>
          {tasks.length === 0 && (
            <div className="text-center py-6 text-muted-foreground/70 text-xs">
              {emptyLabel}
            </div>
          )}
          <InlineQuickAddRow
            defaultProjectId={defaultProjectId}
            status={status}
            onSubmit={async (payload) => {
              await onInlineCreate(payload);
            }}
            isSubmitting={isCreating}
          />
        </div>
      </SortableContext>
    </div>
  );
}

export function WorkspaceTasksTab({ workspaceId }: WorkspaceTasksTabProps) {
  const t = useTranslations("sprints.workspaceTasks");
  const tStatus = useTranslations("sprints.taskStatus");
  const tPriority = useTranslations("sprints.priority");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active vs archived task view. Persisted in the URL via `?view=archived` so
  // refresh and link-share round-trip cleanly. Archived view forces table
  // layout — kanban columns make no sense for archived rows.
  const [view, setView] = useState<WorkspaceTasksView>(
    (searchParams.get("view") as WorkspaceTasksView) === "archived"
      ? "archived"
      : "active",
  );

  const {
    tasks,
    filteredTasks,
    tasksByStatus,
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters,
    filterOptions,
    isLoading,
    updateTaskStatus,
    createTask,
    isCreatingTask,
    updateTask,
    isUpdatingTask,
    archiveTask,
    projects,
    sprints,
    epics,
    truncated,
  } = useWorkspaceTasks(workspaceId, view);

  const unarchiveMutation = useUnarchiveTask(workspaceId);

  const { members } = useWorkspaceMembers(workspaceId);

  // The default project drives the inline quick-add (which doesn't show a
  // project picker). Order of precedence:
  //   1. If a single project is filtered in, use it.
  //   2. Else read the last project the user successfully added to from
  //      localStorage (set by AddWorkspaceTaskModal).
  //   3. Else the first project in the workspace.
  const defaultProjectId = useMemo(() => {
    if (filters.teams.length === 1) return filters.teams[0];
    try {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem("aexy:workspaceTasks:lastProjectId")
        : null;
      if (stored && projects.some((p) => p.id === stored)) return stored;
    } catch {
      // localStorage unavailable — fall through.
    }
    return projects[0]?.id ?? null;
  }, [filters.teams, projects]);

  // When exactly one project is filtered in we scope the kanban to that
  // project's statuses (including any custom buckets); otherwise we render
  // the workspace defaults. `task.status` is still a slug string, so the
  // tasksByStatus map indexes the right column regardless.
  const scopedProjectId =
    filters.teams.length === 1 ? filters.teams[0] : null;
  const { statuses: projectStatuses } = useTaskStatuses(workspaceId, scopedProjectId);

  // Layout state is per-workspace (one preference for the All-Tasks tab,
  // independent of any project-board layout pick).
  const [tasksLayout, setTasksLayout] = useTasksLayout("workspaceTasks", "board");

  const [addModalStatus, setAddModalStatus] = useState<TaskStatus | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const applyBulkStatus = async (next: TaskStatus) => {
    // Fire N updates in parallel. Cost is N round-trips; a workspace-level
    // bulk-status endpoint would collapse to one — tracked as a follow-up.
    await Promise.allSettled(
      Array.from(visibleSelectedIds).map((taskId) =>
        updateTaskStatus({ taskId, status: next }),
      ),
    );
    clearSelection();
  };

  // Drop selected ids that aren't in the current filtered view so the
  // toolbar's "N selected" count matches what the user can see and the
  // bulk action doesn't no-op on hidden rows.
  const visibleSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return selectedIds;
    const visible = new Set(filteredTasks.map((t) => t.id));
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visible.has(id)) next.add(id);
    });
    return next;
  }, [selectedIds, filteredTasks]);

  const handleUnarchive = async (task: SprintTask) => {
    if (!task.team_id) return;
    await unarchiveMutation.mutateAsync({ teamId: task.team_id, taskId: task.id });
  };
  const applyBulkUnarchive = async () => {
    const toRestore = filteredTasks.filter(
      (t) => visibleSelectedIds.has(t.id) && t.team_id,
    );
    await Promise.allSettled(
      toRestore.map((t) =>
        unarchiveMutation.mutateAsync({ teamId: t.team_id!, taskId: t.id }),
      ),
    );
    clearSelection();
  };

  // Sync filter state ↔ URL. We persist a small whitelist of filter dimensions
  // (`q`, `assignee`, `priority`, `team`, `sprint`) plus the `tab` so refreshing
  // the page or sharing the link reproduces the same view. Reading happens on
  // mount; writing happens whenever filters change.
  const initialUrlSyncedRef = useRef(false);
  useEffect(() => {
    if (initialUrlSyncedRef.current) return;
    initialUrlSyncedRef.current = true;
    const q = searchParams.get("q") || "";
    const assignees = searchParams.getAll("assignee");
    const priorities = searchParams.getAll("priority") as TaskPriority[];
    const teams = searchParams.getAll("team");
    const sprintsFromUrl = searchParams.getAll("sprint");
    if (q || assignees.length || priorities.length || teams.length || sprintsFromUrl.length) {
      updateFilters({
        search: q,
        assignees,
        priorities,
        teams,
        sprints: sprintsFromUrl,
      });
    }
    // We deliberately depend on nothing beyond searchParams — we hydrate once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the URL write so the search field doesn't push a `router.replace`
  // on every keystroke. We deliberately don't take `searchParams` as a
  // dep — it changes after every replace and would create a feedback loop;
  // we re-read the current URL inline.
  useEffect(() => {
    if (!initialUrlSyncedRef.current) return;
    const handle = setTimeout(() => {
      const current = window.location.search.replace(/^\?/, "");
      const params = new URLSearchParams(current);
      params.delete("q");
      params.delete("assignee");
      params.delete("priority");
      params.delete("team");
      params.delete("sprint");
      params.delete("view");
      if (filters.search) params.set("q", filters.search);
      filters.assignees.forEach((a) => params.append("assignee", a));
      filters.priorities.forEach((p) => params.append("priority", p));
      filters.teams.forEach((t) => params.append("team", t));
      filters.sprints.forEach((s) => params.append("sprint", s));
      if (view === "archived") params.set("view", "archived");
      const next = params.toString();
      if (next !== current) {
        router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [filters, view, pathname, router]);

  // ---------------------------------------------------------------------------
  // Task detail modal, opened in place on this tab.
  //
  // The id lives in `?task=<id>` so refresh and link-share reopen the same
  // task on top of the same filtered view. `router.replace` (not `push`) keeps
  // it out of the history stack: closing the modal shouldn't need two Backs.
  // ---------------------------------------------------------------------------
  const selectedTaskId = searchParams.get("task");

  const setSelectedTaskId = useCallback(
    (taskId: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (taskId) params.set("task", taskId);
      else params.delete("task");
      const next = params.toString();
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    },
    [pathname, router],
  );

  // Prefer the copy already in the loaded workspace list — it stays in sync
  // with drag/drop and inline edits. Look at the unfiltered `tasks`, not
  // `filteredTasks`, so an active filter doesn't stop a deep link from opening.
  const taskFromList = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : undefined),
    [tasks, selectedTaskId],
  );

  // Not in the list: the task is archived (while we're on the active view, or
  // vice versa), or sits past the 1000-row fetch cap. Resolve it with a
  // one-off archive-inclusive lookup so deep links open regardless of state.
  const needsDirectFetch = !!selectedTaskId && !taskFromList && !isLoading;
  const { data: fetchedTask } = useQuery({
    queryKey: ["workspaceTaskById", workspaceId, selectedTaskId],
    queryFn: async () => {
      const all = await workspaceTasksApi.list(workspaceId!, {
        include_archived: true,
        limit: 1000,
      });
      return all.find((t) => t.id === selectedTaskId) ?? null;
    },
    enabled: needsDirectFetch && !!workspaceId,
    staleTime: 30_000,
  });

  const selectedTask = taskFromList ?? fetchedTask ?? null;

  // Scope the modal's sprint picker to the task's own project — the workspace
  // list spans every project, and offering a sprint from a different project
  // would produce a move the backend rejects.
  const sprintsForSelectedTask = useMemo(
    () =>
      selectedTask?.team_id
        ? sprints.filter((s) => s.team_id === selectedTask.team_id)
        : [],
    [sprints, selectedTask?.team_id],
  );

  const mentionUsers: MentionUser[] = useMemo(
    () =>
      (members || [])
        .filter((m) => m.status === "active")
        .map((m) => ({
          id: m.developer_id,
          name: m.developer_name || m.developer_email?.split("@")[0] || "Unknown",
          avatar_url: m.developer_avatar_url || undefined,
        })),
    [members],
  );

  // The modal's callbacks don't carry a project id (on a board it's implied by
  // the route), so bind the selected task's owning project here.
  const handleUpdateSelectedTask = useCallback<EditTaskModalProps["onUpdate"]>(
    ({ taskId, sprintId, updates }) =>
      updateTask({
        taskId,
        sprintId,
        projectId: selectedTask?.team_id ?? null,
        updates,
      }),
    [updateTask, selectedTask?.team_id],
  );

  const handleDeleteSelectedTask = useCallback<EditTaskModalProps["onDelete"]>(
    async ({ taskId, sprintId }) => {
      await archiveTask({
        taskId,
        sprintId,
        projectId: selectedTask?.team_id ?? null,
      });
    },
    [archiveTask, selectedTask?.team_id],
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  // `n` opens the add-task modal pre-filtered to "To Do"; `/` focuses search.
  // Each modal handles its own Esc. Disabled while any modal is up — the
  // shortcut hook only ignores keystrokes from inputs, so a focused <select>
  // or button inside the task detail would otherwise still trigger these.
  const hotkeysEnabled = addModalStatus === null && !selectedTaskId;
  useShortcut("n", () => setAddModalStatus("todo"), { enabled: hotkeysEnabled });
  useShortcut("/", () => searchInputRef.current?.focus(), { enabled: hotkeysEnabled });

  // Precompute localized labels so we pass plain strings down to dumb children.
  // For canonical slugs we use the i18n catalog; custom project statuses fall
  // through to the row's `name` (already user-supplied, not translatable).
  const statusLabel = useMemo<Record<string, string>>(() => {
    const labels: Record<string, string> = {
      backlog: tStatus(STATUS_I18N_KEY.backlog),
      todo: tStatus(STATUS_I18N_KEY.todo),
      in_progress: tStatus(STATUS_I18N_KEY.in_progress),
      review: tStatus(STATUS_I18N_KEY.review),
      done: tStatus(STATUS_I18N_KEY.done),
    };
    for (const s of projectStatuses) {
      if (!(s.slug in labels)) labels[s.slug] = s.name;
    }
    return labels;
  }, [tStatus, projectStatuses]);

  // Status slugs in render order. Falls back to the canonical five only when
  // the hook hasn't returned rows yet (mid-fetch on first paint).
  const renderStatuses: string[] = useMemo(
    () =>
      projectStatuses.length > 0
        ? projectStatuses.map((s) => s.slug)
        : (STATUSES as string[]),
    [projectStatuses],
  );
  const priorityLabel = useMemo<Record<TaskPriority, string>>(
    () => ({
      critical: tPriority("critical"),
      high: tPriority("high"),
      medium: tPriority("medium"),
      low: tPriority("low"),
    }),
    [tPriority],
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeTask = useMemo(
    () => filteredTasks.find((t) => t.id === activeId),
    [filteredTasks, activeId],
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const taskId = active.id as string;
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) return;

    const dropTargetId = over.id as string;
    // Either dropped directly on a column (status slug) or on a card inside one.
    let targetStatus: TaskStatus | undefined = (
      renderStatuses.find((s) => s === dropTargetId) as TaskStatus | undefined
    );
    if (!targetStatus) {
      const targetTask = filteredTasks.find((t) => t.id === dropTargetId);
      if (targetTask) targetStatus = targetTask.status;
    }
    if (!targetStatus || targetStatus === task.status) return;

    try {
      await updateTaskStatus({ taskId, status: targetStatus });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleTaskClick = (task: SprintTask) => {
    // Open the shared task detail modal right here rather than pushing the
    // user onto the task's project board — that stranded them on a board they
    // never asked for, with no way back to this tab but the browser button,
    // and dropped every filter they'd set up.
    setSelectedTaskId(task.id);
  };

  if (!workspaceId) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("noWorkspace")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t("searchPlaceholder")}
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="w-full pl-9 pr-4 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => updateFilters({ search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <MultiSelectDropdown
          label={t("assignee")}
          icon={<User className="h-4 w-4" />}
          options={filterOptions.assignees}
          selected={filters.assignees}
          onChange={(selected) => updateFilters({ assignees: selected })}
          emptyLabel={t("noOptions")}
        />

        {view === "active" && (
          <PriorityDropdown
            selected={filters.priorities}
            onChange={(priorities) => updateFilters({ priorities })}
            buttonLabel={t("priority")}
            optionLabels={priorityLabel}
          />
        )}

        <MultiSelectDropdown
          label={t("project")}
          icon={<Folder className="h-4 w-4" />}
          options={filterOptions.teams.map((tm) => ({ id: tm.id, name: tm.name }))}
          selected={filters.teams}
          onChange={(teams) => updateFilters({ teams })}
          emptyLabel={t("noOptions")}
        />

        {filterOptions.sprints.length > 0 && (
          <MultiSelectDropdown
            label={t("sprint")}
            icon={<Layers className="h-4 w-4" />}
            options={filterOptions.sprints.map((s) => ({ id: s.id, name: s.name }))}
            selected={filters.sprints}
            onChange={(sprints) => updateFilters({ sprints })}
            emptyLabel={t("noOptions")}
          />
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            {t("clearAll")}
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {filteredTasks.length === 1
              ? t("taskCount", { count: filteredTasks.length })
              : t("taskCountPlural", { count: filteredTasks.length })}
          </div>

          {/* Active vs Archived toggle */}
          <div className="flex items-center bg-muted border border-border rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setView("active")}
              aria-pressed={view === "active"}
              className={cn(
                "px-2 py-1 rounded-md transition-all",
                view === "active"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("viewActive")}
            </button>
            <button
              onClick={() => setView("archived")}
              aria-pressed={view === "archived"}
              className={cn(
                "px-2 py-1 rounded-md transition-all",
                view === "archived"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("viewArchived")}
            </button>
          </div>

          {/* Board vs Table layout toggle — hidden in archive view since
              archived tasks are always rendered as a flat table. */}
          {view === "active" && (
            <div className="flex items-center bg-muted border border-border rounded-lg p-0.5">
              <button
                onClick={() => setTasksLayout("board")}
                title={t("viewBoard")}
                aria-pressed={tasksLayout === "board"}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                  tasksLayout === "board"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTasksLayout("table")}
                title={t("viewTable")}
                aria-pressed={tasksLayout === "table"}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                  tasksLayout === "table"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {view === "active" && filters.teams.length === 1 && (
            <Link
              href={`/settings/projects/${filters.teams[0]}/statuses`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              title="Edit this project's status columns"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Columns
            </Link>
          )}
          {view === "active" && (
          <button
            type="button"
            onClick={() => setAddModalStatus("todo")}
            disabled={projects.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
              "bg-primary-500 text-white hover:bg-primary-400 transition-colors",
              "ring-1 ring-primary-500/40",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            title="Add task — N"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addTask")}
          </button>
          )}
        </div>
      </div>

      {truncated && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{t("truncatedNotice", { limit: 1000 })}</span>
        </div>
      )}

      {/* Kanban */}
      {isLoading ? (
        <div className={KANBAN_ROW_CLASSES}>
          {renderStatuses.map((s, colIdx) => (
            <div
              key={s}
              className="flex-shrink-0 w-full md:w-[320px] rounded-xl bg-muted/30 border border-border/30 overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-3 border-b border-border/30 bg-background/30">
                <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-6 rounded bg-muted/60 animate-pulse" />
              </div>
              <div className="p-2 space-y-2">
                {Array.from({ length: 3 - (colIdx % 3) }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-lg bg-muted/50 animate-pulse"
                    style={{ animationDelay: `${(colIdx * 3 + i) * 80}ms` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : view === "archived" ? (
        <TaskTableView
          tasks={filteredTasks}
          statuses={projectStatuses}
          onRowClick={handleTaskClick}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          showSprintColumn
          emptyLabel={t("noArchivedTasks")}
          rowActions={(task) => (
            <button
              type="button"
              onClick={() => handleUnarchive(task)}
              disabled={unarchiveMutation.isPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50"
              title={t("unarchive")}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              {t("unarchive")}
            </button>
          )}
        />
      ) : tasksLayout === "table" ? (
        <TaskTableView
          tasks={filteredTasks}
          statuses={projectStatuses}
          onRowClick={handleTaskClick}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          showSprintColumn
        />
      ) : filteredTasks.length === 0 && hasActiveFilters ? (
        // Filters are active and matched nothing → offer to clear. We only
        // hide the kanban here, not on a truly-empty workspace, so the user
        // can always reach the per-column quick-add to create their first task.
        <div className="text-center py-20 bg-muted/30 rounded-xl border border-dashed border-border">
          <h3 className="text-foreground font-medium mb-2">{t("noTasksFound")}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {t("noTasksHintFiltered")}
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm"
          >
            {t("clearFilters")}
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={KANBAN_ROW_CLASSES}>
            {renderStatuses.map((status) => (
              <KanbanColumn
                key={status}
                status={status as TaskStatus}
                label={statusLabel[status] ?? status}
                emptyLabel={t("dropTasksHere")}
                tasks={tasksByStatus[status] ?? []}
                onTaskClick={handleTaskClick}
                onOpenAddModal={(s) => setAddModalStatus(s)}
                onInlineCreate={async (payload) => {
                  await createTask(payload);
                }}
                isCreating={isCreatingTask}
                defaultProjectId={defaultProjectId}
                selectedIds={visibleSelectedIds}
                onToggleSelected={toggleSelected}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="opacity-90 rotate-1">
                <TaskCardPremium
                  task={activeTask}
                  isDragging
                  showSprintBadge
                  showTeamBadge
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <AnimatePresence>
        {visibleSelectedIds.size > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/5"
            role="region"
            aria-label="Bulk actions"
          >
            <span className="px-2 text-xs font-medium text-foreground">
              {visibleSelectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border/60" />
            {view === "archived" ? (
              <button
                type="button"
                onClick={() => void applyBulkUnarchive()}
                disabled={unarchiveMutation.isPending}
                className="inline-flex items-center gap-1 bg-background/60 border border-border/60 rounded-md px-2 py-1 text-xs text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                {t("unarchiveBulk")}
              </button>
            ) : (
              <select
                defaultValue=""
                onChange={(e) => {
                  const next = e.target.value as TaskStatus;
                  if (!next) return;
                  void applyBulkStatus(next);
                  e.target.value = "";
                }}
                className="bg-background/60 border border-border/60 rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {renderStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s] ?? s}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="ml-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addModalStatus !== null && (
          <AddWorkspaceTaskModal
            onClose={() => setAddModalStatus(null)}
            onSubmit={async (payload) => {
              await createTask(payload);
            }}
            isSubmitting={isCreatingTask}
            projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
            sprints={sprints}
            assignees={(members || [])
              .filter((m) => m.developer_name)
              .map((m) => ({
                id: m.developer_id,
                name: m.developer_name as string,
                avatar: m.developer_avatar_url || undefined,
              }))}
            defaultProjectId={defaultProjectId || undefined}
            defaultStatus={addModalStatus}
            lockStatus
          />
        )}
      </AnimatePresence>

      {/* Task detail — the same modal the project boards use, opened in place
          so the user keeps this tab's filters and scroll position. */}
      <AnimatePresence>
        {selectedTask && (
          <EditTaskModal
            // Keyed by id so switching tasks remounts the form instead of
            // carrying the previous task's field state (the modal seeds its
            // state from props once, on mount).
            key={selectedTask.id}
            task={selectedTask}
            onClose={() => setSelectedTaskId(null)}
            onUpdate={handleUpdateSelectedTask}
            onDelete={handleDeleteSelectedTask}
            isUpdating={isUpdatingTask}
            sprints={sprintsForSelectedTask}
            epics={epics}
            users={mentionUsers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

