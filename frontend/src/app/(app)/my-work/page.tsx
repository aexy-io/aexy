"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Ticket,
  Filter,
  AlertTriangle,
  Clock,
  User,
  ChevronRight,
  Settings,
  ListTodo,
  Layers,
  Zap,
  Bug as BugIcon,
  BookOpen,
  CheckSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { ModuleAutomationsPanel } from "@/components/ModuleAutomationsPanel";
import { EmptyState } from "@/components/EmptyState";
import { SavedViewSwitcher } from "@/components/crm/SavedViewSwitcher";
import { useSavedViews } from "@/hooks/useSavedViews";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTickets } from "@/hooks/useTicketing";
import { useMyWork } from "@/hooks/useMyWork";
import { useAppAccess } from "@/hooks/useAppAccess";
import { TicketStatus, TicketPriority, TableSavedView } from "@/lib/api";
import {
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  TASK_STATUS_COLORS as TASK_STATUS_COLORS_BASE,
} from "@/lib/statusColors";

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  waiting_on_submitter: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLORS = Object.fromEntries(
  Object.entries(TICKET_STATUS_COLORS).map(([k, v]) => [k, { ...v, label: STATUS_LABELS[k as TicketStatus] ?? k }])
) as Record<TicketStatus, { bg: string; text: string; label: string }>;

const PRIORITY_COLORS = TICKET_PRIORITY_COLORS as Record<TicketPriority, { bg: string; text: string }>;

const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

const TASK_STATUS_COLORS = Object.fromEntries(
  Object.entries(TASK_STATUS_COLORS_BASE).map(([k, v]) => [k, { ...v, label: TASK_STATUS_LABELS[k] ?? k }])
) as Record<string, { bg: string; text: string; label: string }>;

type TabType = "work" | "automations";

/**
 * Which kind of work to show.
 *
 * Tasks and form tickets were separate tabs, which made "what is on my plate?"
 * two questions instead of one — and the answer to the second was buried behind
 * a click most people never made.
 */
type WorkSource = "all" | "tasks" | "tickets";

/** A work item — task, bug, story or form ticket — as the shared list renders it. */
type WorkItem = {
  kind: "task" | "ticket";
  /** For `kind: "task"`, which tracker it came from. Drives the row's icon. */
  itemType?: string;
  id: string;
  title: string;
  subtitle: string;
  reference?: string;
  status: string;
  statusStyle?: { bg: string; text: string; label: string };
  priority: string | null;
  createdAt: string;
  storyPoints?: number | null;
  slaBreached?: boolean;
  assigneeName?: string | null;
  href: string | null;
};

/**
 * Icon per tracker. Bugs and stories live in their own tables but land on the
 * same person, so they belong in the same list — distinguished by a glyph rather
 * than by being on a different page, which is what used to hide them.
 */
const ITEM_TYPE_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  task: { icon: CheckSquare, color: "text-blue-400" },
  bug: { icon: BugIcon, color: "text-red-400" },
  story: { icon: BookOpen, color: "text-purple-400" },
};

const STAT_TONES: Record<string, string> = {
  purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-400",
  yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-400",
  red: "bg-red-100 dark:bg-red-900/30 text-red-400",
};

