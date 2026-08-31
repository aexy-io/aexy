"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  Flag,
  Layers,
  Plus,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { useEpics } from "@/hooks/useEpics";
import { EpicListItem, EpicStatus, EpicPriority } from "@/lib/api";

const STATUS_COLORS: Record<EpicStatus, { bg: string; text: string; border: string }> = {
  open: { bg: "bg-accent/50", text: "text-foreground", border: "border-border" },
  in_progress: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", border: "border-blue-800/50" },
  done: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", border: "border-green-800/50" },
  cancelled: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", border: "border-red-800/50" },
};

const PRIORITY_COLORS: Record<EpicPriority, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

function EpicCard({ epic }: { epic: EpicListItem }) {
  const statusStyle = STATUS_COLORS[epic.status] ?? STATUS_COLORS.open;
  const progress = epic.progress_percentage;

  return (
    <Link
      href={`/sprints/epics/${epic.id}`}
      className="block bg-background/50 rounded-xl border border-border overflow-hidden transition hover:border-primary-500/40 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: epic.color }}
            />
            <span className="text-muted-foreground text-sm font-mono">{epic.key}</span>
          </div>
          <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
            {epic.status.replace("_", " ")}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
          {epic.title}
        </h3>

        {/* Owner */}
        {epic.owner_name && (
          <div className="flex items-center gap-1.5 mb-4 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{epic.owner_name}</span>
          </div>
        )}

        {/* Progress. One readout, not two — the bar and a separate "x/y tasks"
            line were the same fact written twice. */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">
              {epic.completed_tasks}/{epic.total_tasks} tasks
            </span>
            <span className="text-foreground font-medium">{Math.round(progress)}%</span>
          </div>
          <div
            className="h-2 bg-accent rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${epic.title} progress`}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: epic.color,
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flag className={`h-4 w-4 ${PRIORITY_COLORS[epic.priority]}`} />
            <span className="capitalize">{epic.priority}</span>
          </div>
          {epic.target_date && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(epic.target_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreateEpicModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; description?: string; priority?: EpicPriority; color?: string }) => Promise<void>;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<EpicPriority>("medium");
  const [color, setColor] = useState("#6366F1");

  const colors = [
    "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F97316",
    "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      color,
    });

    setTitle("");
    setDescription("");
    setPriority("medium");
    setColor("#6366F1");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-muted rounded-xl border border-border w-full max-w-lg">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Create Epic</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Epics group related tasks across sprints and teams
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User Authentication System"
              className="w-full px-4 py-2.5 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the epic's goals and scope..."
              rows={3}
              className="w-full px-4 py-2.5 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as EpicPriority)}
              className="w-full px-4 py-2.5 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition ${
                    color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-accent hover:bg-muted text-foreground rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg transition font-medium"
            >
              {isCreating ? "Creating..." : "Create Epic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The filters live in the address bar.
 *
 * They were component state, which meant opening an epic and coming back —
 * by the browser's back button or the breadcrumb — rebuilt this screen with
 * every filter cleared. Anyone triaging a narrowed set had to narrow it again
 * after each epic they read. The tab itself is already a URL param; the rest
 * of the screen's state belongs in the same place.
 * ------------------------------------------------------------------ */

type SortKey = "recent" | "progress" | "target" | "priority" | "title";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Default order",
  progress: "Most progress",
  target: "Target date",
  priority: "Priority",
  title: "Title A–Z",
};

/** High to low, so "sort by priority" puts the fires first. */
const PRIORITY_RANK: Record<EpicPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const STATUS_CARDS: { status: EpicStatus; label: string; icon: typeof Target; tint: string; accent: string }[] = [
  { status: "open", label: "Open", icon: Target, tint: "bg-accent/50", accent: "text-muted-foreground" },
  { status: "in_progress", label: "In Progress", icon: ArrowRight, tint: "bg-blue-500/10", accent: "text-blue-400" },
  { status: "done", label: "Done", icon: CheckCircle, tint: "bg-green-500/10", accent: "text-green-400" },
];

function sortEpics(epics: EpicListItem[], sort: SortKey): EpicListItem[] {
  if (sort === "recent") return epics;
  const sorted = [...epics];
  switch (sort) {
    case "progress":
      return sorted.sort((a, b) => b.progress_percentage - a.progress_percentage);
    case "priority":
      return sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "target":
      // Epics with no target date sort last rather than first: an absent date
      // is "not scheduled", not "due at the beginning of time".
      return sorted.sort((a, b) => {
        if (!a.target_date) return b.target_date ? 1 : 0;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });
  }
}

interface EpicsTabProps {
  workspaceId: string | null;
  hasWorkspaces: boolean;
}

export function EpicsTab({ workspaceId, hasWorkspaces }: EpicsTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read once. From here the state drives the URL, not the other way round —
  // re-reading every render would fight the `replace` below.
  const [initial] = useState(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const asked = params.get("sort") as SortKey | null;
    return {
      q: params.get("q") ?? "",
      status: (params.get("status") ?? "") as EpicStatus | "",
      priority: (params.get("priority") ?? "") as EpicPriority | "",
      sort: asked && asked in SORT_LABELS ? asked : ("recent" as SortKey),
    };
  });

  // The box holds what is being typed; `search` holds what has been asked for.
  // Without the split every keystroke was its own request, because `useEpics`
  // is keyed on the term.
  const [typed, setTyped] = useState(initial.q);
  const [search, setSearch] = useState(initial.q);
  const [statusFilter, setStatusFilter] = useState<EpicStatus | "">(initial.status);
  const [priorityFilter, setPriorityFilter] = useState<EpicPriority | "">(initial.priority);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);

  // State out to the address bar. `replace`, not `push`: a history entry per
  // keystroke would bury whatever page the reader arrived from, and the back
  // button is what this is here to protect.
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const set = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    set("q", search);
    set("status", statusFilter);
    set("priority", priorityFilter);
    set("sort", sort === "recent" ? "" : sort);
    const next = params.toString();
    if (next === window.location.search.replace(/^\?/, "")) return;
    router.replace(`${window.location.pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [search, statusFilter, priorityFilter, sort, router, searchParams]);

  const {
    epics,
    isLoading: epicsLoading,
    createEpic,
    isCreating,
  } = useEpics(workspaceId, {
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: search || undefined,
  });

  const handleCreateEpic = async (data: { title: string; description?: string; priority?: EpicPriority; color?: string }) => {
    await createEpic(data);
  };

  const visible = sortEpics(epics, sort);
  const hasFilters = !!(search || statusFilter || priorityFilter);
  const clearFilters = () => {
    setTyped("");
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
  };

  // The counts cannot come from `epics`: that list is already narrowed by the
  // very filter these cards set, so "Done" would read 0 whenever Done was not
  // the one selected. They are counted over everything *except* the status
  // filter — search and priority still apply, because the question the cards
  // answer is "of what I am looking at, how much sits in each state".
  const { epics: unfilteredByStatus } = useEpics(workspaceId, {
    priority: priorityFilter || undefined,
    search: search || undefined,
  });
  const countFor = (status: EpicStatus) =>
    unfilteredByStatus.filter((e) => e.status === status).length;

  if (!hasWorkspaces) {
    return (
      <div className="bg-background/50 rounded-xl p-12 text-center border border-border">
        <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Layers className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">No Workspace Yet</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Create a workspace to start tracking epics.
        </p>
        <Link
          href="/settings/organization"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Workspace
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Status cards. These are the status filter — they used to be inert
          totals sitting directly above a select that did the same job, which
          made the one thing that looked clickable the one thing that was not. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {STATUS_CARDS.map(({ status, label, icon: Icon, tint, accent }) => {
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(active ? "" : status)}
              className={cn(
                "text-left rounded-xl border p-4 transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                active
                  ? "border-primary-500 bg-primary-500/10"
                  : "border-border bg-background/50 hover:border-primary-500/40 hover:bg-accent/30",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-lg", tint)}>
                  <Icon className={cn("h-4 w-4", accent)} />
                </div>
                <span className={cn("text-sm", active ? "text-foreground" : accent)}>{label}</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{countFor(status)}</div>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={statusFilter === ""}
          onClick={() => setStatusFilter("")}
          className={cn(
            "text-left rounded-xl border p-4 transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
            statusFilter === ""
              ? "border-primary-500 bg-primary-500/10"
              : "border-border bg-background/50 hover:border-primary-500/40 hover:bg-accent/30",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-500/10 rounded-lg">
              <Layers className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-muted-foreground text-sm">All Epics</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{unfilteredByStatus.length}</div>
        </button>
      </div>

      {/* Search, the filters the cards do not cover, and the sort. */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput
          value={typed}
          onChange={setTyped}
          placeholder="Search epics..."
          wrapperClassName="flex-1 min-w-[200px] max-w-md"
        />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as EpicPriority | "")}
          aria-label="Filter by priority"
          className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort epics"
          className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>{SORT_LABELS[key]}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Epic
        </button>
      </div>

      {/* Epic Grid */}
      {epicsLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-52 rounded-xl border border-border bg-background/50 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        /* A filtered list that matches nothing is not an empty backlog. Telling
           somebody who has typed a search to "create your first epic" says the
           work does not exist when it is only hidden, and points them at the
           wrong action — the next move is to clear a filter. */
        <div className="bg-background/50 rounded-xl p-12 text-center border border-border">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            {hasFilters
              ? <Search className="h-10 w-10 text-muted-foreground" />
              : <Layers className="h-10 w-10 text-muted-foreground" />}
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            {hasFilters ? "No epics match these filters" : "No Epics Yet"}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {hasFilters
              ? "Nothing here matches what you are looking for. Widen the search or clear the filters."
              : "Create your first epic to start tracking large initiatives."}
          </p>
          {hasFilters ? (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-6 py-3 bg-muted hover:bg-accent text-foreground border border-border rounded-lg transition font-medium"
            >
              <X className="h-4 w-4" />
              Clear filters
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
            >
              <Plus className="h-4 w-4" />
              Create Epic
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((epic) => (
            <EpicCard key={epic.id} epic={epic} />
          ))}
        </div>
      )}

      {/* Create Epic Modal */}
      <CreateEpicModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateEpic}
        isCreating={isCreating}
      />
    </>
  );
}
