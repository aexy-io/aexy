"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Plus,
  Pencil,
  MessageSquare,
  ArrowRightLeft,
  UserPlus,
  TrendingUp,
  Link2,
  Unlink,
  Loader2,
  Send,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Play,
  Pause,
  XCircle,
  Copy,
  ToggleLeft,
  Undo2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { EntityActivity, EntityActivityType, ActivityActionType } from "@/lib/api";

const ENTITY_FILTERS: { value: EntityActivityType; label: string }[] = [
  { value: "task", label: "Tasks" },
  { value: "story", label: "Stories" },
  { value: "epic", label: "Epics" },
  { value: "bug", label: "Bugs" },
  { value: "goal", label: "Goals" },
  { value: "sprint", label: "Sprints" },
  { value: "crm_record", label: "CRM" },
  { value: "document", label: "Docs" },
  { value: "ticket", label: "Tickets" },
];

function getIcon(type: ActivityActionType) {
  const map: Record<string, React.ElementType> = {
    created: Plus,
    updated: Pencil,
    comment: MessageSquare,
    status_changed: ArrowRightLeft,
    assigned: UserPlus,
    progress_updated: TrendingUp,
    linked: Link2,
    unlinked: Unlink,
    published: Send,
    archived: Archive,
    resolved: CheckCircle2,
    escalated: AlertTriangle,
    deleted: Trash2,
    completed: CheckCircle2,
    started: Play,
    paused: Pause,
    resumed: Play,
    submitted: Send,
    approved: CheckCircle2,
    rejected: XCircle,
    duplicated: Copy,
    toggled: ToggleLeft,
    withdrawn: Undo2,
    cancelled: XCircle,
  };
  const Icon = map[type] || Activity;
  return <Icon className="h-3 w-3" />;
}

function getColor(type: ActivityActionType): string {
  const map: Record<string, string> = {
    created: "text-emerald-400",
    updated: "text-blue-400",
    comment: "text-purple-400",
    status_changed: "text-amber-400",
    assigned: "text-cyan-400",
    deleted: "text-red-400",
    completed: "text-emerald-400",
    resolved: "text-emerald-400",
  };
  return map[type] || "text-muted-foreground";
}

function getVerb(type: ActivityActionType): string {
  const map: Record<string, string> = {
    created: "created",
    updated: "updated",
    comment: "commented on",
    status_changed: "changed status of",
    assigned: "assigned",
    deleted: "deleted",
    completed: "completed",
    resolved: "resolved",
    published: "published",
    archived: "archived",
    started: "started",
  };
  return map[type] || type.replace("_", " ");
}

function getEntityRoute(entityType: EntityActivityType, entityId: string): string {
  const map: Record<string, string> = {
    task: `/sprints?task=${entityId}`,
    story: `/sprints?story=${entityId}`,
    epic: `/sprints?tab=epics&epic=${entityId}`,
    goal: "/reviews/goals",
    sprint: `/sprints?sprint=${entityId}`,
    ticket: `/tickets/${entityId}`,
    crm_record: "/crm",
    document: `/docs/${entityId}`,
  };
  return map[entityType] || "#";
}

function formatTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WidgetActivityView() {
  const { currentWorkspaceId } = useWorkspace();
  const [filter, setFilter] = useState<EntityActivityType | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    activities,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useActivityFeed(currentWorkspaceId || null, { entity_type: filter });

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter chips */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter(undefined)}
          className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition ${
            !filter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </button>
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(filter === f.value ? undefined : f.value)}
            className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition ${
              filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          <>
            {activities.map((a) => {
              const entityLink = a.url || getEntityRoute(a.entity_type, a.entity_id);
              const label = a.title || `${a.entity_type} #${a.entity_id.slice(0, 8)}`;
              return (
                <div key={a.id} className="flex gap-2 px-3 py-2 hover:bg-muted/30 transition border-b border-border/30">
                  {/* Avatar */}
                  <div className="shrink-0 mt-0.5">
                    {a.actor_avatar_url ? (
                      <img src={a.actor_avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                        {a.actor_name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap text-xs">
                      <span className="font-medium">{a.actor_name || "System"}</span>
                      <span className="text-muted-foreground">{getVerb(a.activity_type)}</span>
                      <Link href={entityLink} className="font-medium text-primary hover:underline truncate">
                        {label}
                      </Link>
                    </div>
                    {a.activity_type === "comment" && a.content && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{a.content}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className={getColor(a.activity_type)}>{getIcon(a.activity_type)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(a.created_at)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} className="h-4" />
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
