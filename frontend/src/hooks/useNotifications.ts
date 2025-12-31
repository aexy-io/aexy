import { useState, useEffect, useCallback, useRef } from "react";
import {
  notificationsApi,
  Notification,
  NotificationListResponse,
  NotificationPreference,
  NotificationPreferencesResponse,
} from "@/lib/api";

// ============ Notifications Hook ============

export function useNotifications(developerId: string | null | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const lastPollTime = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.list(developerId, {
        page: pageNum,
        per_page: 20,
      });
      if (append) {
        setNotifications(prev => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications);
      }
      setUnreadCount(data.unread_count);
      setHasMore(data.has_next);
      setPage(pageNum);

      // Update last poll time
      if (data.notifications.length > 0) {
        lastPollTime.current = data.notifications[0].created_at;
      }
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch notifications:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId]);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    if (!developerId) return;
    try {
      const data = await notificationsApi.getUnreadCount(developerId);
      setUnreadCount(data.count);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, [developerId]);

  // Poll for new notifications
  const pollNotifications = useCallback(async () => {
    if (!developerId || !lastPollTime.current) return;
    try {
      const data = await notificationsApi.poll(developerId, lastPollTime.current);
      if (data.notifications.length > 0) {
        // Prepend new notifications
        setNotifications(prev => [...data.notifications, ...prev]);
        setUnreadCount(prev => prev + data.notifications.length);
        if (data.latest_timestamp) {
          lastPollTime.current = data.latest_timestamp;
        }
      }
    } catch (err) {
      console.error("Failed to poll notifications:", err);
    }
  }, [developerId]);

  // Mark single as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!developerId) return;
    try {
      await notificationsApi.markAsRead(notificationId, developerId);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }, [developerId]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!developerId) return;
    try {
      await notificationsApi.markAllAsRead(developerId);
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [developerId]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!developerId) return;
    try {
      const notification = notifications.find(n => n.id === notificationId);
      await notificationsApi.delete(notificationId, developerId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }, [developerId, notifications]);

  // Load more
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchNotifications(page + 1, true);
    }
  }, [hasMore, isLoading, page, fetchNotifications]);

  // Initial fetch
  useEffect(() => {
    if (developerId) {
      fetchNotifications(1, false);
    }
  }, [developerId, fetchNotifications]);

  // Set up polling interval (every 30 seconds)
  useEffect(() => {
    if (!developerId) return;

    // Start polling after initial fetch
    pollIntervalRef.current = setInterval(pollNotifications, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [developerId, pollNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    hasMore,
    refetch: () => fetchNotifications(1, false),
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchUnreadCount,
  };
}

// ============ Notification Preferences Hook ============

export function useNotificationPreferences(developerId: string | null | undefined) {
  const [preferences, setPreferences] = useState<Record<string, NotificationPreference>>({});
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!developerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.getPreferences(developerId);
      setPreferences(data.preferences);
      setAvailableEventTypes(data.available_event_types);
    } catch (err) {
      setError(err as Error);
      console.error("Failed to fetch notification preferences:", err);
    } finally {
      setIsLoading(false);
    }
  }, [developerId]);

  const updatePreference = useCallback(async (
    eventType: string,
    updates: {
      in_app_enabled?: boolean;
      email_enabled?: boolean;
      slack_enabled?: boolean;
    }
  ) => {
    if (!developerId) return;
    try {
      const updated = await notificationsApi.updatePreference(developerId, eventType, updates);
      setPreferences(prev => ({
        ...prev,
        [eventType]: updated,
      }));
    } catch (err) {
      console.error("Failed to update preference:", err);
      throw err;
    }
  }, [developerId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    availableEventTypes,
    isLoading,
    error,
    refetch: fetchPreferences,
    updatePreference,
  };
}

// ============ Helpers ============

export function getNotificationIcon(eventType: string): string {
  switch (eventType) {
    case "peer_review_requested":
      return "user-plus";
    case "peer_review_received":
      return "message-circle";
    case "review_cycle_phase_changed":
      return "refresh-cw";
    case "manager_review_completed":
      return "check-circle";
    case "review_acknowledged":
      return "thumbs-up";
    case "deadline_reminder_1_day":
    case "deadline_reminder_day_of":
      return "clock";
    case "goal_auto_linked":
      return "link";
    case "goal_at_risk":
      return "alert-triangle";
    case "goal_completed":
      return "trophy";
    case "workspace_invite":
      return "mail";
    case "team_added":
      return "users";
    default:
      return "bell";
  }
}

export function getNotificationColor(eventType: string): string {
  switch (eventType) {
    case "peer_review_requested":
      return "text-blue-400";
    case "peer_review_received":
      return "text-green-400";
    case "review_cycle_phase_changed":
      return "text-purple-400";
    case "manager_review_completed":
      return "text-green-400";
    case "review_acknowledged":
      return "text-slate-400";
    case "deadline_reminder_1_day":
      return "text-amber-400";
    case "deadline_reminder_day_of":
      return "text-red-400";
    case "goal_auto_linked":
      return "text-cyan-400";
    case "goal_at_risk":
      return "text-red-400";
    case "goal_completed":
      return "text-green-400";
    case "workspace_invite":
      return "text-blue-400";
    case "team_added":
      return "text-purple-400";
    default:
      return "text-slate-400";
  }
}

export function formatNotificationTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
