"use client";

import {
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  XCircle,
  LucideIcon,
} from "lucide-react";

export type ActivityType =
  | "standup_submitted"
  | "time_logged"
  | "blocker_reported"
  | "blocker_resolved"
  | "blocker_escalated"
  | "task_completed"
  | "task_started";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: Date | string;
  metadata?: {
    taskId?: string;
    taskTitle?: string;
    duration?: number;
    severity?: string;
  };
  user?: {
    name: string;
    avatar_url?: string;
  };
}

const activityConfig: Record<ActivityType, { icon: LucideIcon; color: string; bgColor: string }> = {
  standup_submitted: {
    icon: MessageSquare,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  time_logged: {
    icon: Clock,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  blocker_reported: {
    icon: AlertTriangle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  blocker_resolved: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  blocker_escalated: {
    icon: ArrowUpCircle,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  task_completed: {
    icon: CheckCircle2,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  task_started: {
    icon: Clock,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
};

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
  showTimestamp?: boolean;
  showUser?: boolean;
  compact?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function ActivityFeed({
  activities,
  maxItems,
  showTimestamp = true,
  showUser = false,
  compact = false,
  emptyMessage = "No recent activity",
  className = "",
}: ActivityFeedProps) {
  const displayActivities = maxItems ? activities.slice(0, maxItems) : activities;

  const formatTimestamp = (timestamp: Date | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (displayActivities.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground ${className}`}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {displayActivities.map((activity, index) => {
        const config = activityConfig[activity.type];
        const Icon = config.icon;

        if (compact) {
          return (
            <div
              key={activity.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className={`p-1.5 ${config.bgColor} rounded-lg shrink-0`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <p className="text-sm text-foreground flex-1 truncate">{activity.title}</p>
              {showTimestamp && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTimestamp(activity.timestamp)}
                </span>
              )}
            </div>
          );
        }

        return (
          <div key={activity.id} className="flex gap-3 py-3">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={`p-2 ${config.bgColor} rounded-lg shrink-0`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              {index < displayActivities.length - 1 && (
                <div className="w-px flex-1 bg-accent my-2" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-foreground">{activity.title}</p>
                  {activity.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
                  )}
                </div>
                {showTimestamp && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                )}
              </div>

              {showUser && activity.user && (
                <div className="flex items-center gap-2 mt-2">
                  {activity.user.avatar_url ? (
                    <img
                      src={activity.user.avatar_url}
                      alt={activity.user.name}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-xs text-muted-foreground">
                      {activity.user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">{activity.user.name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper to convert tracking data to activity items
export function createActivityFromStandup(standup: {
  id: string;
  submitted_at: string;
  developer?: { name?: string | null; avatar_url?: string | null } | null;
}): ActivityItem {
  return {
    id: `standup-${standup.id}`,
    type: "standup_submitted",
    title: "Submitted daily standup",
    timestamp: standup.submitted_at,
    user: standup.developer?.name
      ? { name: standup.developer.name, avatar_url: standup.developer.avatar_url ?? undefined }
      : undefined,
  };
}

export function createActivityFromTimeEntry(entry: {
  id: string;
  duration_minutes: number;
  description?: string | null;
  created_at: string;
  task?: { title: string } | null;
  developer?: { name?: string | null; avatar_url?: string | null } | null;
}): ActivityItem {
  const hours = Math.floor(entry.duration_minutes / 60);
  const mins = entry.duration_minutes % 60;
  const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return {
    id: `time-${entry.id}`,
    type: "time_logged",
    title: `Logged ${duration}${entry.task ? ` on ${entry.task.title}` : ""}`,
    description: entry.description ?? undefined,
    timestamp: entry.created_at,
    metadata: { duration: entry.duration_minutes },
    user: entry.developer?.name
      ? { name: entry.developer.name, avatar_url: entry.developer.avatar_url ?? undefined }
      : undefined,
  };
}

export function createActivityFromBlocker(blocker: {
  id: string;
  description: string;
  status: string;
  severity: string;
  reported_at: string;
  updated_at: string;
  developer?: { name?: string | null; avatar_url?: string | null } | null;
}): ActivityItem {
  const type: ActivityType =
    blocker.status === "resolved"
      ? "blocker_resolved"
      : blocker.status === "escalated"
      ? "blocker_escalated"
      : "blocker_reported";

  return {
    id: `blocker-${blocker.id}`,
    type,
    title:
      type === "blocker_resolved"
        ? "Resolved blocker"
        : type === "blocker_escalated"
        ? "Escalated blocker"
        : "Reported new blocker",
    description: blocker.description,
    timestamp: type === "blocker_reported" ? blocker.reported_at : blocker.updated_at,
    metadata: { severity: blocker.severity },
    user: blocker.developer?.name
      ? { name: blocker.developer.name, avatar_url: blocker.developer.avatar_url ?? undefined }
      : undefined,
  };
}
