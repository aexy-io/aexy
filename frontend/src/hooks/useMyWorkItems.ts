"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { MyAssignedTask, TicketListItem, developerApi, ticketsApi } from "@/lib/api";
import { serviceDeskApi, type ServiceDeskTicket } from "@/lib/service-desk-api";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { useAppAccess } from "./useAppAccess";
import { useMyWorkStore, type StatusBucket, type WorkspaceScope } from "@/stores/myWorkStore";

/** A work item — task, bug, story, form ticket or service desk ticket. */
export type WorkItem = {
  kind: "task" | "ticket";
  /** For `kind: "task"`, which tracker it came from. Drives the row's icon. */
  itemType: "task" | "bug" | "story" | "ticket" | "service_desk";
  id: string;
  title: string;
  subtitle: string;
  reference?: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  storyPoints?: number | null;
  slaBreached?: boolean;
  assigneeName?: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  /** Where the row goes when clicked. Never null — every row is a link. */
  href: string;
};

/** Statuses that make up each tile's bucket, across all four trackers. */
const BUCKET_STATUSES: Record<Exclude<StatusBucket, "all" | "sla_breached">, string[]> = {
  in_progress: ["in_progress", "in progress", "acknowledged"],
  todo: ["backlog", "todo", "to_do", "open", "new", "confirmed", "draft", "ready"],
};

/**
 * Where a work item opens.
 *
 * Every row resolves to somewhere, which was not previously true: a task only
 * got a link when it knew both its sprint and its project, and bugs and stories
 * never got one at all — so most of the list was dead to the click. The fallback
 * chain ends at a page that can find the item rather than at nothing.
 */
function taskHref(task: MyAssignedTask): string {
  if (task.item_type === "bug") {
    return task.project_id ? `/sprints/${task.project_id}/bugs?bug=${task.id}` : "/sprints";
  }
  if (task.item_type === "story") {
    return task.epic_id ? `/sprints/epics/${task.epic_id}` : "/sprints?tab=epics";
  }
  // `/sprints?task=` resolves the task's own team and forwards to its board —
  // it works for backlog tasks with no sprint, which the old sprint-and-project
  // link could not build a URL for at all.
  return `/sprints?task=${task.id}`;
}

function matchesSearch(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    item.subtitle.toLowerCase().includes(q) ||
    (item.reference ?? "").toLowerCase().includes(q) ||
    (item.workspaceName ?? "").toLowerCase().includes(q)
  );
}

function inBucket(item: WorkItem, bucket: StatusBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "sla_breached") return !!item.slaBreached;
  return BUCKET_STATUSES[bucket].includes(item.status);
}

/**
 * Everything on the current user's plate, scoped to a workspace.
 *
 * Shared by every My Work widget so the tiles, the queue and the type breakdown
 * are always describing the same set of items — they are separate widgets, and
 * three widgets each fetching and filtering their own copy is how the counts on
 * screen end up describing a list nobody is looking at.
 */
/**
 * `?? []` guards a list being absent. It does not guard it being the wrong
 * shape, and an object is both truthy and not iterable — so one endpoint
 * answering `{}` where an array is typed threw out of the `for…of` below and
 * took the entire dashboard into its error boundary. This screen aggregates
 * four independent sources; a blank page with a stack trace is the wrong answer
 * when three of them are fine. A malformed source contributes nothing instead.
 */
