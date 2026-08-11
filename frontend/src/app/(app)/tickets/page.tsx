"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { TicketStatus, TicketPriority, developerApi, TableSavedView } from "@/lib/api";
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

/** A task or a form ticket, reduced to what the shared list renders. */
type WorkItem = {
  kind: "task" | "ticket";
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

const WORK_SOURCES: { id: WorkSource; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "tickets", label: "Form tickets" },
];

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

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [activeTab, setActiveTab] = useState<TabType>("work");
  const [source, setSource] = useState<WorkSource>("all");
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

  const { tickets, total, isLoading } = useTickets(workspaceId, {
    status: statusFilter.length > 0 ? statusFilter : undefined,
    priority: priorityFilter.length > 0 ? priorityFilter : undefined,
    // Tasks are already scoped to the caller by their endpoint; tickets are
    // not, so the scoping has to happen here or the two halves of one list
    // would mean different things.
    assignee_id: onlyMine && user?.id ? String(user.id) : undefined,
  });


  // Fetch my assigned sprint tasks. The endpoint now also returns bugs and
  // stories (item_type: "task" | "bug" | "story") — those live on /my-work,
  // and their statuses don't fit this tab's buckets, so keep tasks only.
  // Older cached responses lack item_type; treat them as tasks.
  const { data: myTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["myAssignedTasks"],
    queryFn: () => developerApi.getMyAssignedTasks(),
    select: (items) => items.filter((item) => (item.item_type ?? "task") === "task"),
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
          id: task.id,
          title: task.title,
          subtitle: task.sprint_name || "No Sprint",
          status: task.status,
          statusStyle: TASK_STATUS_COLORS[task.status],
          priority: task.priority,
          createdAt: task.created_at,
          storyPoints: task.story_points ?? null,
          href: task.sprint_id ? "/sprints" : null,
        });
      }
    }

    if (source !== "tasks") {
      for (const ticket of filteredTickets) {
        items.push({
          kind: "ticket",
          id: ticket.id,
          title: ticket.submitter_name || ticket.submitter_email || "Anonymous",
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
  }, [source, myTasks, filteredTickets]);

  const isLoadingWork = (source !== "tickets" && isLoadingTasks) || (source !== "tasks" && isLoading);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
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
                <Ticket className="h-8 w-8 text-purple-400" />
                My Work
              </h1>
              <p className="text-muted-foreground mt-2">
                Track your assigned tasks and incoming tickets
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/settings/ticket-forms")}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition border border-border"
              >
                <Settings className="h-4 w-4" />
                Manage Forms
              </button>
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
            My Work
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
            Automations
          </button>
        </div>

        {/* Source filter. Was two tabs; the split meant "what is on my plate?"
            took two looks and the second one was usually skipped. */}
        {activeTab === "work" && (
          <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="work-filters">
            {WORK_SOURCES.map((option) => (
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

            {source !== "tasks" && (
              <button
                onClick={() => setOnlyMine((v) => !v)}
                data-testid="work-only-mine"
                aria-pressed={onlyMine}
                title="Tasks are always yours; this scopes the form tickets"
                className={`ml-2 px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                  onlyMine
                    ? "bg-purple-600/15 border-purple-500/50 text-purple-600 dark:text-purple-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {onlyMine ? "Assigned to me" : "Everyone's tickets"}
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
                label={source === "tickets" ? "Tickets" : source === "tasks" ? "Tasks" : "Items"}
              />
              <StatCard
                icon={Clock}
                tone="yellow"
                value={workItems.filter((i) => i.status === "in_progress").length}
                label="In Progress"
              />
              <StatCard
                icon={Layers}
                tone="blue"
                value={
                  workItems.filter((i) =>
                    ["backlog", "todo", "open", "new"].includes(i.status)
                  ).length
                }
                label="To Do"
              />
              <StatCard
                icon={AlertTriangle}
                tone="red"
                value={workItems.filter((i) => i.slaBreached).length}
                label="SLA Breached"
              />
            </div>

            {/* Filters — search, saved views and status apply to the ticket
                half, so they are hidden when only tasks are showing. Kept
                verbatim from the old Form Tickets tab rather than rebuilt. */}
            {source !== "tasks" && (
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
                  placeholder="Search tickets..."
                  wrapperClassName="flex-1 min-w-[200px]"
                />
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Status:</span>
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
                  title={onlyMine ? "Nothing on your plate" : "No work found"}
                  description={
                    onlyMine
                      ? "Tasks assigned to you and tickets routed to you both appear here."
                      : "Create a form to start receiving tickets from your users."
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {/* The source is a badge now rather than a tab, so a
                              mixed list stays readable at a glance. */}
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.kind === "task"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-300"
                                : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"
                            }`}
                          >
                            {item.kind === "task" ? "Task" : "Ticket"}
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
                              {item.storyPoints} pts
                            </span>
                          ) : null}
                          {item.slaBreached && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              SLA Breached
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

            {source !== "tasks" && total > 50 && (
              <div className="mt-4 flex justify-center">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredTickets.length} of {total} tickets
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === "automations" && (
          <ModuleAutomationsPanel module="tickets" moduleLabel="Tickets" />
        )}
      </main>
    </div>
  );
}
