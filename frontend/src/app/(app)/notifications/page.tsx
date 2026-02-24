"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Notification } from "@/lib/api";
import {
  Bell,
  Check,
  Loader2,
  Settings,
  Inbox,
} from "lucide-react";
import Link from "next/link";

type FilterTab = "all" | "unread";

interface DateGroup {
  label: string;
  notifications: Notification[];
}

function groupByDate(notifications: Notification[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Notification[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= today) {
      groups["Today"].push(n);
    } else if (d >= yesterday) {
      groups["Yesterday"].push(n);
    } else if (d >= weekAgo) {
      groups["This Week"].push(n);
    } else {
      groups["Older"].push(n);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, notifications: items }));
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterTab>("all");

  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications(user?.id);

  const filtered = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, filter]);

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "You're all caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-card hover:bg-accent border border-border rounded-lg transition"
            >
              <Check className="h-4 w-4" />
              Mark all read
            </button>
          )}
          <Link
            href="/settings/notifications"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-card hover:bg-accent border border-border rounded-lg transition"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {(["all", "unread"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              filter === tab
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
            }`}
          >
            {tab === "all" ? "All" : "Unread"}
            {tab === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">
            Loading notifications...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            {filter === "unread" ? (
              <Check className="h-7 w-7 text-muted-foreground" />
            ) : (
              <Inbox className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">
            {filter === "unread"
              ? "No unread notifications"
              : "No notifications yet"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {filter === "unread"
              ? "You've read all your notifications. Nice work!"
              : "When you receive notifications, they'll show up here."}
          </p>
          {filter === "unread" && notifications.length > 0 && (
            <button
              onClick={() => setFilter("all")}
              className="mt-4 text-sm text-primary hover:text-primary/80 transition"
            >
              View all notifications
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label}>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {group.label}
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                {group.notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotification}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground bg-card hover:bg-accent border border-border rounded-lg transition"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
