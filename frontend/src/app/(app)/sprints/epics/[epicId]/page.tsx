"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { redirect, useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Flag,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SearchInput } from "@/components/ui/search-input";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  useEpic,
  useEpicBurndown,
  useEpicDetail,
  useEpicProgress,
  useEpicTasks,
  useEpicTimeline,
} from "@/hooks/useEpics";
import { EpicStatus, EpicPriority, SprintTask, workspaceTasksApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<EpicStatus, string> = {
  open: "bg-accent/50 text-foreground border-border",
  in_progress: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-800/50",
  done: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800/50",
  cancelled: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-800/50",
};

const PRIORITY_COLORS: Record<EpicPriority, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

const STATUS_OPTIONS: EpicStatus[] = ["open", "in_progress", "done", "cancelled"];
const PRIORITY_OPTIONS: EpicPriority[] = ["critical", "high", "medium", "low"];

const EPIC_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F97316",
  "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
];

const label = (value: string) => value.replace(/_/g, " ");
const dateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const FIELD_CLASS =
  "w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground " +
  "placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent";

/** A titled panel. Every block on this page is one, so they line up instead of
 *  each carrying its own spacing. */
function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-muted rounded-xl border border-border p-5", className)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, hint }: { icon: typeof Target; title: string; hint?: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Icon className="h-10 w-10 mx-auto mb-3 opacity-60" />
      <p className="text-sm">{title}</p>
      {hint && <p className="text-xs mt-1 opacity-80">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Editing.
 *
 * The page shipped with `Edit2`, `Plus` and `Trash2` in its import list and
 * nothing behind any of them: status was the only field anybody could change
 * here, while the API has always accepted title, description, priority, owner,
 * both dates, colour and labels. Reading an epic and then having to go
 * somewhere else to correct its target date is the kind of gap that makes a
 * detail page feel like a report.
 * ------------------------------------------------------------------ */
type EditableEpic = {
  title: string;
  description: string;
  status: EpicStatus;
  priority: EpicPriority;
  color: string;
  owner_id: string;
  start_date: string;
  target_date: string;
};

function EditEpicModal({
  initial,
  members,
  isSaving,
  onSave,
  onClose,
}: {
  initial: EditableEpic;
  members: { developer_id: string; developer_name?: string | null; developer_email?: string | null }[];
  isSaving: boolean;
  onSave: (patch: Partial<EditableEpic>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EditableEpic>(key: K, value: EditableEpic[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setError(null);
    try {
      // Only what actually moved. Sending the whole form would stamp every
      // field on every save and clobber anything changed elsewhere meanwhile.
      const patch: Partial<EditableEpic> = {};
      (Object.keys(form) as (keyof EditableEpic)[]).forEach((key) => {
        if (form[key] !== initial[key]) (patch[key] as string) = form[key];
      });
      await onSave(patch);
      onClose();
    } catch {
      setError("Could not save those changes. Try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-muted rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Edit epic</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label htmlFor="epic-title" className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input
              id="epic-title" type="text" required autoFocus className={FIELD_CLASS}
              value={form.title} onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="epic-description" className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea
              id="epic-description" rows={3} className={cn(FIELD_CLASS, "resize-none")}
              value={form.description} onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="epic-status" className="block text-sm font-medium text-foreground mb-1.5">Status</label>
              <select id="epic-status" className={FIELD_CLASS} value={form.status}
                onChange={(e) => set("status", e.target.value as EpicStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">{label(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="epic-priority" className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
              <select id="epic-priority" className={FIELD_CLASS} value={form.priority}
                onChange={(e) => set("priority", e.target.value as EpicPriority)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="epic-start" className="block text-sm font-medium text-foreground mb-1.5">Start date</label>
              <input id="epic-start" type="date" className={FIELD_CLASS}
                value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div>
              <label htmlFor="epic-target" className="block text-sm font-medium text-foreground mb-1.5">Target date</label>
              <input id="epic-target" type="date" className={FIELD_CLASS}
                value={form.target_date} onChange={(e) => set("target_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="epic-owner" className="block text-sm font-medium text-foreground mb-1.5">Owner</label>
            <select id="epic-owner" className={FIELD_CLASS} value={form.owner_id}
              onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.developer_id} value={m.developer_id}>
                  {m.developer_name || m.developer_email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-sm font-medium text-foreground mb-1.5">Colour</span>
            <div className="flex gap-2 flex-wrap">
              {EPIC_COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => set("color", c)}
                  aria-label={`Colour ${c}`} aria-pressed={form.color === c}
                  className={cn("w-7 h-7 rounded-lg transition", form.color === c && "ring-2 ring-primary-500 ring-offset-2 ring-offset-muted")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/70 text-foreground rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={!form.title.trim() || isSaving}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition font-medium inline-flex items-center justify-center gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Picks tasks that are not in any epic yet. `addTasks` has existed on the API
 *  the whole time; the page's only advice for linking work was to go and set
 *  the field on the task itself. */
function LinkTasksModal({
  workspaceId,
  isLinking,
  onLink,
  onClose,
}: {
  workspaceId: string;
  isLinking: boolean;
  onLink: (taskIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { data: tasks, isLoading } = useQuery<SprintTask[]>({
    queryKey: ["workspaceTasks", workspaceId, "unlinked"],
    queryFn: () => workspaceTasksApi.list(workspaceId),
  });

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (tasks ?? [])
      .filter((t) => !t.epic_id)
      .filter((t) => !term || t.title.toLowerCase().includes(term))
      .slice(0, 100);
  }, [tasks, query]);

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-muted rounded-xl border border-border w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Link tasks</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Tasks not already in an epic</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 pb-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search tasks..." />
        </div>
        <div className="flex-1 overflow-y-auto px-5 min-h-[8rem]">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-accent animate-pulse" />)}
            </div>
          ) : candidates.length === 0 ? (
            <Empty
              icon={Link2}
              title={query ? "No unlinked tasks match that search" : "Every task is already in an epic"}
            />
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((task) => (
                <li key={task.id}>
                  <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={picked.includes(task.id)}
                      onChange={() => toggle(task.id)}
                      className="shrink-0"
                    />
                    <span className="text-sm text-foreground truncate flex-1">{task.title}</span>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">{label(task.status)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/70 text-foreground rounded-lg transition">
            Cancel
          </button>
          <button
            type="button"
            disabled={picked.length === 0 || isLinking}
            onClick={async () => { await onLink(picked); onClose(); }}
            className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition font-medium inline-flex items-center justify-center gap-2"
          >
            {isLinking && <Loader2 className="h-4 w-4 animate-spin" />}
            {picked.length > 0 ? `Link ${picked.length} task${picked.length > 1 ? "s" : ""}` : "Link tasks"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EpicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const epicId = params.epicId as string;

  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId ?? null);

  const { epic, isLoading: epicLoading, updateEpic, isUpdating } = useEpic(currentWorkspaceId, epicId);
  const { epicDetail, isLoading: detailLoading } = useEpicDetail(currentWorkspaceId, epicId);
  const { progress } = useEpicProgress(currentWorkspaceId, epicId);
  const { timeline, isLoading: timelineLoading } = useEpicTimeline(currentWorkspaceId, epicId);
  const { burndown } = useEpicBurndown(currentWorkspaceId, epicId);
  const { addTasks, removeTask, isAddingTasks, isRemovingTask } = useEpicTasks(currentWorkspaceId, epicId);

  const [isEditing, setIsEditing] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const burndownData = useMemo(() => {
    if (!burndown?.data_points?.length) return [];
    return burndown.data_points.map((point, index) => ({
      date: shortDate(point.date),
      remaining: point.remaining_points,
      ideal: burndown.ideal_burndown?.[index] ?? null,
    }));
  }, [burndown]);

  if (authLoading || currentWorkspaceLoading || epicLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="h-4 w-48 rounded bg-accent animate-pulse" />
        <div className="h-28 rounded-xl border border-border bg-muted animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 rounded-xl border border-border bg-muted animate-pulse" />
          <div className="h-72 rounded-xl border border-border bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!epic) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="rounded-xl border border-border bg-muted p-12 text-center">
          <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Epic not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            It may have been deleted, or it belongs to another workspace.
          </p>
          <Link
            href="/sprints?tab=epics"
            className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-foreground border border-border rounded-lg transition text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to epics
          </Link>
        </div>
      </div>
    );
  }

  const changeStatus = (status: EpicStatus) => updateEpic({ status });

  const handleDelete = async () => {
    // Archive, not delete: an epic carries the history of everything linked to
    // it, and the list has an archived filter to bring it back from.
    await updateEpic({ status: "cancelled" });
    setConfirmingDelete(false);
    router.push("/sprints?tab=epics");
  };

  const tasks = epicDetail?.tasks ?? [];
  const percent = Math.round(epic.progress_percentage);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Breadcrumb
        items={[
          { label: "Planning", href: "/sprints" },
          { label: "Epics", href: "/sprints?tab=epics" },
          { label: epic.title },
        ]}
      />

      {/* Page header. Identity, state and the actions on it — one row of
          chrome, where the page used to carry a second copy of the whole app's
          navigation above a card that repeated most of this. */}
      <header className="rounded-xl border border-border bg-muted p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
              <span className="text-sm font-mono text-muted-foreground">{epic.key}</span>
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium border capitalize", STATUS_STYLES[epic.status])}>
                {label(epic.status)}
              </span>
              <span className={cn("inline-flex items-center gap-1 text-xs capitalize", PRIORITY_COLORS[epic.priority])}>
                <Flag className="h-3.5 w-3.5" />
                {epic.priority}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{epic.title}</h1>
            {epic.description && (
              <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{epic.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={epic.status}
              onChange={(e) => changeStatus(e.target.value as EpicStatus)}
              disabled={isUpdating}
              aria-label="Epic status"
              className="px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm capitalize disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} className="capitalize">{label(s)}</option>
              ))}
            </select>
            {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/70 text-foreground border border-border rounded-lg transition text-sm"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Cancel this epic"
              className="inline-flex items-center justify-center h-[34px] w-[34px] bg-accent hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border rounded-lg transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress and the facts that used to be scattered over three cards. */}
        <div className="mt-5 pt-4 border-t border-border grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">
                {epic.completed_tasks}/{epic.total_tasks} tasks
                {epic.total_story_points > 0 &&
                  ` · ${epic.completed_story_points}/${epic.total_story_points} pts`}
              </span>
              <span className="font-medium text-foreground">{percent}%</span>
            </div>
            <div
              className="h-2 bg-accent rounded-full overflow-hidden"
              role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
              aria-label="Epic progress"
            >
              <div className="h-full rounded-full transition-all"
                style={{ width: `${percent}%`, backgroundColor: epic.color }} />
            </div>
          </div>
          <dl className="text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="text-foreground truncate">{epic.owner_name || "Unassigned"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <dt className="text-muted-foreground">Started</dt>
              <dd className="text-foreground">
                {epic.start_date ? new Date(epic.start_date).toLocaleDateString() : "—"}
              </dd>
            </div>
          </dl>
          <dl className="text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <dt className="text-muted-foreground">Target</dt>
              <dd className="text-foreground">
                {epic.target_date ? new Date(epic.target_date).toLocaleDateString() : "—"}
              </dd>
            </div>
            {progress && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <dt className="text-muted-foreground">This week</dt>
                <dd className="text-green-400 font-medium">+{progress.tasks_completed_this_week}</dd>
              </div>
            )}
          </dl>
        </div>

        {progress?.estimated_completion_date && (
          <p className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-primary-400 shrink-0" />
            At the current rate this finishes around{" "}
            <span className="text-foreground font-medium">
              {new Date(progress.estimated_completion_date).toLocaleDateString(undefined, {
                month: "long", day: "numeric", year: "numeric",
              })}
            </span>
          </p>
        )}
      </header>

      {/* Two columns that both fill. The old grid put two `col-span-2` panels
          in a three-column track, which left a hole in the top-right cell at
          every desktop width. */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Panel
            title={`Linked tasks${tasks.length ? ` (${tasks.length})` : ""}`}
            action={
              <button
                type="button"
                onClick={() => setIsLinking(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent/70 text-foreground border border-border rounded-lg transition text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Link tasks
              </button>
            }
          >
            {detailLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-accent animate-pulse" />)}
              </div>
            ) : tasks.length === 0 ? (
              <Empty icon={Layers} title="No tasks linked yet" hint="Link existing tasks, or set the Epic field on a task." />
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((task) => {
                  const body = (
                    <>
                      <span className="text-sm text-foreground truncate">{task.title}</span>
                      <span className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                        {task.story_points != null && (
                          <span className="px-1.5 py-0.5 bg-accent rounded">{task.story_points} pts</span>
                        )}
                        <span className="capitalize">{task.priority}</span>
                        <span className="capitalize">{label(task.status)}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={task.id} className="flex items-center gap-2 group">
                      {task.sprint_id && task.project_id ? (
                        <Link
                          href={`/sprints/${task.project_id}/${task.sprint_id}`}
                          className="flex flex-1 min-w-0 items-center justify-between gap-3 py-2.5 rounded transition hover:text-primary-400"
                        >
                          {body}
                        </Link>
                      ) : (
                        <span className="flex flex-1 min-w-0 items-center justify-between gap-3 py-2.5">{body}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        disabled={isRemovingTask}
                        aria-label={`Unlink ${task.title}`}
                        className="shrink-0 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Burndown">
            {burndownData.length === 0 ? (
              <Empty icon={TrendingDown} title="No burndown yet" hint="A line appears once work starts closing." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={burndownData}>
                  {/* Themed off the tokens rather than the hardcoded slate hexes
                      the sprint burndown uses: this chart has to be legible in
                      both light and dark, and recharts gives ticks their own
                      default fill unless one is named. */}
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--border))"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    stroke="hsl(var(--border))"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--muted))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
                  <Area type="monotone" dataKey="ideal" name="Ideal" stroke="#64748b" fill="#64748b"
                    fillOpacity={0.08} strokeDasharray="5 5" connectNulls />
                  <Area type="monotone" dataKey="remaining" name="Remaining" stroke={epic.color} fill={epic.color}
                    fillOpacity={0.15} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="By status">
            {epicDetail?.tasks_by_status && Object.keys(epicDetail.tasks_by_status).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(epicDetail.tasks_by_status).map(([status, count]) => {
                  const pct = epic.total_tasks > 0 ? (count / epic.total_tasks) * 100 : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between gap-3 mb-1 text-sm">
                        <span className="capitalize text-muted-foreground">{label(status)}</span>
                        <span className="text-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: epic.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty icon={Target} title="No tasks to break down yet" />
            )}
          </Panel>

          <Panel title="Sprints">
            {timelineLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-accent animate-pulse" />)}
              </div>
            ) : timeline?.sprints?.length ? (
              <>
                <div className="space-y-2">
                  {timeline.sprints.map((sprint) => (
                    <Link
                      key={sprint.sprint_id}
                      href={`/sprints/${sprint.team_id}/${sprint.sprint_id}`}
                      className="block p-3 bg-accent/50 rounded-lg hover:bg-accent transition"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-foreground font-medium text-sm truncate">{sprint.sprint_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{sprint.team_name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{sprint.completed_count}/{sprint.task_count} tasks</span>
                        <span>{sprint.story_points} pts</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-lg font-bold text-green-400">{timeline.completed_sprints}</div>
                    <div className="text-muted-foreground">Done</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-400">{timeline.current_sprints}</div>
                    <div className="text-muted-foreground">Active</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-muted-foreground">{timeline.planned_sprints}</div>
                    <div className="text-muted-foreground">Planned</div>
                  </div>
                </div>
              </>
            ) : (
              <Empty icon={Clock} title="No sprints yet" hint="Sprints appear once linked tasks join one." />
            )}
          </Panel>
        </div>
      </div>

      {isEditing && (
        <EditEpicModal
          initial={{
            title: epic.title,
            description: epic.description ?? "",
            status: epic.status,
            priority: epic.priority,
            color: epic.color,
            owner_id: epic.owner_id ?? "",
            start_date: dateInput(epic.start_date),
            target_date: dateInput(epic.target_date),
          }}
          members={members ?? []}
          isSaving={isUpdating}
          onSave={async ({ owner_id, start_date, target_date, ...rest }) => {
            // A cleared date or an unassigned owner has to travel as an explicit
            // null. The server applies exactly the keys the body carries, so an
            // empty string would be stored as one and an omitted key would leave
            // the old value in place — neither of which is "cleared".
            await updateEpic({
              ...rest,
              ...(owner_id !== undefined && { owner_id: owner_id || null }),
              ...(start_date !== undefined && { start_date: start_date || null }),
              ...(target_date !== undefined && { target_date: target_date || null }),
            });
          }}
          onClose={() => setIsEditing(false)}
        />
      )}

      {isLinking && currentWorkspaceId && (
        <LinkTasksModal
          workspaceId={currentWorkspaceId}
          isLinking={isAddingTasks}
          onLink={async (ids) => { await addTasks(ids); }}
          onClose={() => setIsLinking(false)}
        />
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-muted rounded-xl border border-border w-full max-w-sm p-5">
            <h2 className="text-lg font-semibold text-foreground mb-1">Cancel this epic?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {epic.title} moves to cancelled. Linked tasks keep their history and stay where they are.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmingDelete(false)}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/70 text-foreground rounded-lg transition">
                Keep it
              </button>
              <button type="button" onClick={handleDelete} disabled={isUpdating}
                className="flex-1 px-4 py-2.5 bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-white rounded-lg transition font-medium inline-flex items-center justify-center gap-2">
                {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel epic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