function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export function useMyWorkItems() {
  const { user } = useAuth();
  const { currentWorkspace, workspaces } = useWorkspace();
  const {
    workspaceScopeMode,
    source,
    statusBucket,
    includeDone,
    onlyMine,
    search,
  } = useMyWorkStore();

  const userId = user?.id ? String(user.id) : null;
  const currentWorkspaceId = currentWorkspace?.id ?? null;

  // Unless somebody asks for all of them, "my work" means the workspace they
  // are already in — resolved live rather than remembered, so switching
  // workspace in the header moves this list with it. Showing every workspace at
  // once was the old behaviour and the bug: with no way to say which workspace
  // you meant, other people's projects turned up in your personal list.
  const scope: WorkspaceScope | null =
    workspaceScopeMode === "all" ? "all" : currentWorkspaceId;

  const workspaceList = useMemo(() => workspaces ?? [], [workspaces]);
  /** Below two workspaces the selector would be a control with one answer. */
  const showWorkspaceFilter = workspaceList.length >= 2;

  const { hasAppAccess, isLoading: isLoadingAccess } = useAppAccess(
    currentWorkspaceId,
    userId
  );
  const canSeeTickets = hasAppAccess("tickets");
  // A separate app with its own permission and its own visibility rules, so it
  // is gated separately: somebody on the desk and off forms should see their
  // desk queue here, and vice versa.
  const canSeeServiceDesk = hasAppAccess("service_desk");

  const taskQueryEnabled = !!scope && (source === "all" || source === "tasks");
  const taskQuery = useQuery<MyAssignedTask[]>({
    queryKey: ["myWork", scope, includeDone],
    queryFn: () =>
      developerApi.getMyAssignedTasks({
        include_done: includeDone,
        ...(scope && scope !== "all" ? { workspace_id: scope } : {}),
      }),
    enabled: taskQueryEnabled,
  });

  // Tickets are listed per workspace, so "All workspaces" means one request per
  // workspace. Access is per workspace too and can only be resolved for the one
  // in the switcher, so the others are simply attempted — the server is the
  // authority, and a workspace the person can't see tickets in fails its own
  // request without taking the rest of the page down.
  const ticketWorkspaceIds = useMemo(() => {
    if (!canSeeTickets || (source !== "all" && source !== "tickets")) return [];
    if (scope && scope !== "all") return [scope];
    return workspaceList.map((w) => w.id);
  }, [canSeeTickets, source, scope, workspaceList]);

  const serviceDeskWorkspaceIds = useMemo(() => {
    if (!canSeeServiceDesk || (source !== "all" && source !== "service_desk")) return [];
    if (scope && scope !== "all") return [scope];
    return workspaceList.map((w) => w.id);
  }, [canSeeServiceDesk, source, scope, workspaceList]);

  const ticketQueries = useQueries({
    queries: ticketWorkspaceIds.map((workspaceId) => ({
      queryKey: ["myWorkTickets", workspaceId, userId, onlyMine],
      queryFn: () =>
        ticketsApi.list(workspaceId, {
          // Tasks are assignee-scoped by their own endpoint; tickets are not,
          // so the scoping happens here or the two halves of one list would
          // mean different things.
          ...(onlyMine && userId ? { assignee_id: userId } : {}),
          limit: 100,
        }),
      enabled: !!userId,
      retry: false,
    })),
  });

  // Always the caller's own queue, never the whole desk scope — a KAM's scope
  // can be an entire account's traffic, which is a triage view, not a personal
  // one. The "Everyone's tickets" toggle beside it widens the *form* tickets it
  // was built for and deliberately does not reach across into the desk.
  const serviceDeskQueries = useQueries({
    queries: serviceDeskWorkspaceIds.map((workspaceId) => ({
      queryKey: ["myWorkServiceDesk", workspaceId, userId],
      queryFn: () =>
        serviceDeskApi.listTickets(workspaceId, { assigned_to_me: true, limit: 100 }),
      enabled: !!userId,
      retry: false,
    })),
  });

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workspaceList) map.set(w.id, w.name);
    return map;
  }, [workspaceList]);

  // `useQueries` hands back a new array of result objects every render, so the
  // ticket data needs a value-shaped dependency rather than the array itself.
  const ticketData = ticketQueries.map((q) => q.data);
  const ticketSignature = ticketQueries
    .map((q) => `${q.dataUpdatedAt}:${q.errorUpdatedAt}`)
    .join(",");
  const serviceDeskData = serviceDeskQueries.map((q) => q.data);
  const serviceDeskSignature = serviceDeskQueries
    .map((q) => `${q.dataUpdatedAt}:${q.errorUpdatedAt}`)
    .join(",");

  /** Every item in scope, before the status bucket is applied. */
  const scopedItems = useMemo(() => {
    const items: WorkItem[] = [];

    if (source === "all" || source === "tasks") {
      for (const task of asArray(taskQuery.data)) {
        items.push({
          kind: "task",
          itemType: (task.item_type ?? "task") as WorkItem["itemType"],
          id: task.id,
          title: task.title,
          subtitle: task.sprint_name ?? "",
          reference: task.reference,
          status: task.status,
          priority: task.priority,
          createdAt: task.created_at,
          storyPoints: task.story_points,
          workspaceId: task.workspace_id,
          workspaceName:
            task.workspace_name ??
            (task.workspace_id ? workspaceNameById.get(task.workspace_id) ?? null : null),
          href: taskHref(task),
        });
      }
    }

    ticketData.forEach((data, index) => {
      const workspaceId = ticketWorkspaceIds[index];
      const tickets: TicketListItem[] = asArray(data?.tickets);
      for (const ticket of tickets) {
        items.push({
          kind: "ticket",
          itemType: "ticket",
          id: ticket.id,
          title: ticket.submitter_name || ticket.submitter_email || "",
          subtitle: ticket.form_name ?? "",
          reference: `TKT-${ticket.ticket_number}`,
          status: ticket.status,
          priority: ticket.priority ?? null,
          createdAt: ticket.created_at,
          slaBreached: !!ticket.sla_breached,
          assigneeName: ticket.assignee_name ?? null,
          workspaceId,
          workspaceName: workspaceNameById.get(workspaceId) ?? null,
          href: `/tickets/${ticket.id}`,
        });
      }
    });

    serviceDeskData.forEach((data, index) => {
      const workspaceId = serviceDeskWorkspaceIds[index];
      const tickets: ServiceDeskTicket[] = asArray(data);
      for (const ticket of tickets) {
        items.push({
          kind: "ticket",
          itemType: "service_desk",
          // The detail route is keyed by the generic ticket id, not by the
          // service-desk row's own id.
          id: ticket.ticket_id,
          title: ticket.subject || ticket.requester_name || ticket.requester_email || "",
          subtitle: ticket.account_name ?? "",
          reference: ticket.display_id,
          status: ticket.status ?? "",
          priority: null,
          createdAt: ticket.created_at,
          workspaceId,
          workspaceName: workspaceNameById.get(workspaceId) ?? null,
          href: `/service-desk/tickets/${ticket.ticket_id}`,
        });
      }
    });

    const query = search.trim();
    return items
      .filter((item) => matchesSearch(item, query))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // `ticketData`/`serviceDeskData` are rebuilt every render; the signatures
    // are what actually change when one of those queries resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    taskQuery.data,
    ticketSignature,
    ticketWorkspaceIds,
    serviceDeskSignature,
    serviceDeskWorkspaceIds,
    workspaceNameById,
    search,
  ]);

  const items = useMemo(
    () => scopedItems.filter((item) => inBucket(item, statusBucket)),
    [scopedItems, statusBucket]
  );

  /**
   * Tile counts, deliberately taken before the status filter: a filtered tile
   * row that only ever showed its own bucket's count would leave you no way to
   * see what else is waiting without clearing the filter first.
   */
  const counts = useMemo(
    () => ({
      total: scopedItems.length,
      inProgress: scopedItems.filter((i) => inBucket(i, "in_progress")).length,
      todo: scopedItems.filter((i) => inBucket(i, "todo")).length,
      slaBreached: scopedItems.filter((i) => i.slaBreached).length,
      byType: {
        task: scopedItems.filter((i) => i.itemType === "task").length,
        bug: scopedItems.filter((i) => i.itemType === "bug").length,
        story: scopedItems.filter((i) => i.itemType === "story").length,
        ticket: scopedItems.filter((i) => i.itemType === "ticket").length,
        service_desk: scopedItems.filter((i) => i.itemType === "service_desk").length,
      },
    }),
    [scopedItems]
  );

  const isLoading =
    isLoadingAccess ||
    (taskQueryEnabled && taskQuery.isLoading) ||
    ticketQueries.some((q) => q.isLoading) ||
    serviceDeskQueries.some((q) => q.isLoading);

  return {
    items,
    counts,
    isLoading,
    canSeeTickets,
    canSeeServiceDesk,
    workspaces: workspaceList,
    showWorkspaceFilter,
    scope,
    currentWorkspaceId,
  };
}

export type { StatusBucket };
