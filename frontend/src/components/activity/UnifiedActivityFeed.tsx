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
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import {
  EntityActivity,
  EntityActivityType,
  ActivityActionType,
} from "@/lib/api";

// ── Entity type filter chips ──

const ENTITY_TYPE_FILTERS: { value: EntityActivityType; label: string }[] = [
  { value: "task", label: "Tasks" },
  { value: "story", label: "Stories" },
  { value: "epic", label: "Epics" },
  { value: "bug", label: "Bugs" },
  { value: "goal", label: "Goals" },
  { value: "backlog", label: "Backlog" },
  { value: "release", label: "Releases" },
  { value: "roadmap", label: "Roadmaps" },
  { value: "ticket", label: "Tickets" },
  { value: "crm_record", label: "CRM" },
  { value: "document", label: "Docs" },
  { value: "assessment", label: "Assessments" },
  { value: "compliance", label: "Compliance" },
  { value: "project", label: "Projects" },
  { value: "sprint", label: "Sprints" },
  { value: "workflow", label: "Workflows" },
  { value: "agent", label: "Agents" },
  { value: "template", label: "Templates" },
  { value: "campaign", label: "Campaigns" },
  { value: "form", label: "Forms" },
  { value: "leave_request", label: "Leave" },
  { value: "review", label: "Reviews" },
  { value: "role", label: "Roles" },
];

// ── Helpers ──

function getActivityIcon(type: ActivityActionType) {
  switch (type) {
    case "created":
      return <Plus className="h-3.5 w-3.5" />;
    case "updated":
      return <Pencil className="h-3.5 w-3.5" />;
    case "comment":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "status_changed":
      return <ArrowRightLeft className="h-3.5 w-3.5" />;
    case "assigned":
      return <UserPlus className="h-3.5 w-3.5" />;
    case "progress_updated":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "linked":
      return <Link2 className="h-3.5 w-3.5" />;
    case "unlinked":
      return <Unlink className="h-3.5 w-3.5" />;
    case "published":
      return <Send className="h-3.5 w-3.5" />;
    case "archived":
      return <Archive className="h-3.5 w-3.5" />;
    case "resolved":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "escalated":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "deleted":
      return <Trash2 className="h-3.5 w-3.5" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "started":
      return <Play className="h-3.5 w-3.5" />;
    case "paused":
      return <Pause className="h-3.5 w-3.5" />;
    case "resumed":
      return <Play className="h-3.5 w-3.5" />;
    case "submitted":
      return <Send className="h-3.5 w-3.5" />;
    case "approved":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "rejected":
      return <XCircle className="h-3.5 w-3.5" />;
    case "duplicated":
      return <Copy className="h-3.5 w-3.5" />;
    case "toggled":
      return <ToggleLeft className="h-3.5 w-3.5" />;
    case "withdrawn":
      return <Undo2 className="h-3.5 w-3.5" />;
    case "cancelled":
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <Activity className="h-3.5 w-3.5" />;
  }
}

