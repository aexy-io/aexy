"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Calendar,
  Flag,
  Hash,
  Target,
  User as UserIcon,
  Clock3,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { validateDateRange } from "@/lib/datetime";
import { useShortcut } from "@/hooks/useKeyboardShortcuts";
import {
  SprintListItem,
  TaskPriority,
  TaskStatus,
  EpicListItem,
  TaskStatusConfig,
} from "@/lib/api";

export interface AddWorkspaceTaskModalProps {
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    project_id: string;
    sprint_id?: string | null;
    description?: string;
    story_points?: number;
    priority: TaskPriority;
    status?: TaskStatus;
    status_id?: string;
    epic_id?: string;
    assignee_id?: string;
    start_date?: string;
    end_date?: string;
    estimated_hours?: number;
  }) => Promise<unknown>;
  isSubmitting: boolean;
  projects: { id: string; name: string; color?: string }[];
  sprints: SprintListItem[];
  epics?: EpicListItem[];
  assignees?: { id: string; name: string; avatar?: string }[];
  customStatuses?: TaskStatusConfig[];
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
  defaultStatusId?: string;
  // When set, the status field renders as a locked chip (not a dropdown) — the
  // modal was launched from a specific column and the caller wants the new
  // task to land in that column.
  lockStatus?: boolean;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; dot: string }[] = [
  { value: "critical", label: "Critical", dot: "bg-red-500" },
  { value: "high", label: "High", dot: "bg-orange-500" },
  { value: "medium", label: "Medium", dot: "bg-yellow-500" },
  { value: "low", label: "Low", dot: "bg-muted-foreground" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "done", label: "Done" },
];

