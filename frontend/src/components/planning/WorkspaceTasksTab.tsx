"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence } from "framer-motion";
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
  ChevronDown,
  Filter,
  Folder,
  Layers,
  Search,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/premium-card";
import { TaskCardPremium } from "@/components/planning/TaskCardPremium";
import {
  useWorkspaceTasks,
  WorkspaceTaskWithMeta,
} from "@/hooks/useWorkspaceTasks";
import {
  SprintTask,
  TaskPriority,
  TaskStatus,
} from "@/lib/api";
import { TASK_STATUS_COLORS } from "@/lib/statusColors";

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
 * status transitions.
 */
function KanbanColumn({
  status,
  label,
  emptyLabel,
  tasks,
  onTaskClick,
}: {
  status: TaskStatus;
  label: string;
  emptyLabel: string;
  tasks: WorkspaceTaskWithMeta[];
  onTaskClick: (task: SprintTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tone = TASK_STATUS_COLORS[status];
  const totalPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[320px] rounded-xl transition-all duration-200",
        tone.bg,
        isOver && "ring-2 ring-primary-500/50 bg-primary-900/20",
      )}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-medium text-sm", tone.text)}>{label}</h3>
          <Badge variant="default" size="sm">
            {tasks.length}
          </Badge>
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-muted-foreground">{totalPoints} SP</span>
        )}
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-340px)] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {tasks.map((task) => (
              <TaskCardPremium
                key={task.id}
                task={task}
                onClick={onTaskClick}
                showSprintBadge
                showTeamBadge
              />
            ))}
          </AnimatePresence>
          {tasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {emptyLabel}
            </div>
          )}
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

  const {
    filteredTasks,
    tasksByStatus,
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters,
    filterOptions,
    isLoading,
    updateTaskStatus,
    truncated,
  } = useWorkspaceTasks(workspaceId);

  // Precompute localized labels so we pass plain strings down to dumb children.
  const statusLabel = useMemo<Record<TaskStatus, string>>(
    () => ({
      backlog: tStatus(STATUS_I18N_KEY.backlog),
      todo: tStatus(STATUS_I18N_KEY.todo),
      in_progress: tStatus(STATUS_I18N_KEY.in_progress),
      review: tStatus(STATUS_I18N_KEY.review),
      done: tStatus(STATUS_I18N_KEY.done),
    }),
    [tStatus],
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
    let targetStatus: TaskStatus | undefined = STATUSES.find((s) => s === dropTargetId);
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
    // For v1, link to the task's project board where the user can edit it
    // — avoids duplicating the full task detail modal here. Use the Next.js
    // router so this stays a client-side transition (no full reload).
    if (task.team_id) {
      router.push(`/sprints/${task.team_id}/board?task=${task.id}`);
    }
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

        <PriorityDropdown
          selected={filters.priorities}
          onChange={(priorities) => updateFilters({ priorities })}
          buttonLabel={t("priority")}
          optionLabels={priorityLabel}
        />

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

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          {filteredTasks.length === 1
            ? t("taskCount", { count: filteredTasks.length })
            : t("taskCountPlural", { count: filteredTasks.length })}
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
        <div className="grid grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <div key={s} className="h-96 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-xl border border-dashed border-border">
          <h3 className="text-foreground font-medium mb-2">{t("noTasksFound")}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {hasActiveFilters
              ? t("noTasksHintFiltered")
              : t("noTasksHintEmpty")}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm"
            >
              {t("clearFilters")}
            </button>
          ) : (
            <Link
              href="/sprints"
              className="inline-block px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm"
            >
              {t("goToProjects")}
            </Link>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                label={statusLabel[status]}
                emptyLabel={t("dropTasksHere")}
                tasks={tasksByStatus[status]}
                onTaskClick={handleTaskClick}
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
    </div>
  );
}