function StatCard({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: keyof typeof STAT_TONES | string;
  value: number;
  label: string;
}) {
  return (
    <div className="bg-muted rounded-xl p-4 border border-border">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${STAT_TONES[tone] ?? STAT_TONES.purple}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  const router = useRouter();
  const t = useTranslations("myWork");
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  /**
   * Form tickets are a separate app with its own permission, and this page is no
   * longer behind that app's guard — it is the personal work list, so somebody
   * with sprint access and no ticket access must still get it. Gating the source
   * rather than the page keeps their tasks visible without showing them a queue
   * they are not entitled to.
   */
  const { hasAppAccess } = useAppAccess(workspaceId, user?.id ? String(user.id) : null);
  const canSeeTickets = hasAppAccess("tickets");

  const [activeTab, setActiveTab] = useState<TabType>("work");
  const [source, setSource] = useState<WorkSource>("all");
  const [includeDone, setIncludeDone] = useState(false);
  // On by default: this page is "My Work". Turning it off gives back the
  // workspace-wide triage queue the Form Tickets tab used to be, which some
  // people do rely on — the filter replaced the tab, it did not remove the view.
  const [onlyMine, setOnlyMine] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([]);
  const [priorityFilter] = useState<TicketPriority[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Saved views for tickets
  const {
    views: savedViews,
    createView,
    updateView,
    deleteView,
    isCreating: isCreatingView,
    isUpdating: isUpdatingView,
  } = useSavedViews(workspaceId ?? undefined, "ticket");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const handleSelectView = useCallback((view: TableSavedView | null) => {
    if (!view) {
      setActiveViewId(null);
      setStatusFilter([]);
      setSearchQuery("");
      return;
    }
    setActiveViewId(view.id);
    for (const f of view.filters || []) {
      const attr = f.attribute as string;
      const val = f.value;
      if (attr === "status") setStatusFilter(Array.isArray(val) ? val as TicketStatus[] : [val as TicketStatus]);
      else if (attr === "search") setSearchQuery(val as string);
    }
  }, []);

  const handleSaveView = useCallback(async (data: Parameters<typeof createView>[0]) => {
    const filterList: Record<string, unknown>[] = [];
    if (statusFilter.length) filterList.push({ attribute: "status", operator: "in", value: statusFilter });
    if (searchQuery) filterList.push({ attribute: "search", operator: "equals", value: searchQuery });
    await createView({ ...data, filters: filterList });
  }, [createView, statusFilter, searchQuery]);

  const handleUpdateView = useCallback(async (viewId: string, data: Parameters<typeof updateView>[1]) => {
    await updateView(viewId, data);
  }, [updateView]);

  const { tickets, total, isLoading } = useTickets(
    canSeeTickets ? workspaceId : null,
    {
      status: statusFilter.length > 0 ? statusFilter : undefined,
      priority: priorityFilter.length > 0 ? priorityFilter : undefined,
      // Tasks are already scoped to the caller by their endpoint; tickets are
      // not, so the scoping has to happen here or the two halves of one list
      // would mean different things.
      assignee_id: onlyMine && user?.id ? String(user.id) : undefined,
    }
  );

  /**
   * Everything assigned to me across all three trackers.
   *
   * This deliberately keeps bugs and stories. The previous version of this list
   * filtered to `item_type === "task"` on the grounds that bug and story
   * statuses did not fit the ticket status buckets — but the effect was that
   * your bugs and stories were simply missing from the page that claims to show
   * everything assigned to you, and only appeared on a second page that has now
   * been folded into this one. Rows fall back to rendering the raw status when
   * there is no styled bucket for it, which is a far smaller problem than
   * silently omitting the work.
   */
  const { data: myTasks = [], isLoading: isLoadingTasks } = useMyWork({
    include_done: includeDone,
  });

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.submitter_email?.toLowerCase().includes(query) ||
      ticket.submitter_name?.toLowerCase().includes(query) ||
      ticket.form_name?.toLowerCase().includes(query) ||
      `TKT-${ticket.ticket_number}`.toLowerCase().includes(query)
    );
  });

  /**
   * Tasks and tickets as one stream.
   *
   * They were rendered as two lists under two tabs, so "what is on my plate?"
   * had no single answer and nothing could be ordered across both. Normalising
   * to a shared shape is what lets the source filter be a filter rather than a
   * tab wearing a different hat.
   */
  const workItems = useMemo(() => {
    const items: WorkItem[] = [];

    if (source !== "tickets") {
      for (const task of myTasks) {
        items.push({
          kind: "task",
          // Older cached responses predate the field; treat those as tasks.
          itemType: task.item_type ?? "task",
          id: task.id,
          title: task.title,
          subtitle: task.sprint_name || t("noSprint"),
          status: task.status,
          statusStyle: TASK_STATUS_COLORS[task.status],
          priority: task.priority,
          createdAt: task.created_at,
          storyPoints: task.story_points ?? null,
          // Deep-link to the board the item is actually on when we know both
          // halves of the path; the old My Work page built this same link.
          href:
            task.sprint_id && task.project_id
              ? `/sprints/${task.project_id}/${task.sprint_id}`
              : task.sprint_id
                ? "/sprints"
                : null,
        });
      }
    }

    if (source !== "tasks" && canSeeTickets) {
      for (const ticket of filteredTickets) {
        items.push({
          kind: "ticket",
          id: ticket.id,
          title: ticket.submitter_name || ticket.submitter_email || t("anonymous"),
          subtitle: ticket.form_name || "",
          reference: `TKT-${ticket.ticket_number}`,
          status: ticket.status,
          statusStyle: STATUS_COLORS[ticket.status],
          priority: ticket.priority ?? null,
          createdAt: ticket.created_at,
          slaBreached: !!ticket.sla_breached,
          assigneeName: ticket.assignee_name ?? null,
          href: `/tickets/${ticket.id}`,
        });
      }
    }

    // Newest first across both sources — the point of merging them.
    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [source, myTasks, filteredTickets, canSeeTickets, t]);

  const isLoadingWork =
    (source !== "tickets" && isLoadingTasks) ||
    (source !== "tasks" && canSeeTickets && isLoading);

  /** Which source filters to offer — "Form tickets" only if they have the app. */
  const workSources = useMemo(() => {
    const sources: { id: WorkSource; label: string }[] = [
      { id: "all", label: t("sources.all") },
      { id: "tasks", label: t("sources.tasks") },
    ];
    if (canSeeTickets) {
      sources.push({ id: "tickets", label: t("sources.tickets") });
    }
    return sources;
  }, [canSeeTickets, t]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return t("justNow");
    if (hours < 24) return t("hoursAgo", { count: hours });
    if (days < 7) return t("daysAgo", { count: days });
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <ListTodo className="h-8 w-8 text-primary-500" />
                {t("title")}
              </h1>
              <p className="text-muted-foreground mt-2">{t("description")}</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDone}
                  onChange={(e) => setIncludeDone(e.target.checked)}
                  className="rounded border-border text-primary-500 focus:ring-primary-500"
                />
                {t("showCompleted")}
              </label>
              {canSeeTickets && (
                <button
                  onClick={() => router.push("/settings/ticket-forms")}
                  className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition border border-border"
                >
                  <Settings className="h-4 w-4" />
                  {t("manageForms")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs. Automations stays one because it is configuration, not work —
            it does not belong in a list of things on your plate. */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("work")}
            data-testid="tab-work"
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === "work"
                ? "bg-purple-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            <ListTodo className="h-4 w-4" />
            {t("title")}
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${
                activeTab === "work" ? "bg-purple-500" : "bg-accent"
              }`}
            >
              {workItems.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("automations")}
            data-testid="tab-automations"
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === "automations"
                ? "bg-purple-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            <Zap className="h-4 w-4" />
            {t("automations")}
          </button>
        </div>

        {/* Source filter. Was two tabs; the split meant "what is on my plate?"
            took two looks and the second one was usually skipped. */}
        {activeTab === "work" && (
          <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="work-filters">
            {workSources.map((option) => (
              <button
                key={option.id}
                onClick={() => setSource(option.id)}
                data-testid={`work-source-${option.id}`}
                aria-pressed={source === option.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                  source === option.id
                    ? "bg-purple-600/15 border-purple-500/50 text-purple-600 dark:text-purple-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}

            {source !== "tasks" && canSeeTickets && (
              <button
                onClick={() => setOnlyMine((v) => !v)}
                data-testid="work-only-mine"
                aria-pressed={onlyMine}
                title={t("onlyMineHint")}
                className={`ml-2 px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                  onlyMine
                    ? "bg-purple-600/15 border-purple-500/50 text-purple-600 dark:text-purple-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {onlyMine ? t("assignedToMe") : t("everyonesTickets")}
              </button>
            )}
          </div>
        )}

        {activeTab === "work" && (
          <>
            {/* Counts follow the filter. Two fixed sets of cards, one per tab,
                meant the numbers on screen described a list you were not
                looking at. */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={ListTodo}
                tone="purple"
                value={workItems.length}
                label={
                  source === "tickets"
                    ? t("stats.tickets")
                    : source === "tasks"
                      ? t("stats.tasks")
                      : t("stats.items")
                }
              />
              <StatCard
                icon={Clock}
                tone="yellow"
                value={workItems.filter((i) => i.status === "in_progress").length}
                label={t("stats.inProgress")}
              />
              <StatCard
                icon={Layers}
                tone="blue"
                value={
                  workItems.filter((i) =>
                    ["backlog", "todo", "open", "new"].includes(i.status)
                  ).length
                }
                label={t("stats.toDo")}
              />
              <StatCard
                icon={AlertTriangle}
                tone="red"
                value={workItems.filter((i) => i.slaBreached).length}
                label={t("stats.slaBreached")}
              />
            </div>

            {/* Filters — search, saved views and status apply to the ticket
                half, so they are hidden when only tasks are showing. Kept
                verbatim from the old Form Tickets tab rather than rebuilt. */}
            {source !== "tasks" && canSeeTickets && (
              <div className="bg-muted rounded-xl border border-border p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <SavedViewSwitcher
                  views={savedViews}
                  activeViewId={activeViewId}
                  onSelectView={handleSelectView}
                  onSaveView={handleSaveView}
                  onUpdateView={handleUpdateView}
                  onDeleteView={deleteView}
                  currentConfig={{ view_type: "table", sorts: [] }}
                  isCreating={isCreatingView}
                  isUpdating={isUpdatingView}
                />
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={t("searchTickets")}
                  wrapperClassName="flex-1 min-w-[200px]"
                />
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("statusLabel")}</span>
                  <div className="flex gap-1">
                    {(["new", "in_progress", "waiting_on_submitter", "resolved"] as TicketStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          setStatusFilter((prev) =>
                            prev.includes(status)
                              ? prev.filter((s) => s !== status)
                              : [...prev, status]
                          );
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${
                          statusFilter.includes(status)
                            ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`
                            : "bg-accent text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {STATUS_COLORS[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* One list */}
            <div className="bg-muted rounded-xl border border-border" data-testid="work-list">
              {isLoadingWork ? (
                <div className="p-4 space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <div className="h-4 w-4 bg-accent rounded" />
                      <div className="flex-1">
                        <div className="h-4 w-56 bg-accent rounded mb-1" />
                        <div className="h-3 w-32 bg-accent rounded" />
                      </div>
                      <div className="h-5 w-16 bg-accent rounded-full" />
                    </div>
                  ))}
                </div>
              ) : workItems.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title={onlyMine ? t("empty") : t("emptyAll")}
                  description={
                    onlyMine ? t("emptyDescription") : t("emptyAllDescription")
                  }
                  compact
                />
              ) : (
                <div className="divide-y divide-border">
                  {workItems.map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      onClick={() => item.href && router.push(item.href)}
                      data-testid={`work-item-${item.kind}`}
                      className="w-full p-4 hover:bg-accent/50 transition flex items-center gap-4 text-left"
                    >
                      <WorkItemIcon item={item} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {/* The source is a badge now rather than a tab, so a
                              mixed list stays readable at a glance. Bugs and
                              stories name themselves rather than all reading
                              "Task" — they are different trackers with different
                              statuses, and a row labelled Task that is actually a
                              bug sends people to the wrong board. */}
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.kind === "task"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-300"
                                : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"
                            }`}
                          >
                            {item.kind === "task"
                              ? t(`types.${item.itemType ?? "task"}`)
                              : t("types.ticket")}
                          </span>
                          {item.reference && (
                            <span className="text-sm font-mono text-purple-400">
                              {item.reference}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.statusStyle?.bg || "bg-accent"
                            } ${item.statusStyle?.text || "text-foreground"}`}
                          >
                            {item.statusStyle?.label || item.status}
                          </span>
                          {item.priority && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                PRIORITY_COLORS[item.priority as TicketPriority]?.bg || "bg-accent"
                              } ${PRIORITY_COLORS[item.priority as TicketPriority]?.text || "text-foreground"}`}
                            >
                              {item.priority}
                            </span>
                          )}
                          {item.storyPoints ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent text-foreground">
                              {t("points", { count: item.storyPoints })}
                            </span>
                          ) : null}
                          {item.slaBreached && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              {t("stats.slaBreached")}
                            </span>
                          )}
                        </div>
                        <p className="text-foreground font-medium truncate">{item.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.subtitle ? `${item.subtitle} • ` : ""}
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      {item.assigneeName && !onlyMine && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          {item.assigneeName}
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {source !== "tasks" && canSeeTickets && total > 50 && (
              <div className="mt-4 flex justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("showingCount", { shown: filteredTickets.length, total })}
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "automations" && (
          <ModuleAutomationsPanel module="tickets" moduleLabel={t("stats.tickets")} />
        )}
      </main>
    </div>
  );
}

/**
 * The tracker glyph for a row.
 *
 * Tasks, bugs, stories and form tickets share one list, and the type badge alone
 * makes them hard to scan; the icon is what lets you find your bugs in a mixed
 * list without reading every label.
 */
function WorkItemIcon({ item }: { item: WorkItem }) {
  if (item.kind === "ticket") {
    return <Ticket className="h-4 w-4 shrink-0 text-cyan-400" />;
  }
  const meta = ITEM_TYPE_ICONS[item.itemType ?? "task"] ?? ITEM_TYPE_ICONS.task;
  const Icon = meta.icon;
  return <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />;
}