function getActivityColor(type: ActivityActionType): string {
  switch (type) {
    case "created":
      return "bg-emerald-500/10 text-emerald-400";
    case "updated":
      return "bg-blue-500/10 text-blue-400";
    case "comment":
      return "bg-purple-500/10 text-purple-400";
    case "status_changed":
      return "bg-amber-500/10 text-amber-400";
    case "assigned":
      return "bg-cyan-500/10 text-cyan-400";
    case "progress_updated":
      return "bg-indigo-500/10 text-indigo-400";
    case "linked":
      return "bg-teal-500/10 text-teal-400";
    case "unlinked":
      return "bg-red-500/10 text-red-400";
    case "published":
      return "bg-green-500/10 text-green-400";
    case "archived":
      return "bg-gray-500/10 text-gray-400";
    case "resolved":
      return "bg-emerald-500/10 text-emerald-400";
    case "escalated":
      return "bg-orange-500/10 text-orange-400";
    case "deleted":
      return "bg-red-500/10 text-red-400";
    case "completed":
      return "bg-emerald-500/10 text-emerald-400";
    case "started":
      return "bg-green-500/10 text-green-400";
    case "paused":
      return "bg-yellow-500/10 text-yellow-400";
    case "resumed":
      return "bg-green-500/10 text-green-400";
    case "submitted":
      return "bg-blue-500/10 text-blue-400";
    case "approved":
      return "bg-emerald-500/10 text-emerald-400";
    case "rejected":
      return "bg-red-500/10 text-red-400";
    case "duplicated":
      return "bg-purple-500/10 text-purple-400";
    case "toggled":
      return "bg-amber-500/10 text-amber-400";
    case "withdrawn":
      return "bg-gray-500/10 text-gray-400";
    case "cancelled":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getActivityVerb(type: ActivityActionType): string {
  switch (type) {
    case "created":
      return "created";
    case "updated":
      return "updated";
    case "comment":
      return "commented on";
    case "status_changed":
      return "changed status of";
    case "assigned":
      return "assigned";
    case "progress_updated":
      return "updated progress of";
    case "linked":
      return "linked";
    case "unlinked":
      return "unlinked";
    case "published":
      return "published";
    case "archived":
      return "archived";
    case "resolved":
      return "resolved";
    case "escalated":
      return "escalated";
    case "deleted":
      return "deleted";
    case "completed":
      return "completed";
    case "started":
      return "started";
    case "paused":
      return "paused";
    case "resumed":
      return "resumed";
    case "submitted":
      return "submitted";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "duplicated":
      return "duplicated";
    case "toggled":
      return "toggled";
    case "withdrawn":
      return "withdrew";
    case "cancelled":
      return "cancelled";
    default:
      return "modified";
  }
}

function getEntityRoute(entityType: EntityActivityType, entityId: string): string {
  switch (entityType) {
    case "task":
      return `/sprints?task=${entityId}`;
    case "story":
      return `/sprints?story=${entityId}`;
    case "epic":
      return `/sprints?tab=epics&epic=${entityId}`;
    case "bug":
      return `/sprints`;
    case "goal":
      return `/reviews/goals`;
    case "backlog":
      return `/sprints?tab=backlog`;
    case "release":
      return `/sprints`;
    case "roadmap":
      return `/sprints`;
    case "ticket":
      return `/tickets/${entityId}`;
    case "crm_record":
      return `/crm`;
    case "document":
      return `/docs/${entityId}`;
    case "assessment":
      return `/hiring/assessments/${entityId}/edit`;
    case "compliance":
      return `/compliance/documents/${entityId}`;
    case "project":
      return `/settings/projects/${entityId}`;
    case "sprint":
      return `/sprints?sprint=${entityId}`;
    case "workflow":
      return `/automations/${entityId}`;
    case "agent":
      return `/agents/${entityId}`;
    case "template":
      return `/email-marketing/templates/${entityId}`;
    case "campaign":
      return `/email-marketing/campaigns/${entityId}`;
    case "form":
      return `/forms/${entityId}`;
    case "leave_request":
      return `/leave`;
    case "review":
      return `/reviews/cycles/${entityId}`;
    case "role":
      return `/settings/organization/roles`;
    default:
      return "#";
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── Activity Item (memoized to prevent re-renders on scroll) ──

const ActivityItem = React.memo(function ActivityItem({ activity }: { activity: EntityActivity }) {
  const color = getActivityColor(activity.activity_type);
  const entityLink = activity.url || getEntityRoute(activity.entity_type, activity.entity_id);
  const entityLabel = activity.title || `${activity.entity_type} #${activity.entity_id.slice(0, 8)}`;

  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-muted/30 transition rounded-lg group">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {activity.actor_avatar_url ? (
          <img
            src={activity.actor_avatar_url}
            alt={activity.actor_name || ""}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-muted-foreground">
            {activity.actor_name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
          <span className="font-medium text-foreground">
            {activity.actor_name || "System"}
          </span>
          <span className="text-muted-foreground">
            {getActivityVerb(activity.activity_type)}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground capitalize">
            {activity.entity_type}
          </span>
          <Link
            href={entityLink}
            className="font-medium text-primary-400 hover:text-primary-300 truncate transition"
          >
            {entityLabel}
          </Link>
        </div>

        {/* Comment content */}
        {activity.activity_type === "comment" && activity.content && (
          <p className="text-sm text-muted-foreground mt-1">
            {activity.content}
          </p>
        )}

        {/* Status change details */}
        {activity.activity_type === "status_changed" && activity.changes?.status && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <span className="px-1.5 py-0.5 bg-muted rounded">{activity.changes.status.old || "none"}</span>
            <span>&rarr;</span>
            <span className="px-1.5 py-0.5 bg-muted rounded">{activity.changes.status.new || "none"}</span>
          </div>
        )}
      </div>

      {/* Right side: icon + time */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className={`p-1 rounded ${color}`}>
          {getActivityIcon(activity.activity_type)}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(activity.created_at)}
        </span>
      </div>
    </div>
  );
});

// ── Main Component ──

export function UnifiedActivityFeed() {
  const { currentWorkspaceId } = useWorkspace();
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityActivityType | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    activities,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useActivityFeed(currentWorkspaceId || null, {
    entity_type: entityTypeFilter,
  });

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
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

  // Group activities by date (memoized to avoid recomputation on unrelated re-renders)
  const grouped = useMemo(() => {
    const groups: { label: string; items: EntityActivity[] }[] = [];
    let currentGroup = "";
    for (const item of activities) {
      const label = getDateGroupLabel(item.created_at);
      if (label !== currentGroup) {
        currentGroup = label;
        groups.push({ label, items: [item] });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  }, [activities]);

  return (
    <div>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setEntityTypeFilter(undefined)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            !entityTypeFilter
              ? "bg-primary-500 text-white"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          All
        </button>
        {ENTITY_TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() =>
              setEntityTypeFilter(entityTypeFilter === f.value ? undefined : f.value)
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              entityTypeFilter === f.value
                ? "bg-primary-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity count */}
      {!isLoading && total > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Showing {activities.length} of {total} activities
        </p>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3 animate-pulse">
              <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-foreground font-medium mb-1">Failed to load activities</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">
            Something went wrong while fetching the activity feed.
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-accent transition"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && activities.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-foreground font-medium mb-1">No activity yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Activity from all modules will appear here as your team works across tasks, stories, goals, and more.
          </p>
        </div>
      )}

      {/* Grouped activity list */}
      {!isLoading && grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={`${group.label}-${group.items[0]?.id}`}>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm px-4 py-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <ActivityItem key={item.id} activity={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={bottomRef} className="h-10" />

      {/* Loading more indicator */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading more...
        </div>
      )}

      {/* End of list */}
      {!isLoading && !hasNextPage && activities.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">
          You&apos;ve reached the end
        </p>
      )}
    </div>
  );
}