export function AddWorkspaceTaskModal({
  onClose,
  onSubmit,
  isSubmitting,
  projects,
  sprints,
  epics = [],
  assignees = [],
  customStatuses = [],
  defaultProjectId,
  defaultStatus = "todo",
  defaultStatusId,
  lockStatus = false,
}: AddWorkspaceTaskModalProps) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
  const [sprintId, setSprintId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [statusId, setStatusId] = useState<string | undefined>(defaultStatusId);
  const [epicId, setEpicId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Persist the last-used project so the next quick-add lands on the same
  // project without re-selecting. Scoped to the user's browser only.
  useEffect(() => {
    if (projectId) {
      try {
        localStorage.setItem("aexy:workspaceTasks:lastProjectId", projectId);
      } catch {
        // Safari private mode etc. — silently skip.
      }
    }
  }, [projectId]);

  useShortcut("escape", onClose, { enabled: !isSubmitting });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) {
      setError(dateError);
      return;
    }
    try {
      await onSubmit({
        title: title.trim(),
        project_id: projectId,
        sprint_id: sprintId || null,
        priority,
        status,
        status_id: statusId,
        epic_id: epicId || undefined,
        assignee_id: assigneeId || undefined,
        story_points: storyPoints ? parseInt(storyPoints, 10) : undefined,
        start_date: startDate ? new Date(startDate).toISOString() : undefined,
        end_date: endDate ? new Date(endDate).toISOString() : undefined,
        estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      });
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err, "Could not create task.");
      setError(msg);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-background/70 backdrop-blur-sm px-3 sm:px-0 pb-3 sm:pb-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <motion.form
        onSubmit={submit}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative w-full max-w-xl rounded-2xl border border-border bg-muted/95 backdrop-blur-xl shadow-2xl shadow-black/40",
          "ring-1 ring-white/5",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              New task
            </h2>
            {lockStatus && (
              <StatusChip status={status} customStatuses={customStatuses} statusId={statusId} />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <div className="px-5 pt-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className={cn(
              "w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/70",
              "text-[15px] leading-snug font-medium",
              "focus:outline-none focus:ring-0",
            )}
            maxLength={500}
          />
        </div>

        {/* Field grid — dense, two-column on >=sm */}
        <div className="px-5 pt-3 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field icon={<Target className="h-3.5 w-3.5" />} label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={fieldInputClasses}
              required
            >
              {projects.length === 0 ? (
                <option value="">No projects</option>
              ) : (
                <>
                  {!defaultProjectId && <option value="">Select…</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>

          <Field icon={<Hash className="h-3.5 w-3.5" />} label="Sprint">
            <select
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              className={fieldInputClasses}
            >
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          {!lockStatus && (
            <Field icon={<span className="h-2 w-2 rounded-full bg-primary-500" />} label="Status">
              {customStatuses.length > 0 ? (
                <select
                  value={statusId ?? ""}
                  onChange={(e) => setStatusId(e.target.value || undefined)}
                  className={fieldInputClasses}
                >
                  <option value="">Default</option>
                  {customStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className={fieldInputClasses}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className={fieldInputClasses}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={<UserIcon className="h-3.5 w-3.5" />} label="Assignee">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={fieldInputClasses}
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={<Hash className="h-3.5 w-3.5" />} label="Points">
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="—"
              className={fieldInputClasses}
            />
          </Field>

          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Start">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={fieldInputClasses}
            />
          </Field>

          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Due">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={fieldInputClasses}
            />
          </Field>

          <Field icon={<Clock3 className="h-3.5 w-3.5" />} label="Estimate (h)" wide={epics.length === 0}>
            <input
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="—"
              className={fieldInputClasses}
            />
          </Field>

          {epics.length > 0 && (
            <Field icon={<Target className="h-3.5 w-3.5" />} label="Epic">
              <select
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                className={fieldInputClasses}
              >
                <option value="">None</option>
                {epics.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-background/40 rounded-b-2xl">
          <div className="text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] tracking-wider">⌘</kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] tracking-wider">Enter</kbd>
            <span className="ml-2 opacity-70">to create</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !projectId}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-tight",
                "bg-primary-500 text-white hover:bg-primary-400 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "ring-1 ring-primary-500/40",
              )}
            >
              {isSubmitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </motion.form>
    </motion.div>
  );
}

const fieldInputClasses = cn(
  "w-full bg-background/40 border border-border/70 rounded-md px-2 py-1.5",
  "text-xs text-foreground placeholder:text-muted-foreground/70",
  "focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/50",
  "transition-colors",
);

function Field({
  icon,
  label,
  children,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80 font-medium">
        <span className="opacity-80">{icon}</span>
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusChip({
  status,
  customStatuses,
  statusId,
}: {
  status: TaskStatus;
  customStatuses: TaskStatusConfig[];
  statusId?: string;
}) {
  const custom = customStatuses.find((s) => s.id === statusId);
  const label = custom
    ? custom.name
    : STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return (
    <span
      className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
      title="Status is locked because the modal was opened from this column"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={custom?.color ? { backgroundColor: custom.color } : undefined}
      />
      {label}
    </span>
  );
}

/**
 * Inline quick-add row used inside each Kanban column. Collapsed into a
 * single "+ New task" button; expands into a one-line input that submits on
 * Enter and refocuses for rapid sequential entry.
 *
 * This component intentionally only collects title + uses the column's status
 * and a caller-supplied default project. Anything more belongs in the modal.
 */
export function InlineQuickAddRow({
  defaultProjectId,
  status,
  statusId,
  onSubmit,
  isSubmitting,
  placeholder = "+ New task",
}: {
  defaultProjectId: string | null;
  status: TaskStatus;
  statusId?: string;
  onSubmit: (payload: {
    title: string;
    project_id: string;
    status: TaskStatus;
    status_id?: string;
  }) => Promise<unknown>;
  isSubmitting: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const title = value.trim();
    if (!title) {
      setOpen(false);
      return;
    }
    if (!defaultProjectId) {
      // No project to attach the task to — the caller's UI should warn the
      // user. Don't error inline; just keep the row open so they can retry.
      return;
    }
    try {
      await onSubmit({ title, project_id: defaultProjectId, status, status_id: statusId });
      setValue("");
      // Refocus for rapid entry — Trello pattern.
      inputRef.current?.focus();
    } catch {
      // Toast is shown by the mutation hook; keep the row open and the text.
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!defaultProjectId}
        className={cn(
          "group w-full flex items-center justify-center gap-1.5 py-2 rounded-lg",
          "text-[11px] font-medium text-muted-foreground/70 hover:text-foreground",
          "border border-dashed border-border/40 hover:border-primary-500/40 hover:bg-primary-500/5",
          "transition-colors",
          !defaultProjectId && "opacity-40 cursor-not-allowed hover:bg-transparent hover:border-border/40",
        )}
        title={!defaultProjectId ? "Pick a project from the filter bar first" : undefined}
      >
        {placeholder}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-primary-500/40 bg-background/60 shadow-sm">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setValue("");
          }
        }}
        onBlur={() => {
          // If the input is empty when blurred, collapse — but keep the row
          // open during a submit so we don't fight the refocus().
          if (!value.trim() && !isSubmitting) {
            setOpen(false);
          }
        }}
        placeholder="Title… (Enter to add, Esc to cancel)"
        disabled={isSubmitting}
        className={cn(
          "w-full bg-transparent border-none outline-none px-3 py-2",
          "text-[13px] text-foreground placeholder:text-muted-foreground/60",
          "focus:outline-none focus:ring-0",
        )}
        maxLength={500}
      />
    </div>
  );
}
