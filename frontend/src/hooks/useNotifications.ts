import { useState, useEffect, useCallback, useRef } from "react";
import {
  notificationsApi,
  Notification,
  NotificationListResponse,
  NotificationPreference,
  NotificationPreferencesResponse,
  CategoryPreference,
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
  const [categoryPreferences, setCategoryPreferences] = useState<Record<string, CategoryPreference>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string[]>>({});
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
      setCategoryPreferences(data.categories || {});
      setCategoryMap(data.category_map || {});
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
      web_push_enabled?: boolean;
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

  const updateCategoryPreference = useCallback(async (
    category: string,
    updates: {
      in_app_enabled?: boolean;
      email_enabled?: boolean;
      slack_enabled?: boolean;
      web_push_enabled?: boolean;
      slack_channel_id?: string | null;
      slack_channel_name?: string | null;
    }
  ) => {
    if (!developerId) return;
    try {
      const updated = await notificationsApi.updateCategoryPreference(developerId, category, updates);
      setCategoryPreferences(prev => ({
        ...prev,
        [category]: updated,
      }));
      // Re-fetch all preferences since category update propagates to child events
      await fetchPreferences();
    } catch (err) {
      console.error("Failed to update category preference:", err);
      throw err;
    }
  }, [developerId, fetchPreferences]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    availableEventTypes,
    categoryPreferences,
    categoryMap,
    isLoading,
    error,
    refetch: fetchPreferences,
    updatePreference,
    updateCategoryPreference,
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
    case "oncall_shift_starting":
    case "oncall_shift_started":
    case "oncall_shift_ending":
      return "shield";
    case "oncall_swap_requested":
    case "oncall_swap_accepted":
    case "oncall_swap_declined":
      return "repeat";
    case "agent_invoked":
      return "bot";
    case "blocker_escalated":
      return "alert-octagon";
    case "uptime_incident_created":
      return "wifi-off";
    case "uptime_incident_resolved":
      return "wifi";
    case "learning_approval_requested":
    case "learning_approval_decided":
      return "book-open";
    case "learning_goal_assigned":
    case "learning_goal_overdue":
      return "target";
    case "learning_activity_completed":
      return "award";
    case "form_submission_received":
    case "form_submission_failed":
      return "file-text";
    case "campaign_completed":
    case "campaign_scheduled":
      return "send";
    case "automation_run_failed":
    case "automation_run_completed":
      return "zap";
    case "assessment_invitation_sent":
    case "assessment_completed":
    case "candidate_stage_changed":
      return "clipboard-list";
    case "gtm_alert_triggered":
      return "trending-up";
    case "document_shared":
    case "document_mentioned":
    case "document_commented":
      return "file";
    case "leave_request_submitted":
    case "leave_request_approved":
    case "leave_request_rejected":
    case "leave_request_cancelled":
      return "calendar";
    case "reminder_due":
    case "reminder_overdue":
    case "reminder_escalated":
    case "reminder_assigned":
      return "alarm-clock";
    case "reminder_acknowledged":
    case "reminder_completed":
      return "check-square";
    case "usage_alert_80":
    case "usage_alert_90":
    case "usage_alert_100":
      return "bar-chart";
    case "insight_alert_warning":
    case "insight_alert_critical":
      return "activity";
    case "app_access_requested":
    case "app_access_approved":
    case "app_access_rejected":
      return "key";
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
      return "text-muted-foreground";
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
    case "oncall_shift_starting":
    case "oncall_shift_started":
    case "oncall_shift_ending":
      return "text-orange-400";
    case "oncall_swap_requested":
      return "text-blue-400";
    case "oncall_swap_accepted":
      return "text-green-400";
    case "oncall_swap_declined":
      return "text-red-400";
    case "agent_invoked":
      return "text-violet-400";
    case "blocker_escalated":
      return "text-red-500";
    case "uptime_incident_created":
      return "text-red-500";
    case "uptime_incident_resolved":
      return "text-green-400";
    case "learning_approval_requested":
      return "text-blue-400";
    case "learning_approval_decided":
      return "text-green-400";
    case "learning_goal_assigned":
      return "text-blue-400";
    case "learning_goal_overdue":
      return "text-red-400";
    case "learning_activity_completed":
      return "text-green-400";
    case "form_submission_received":
      return "text-blue-400";
    case "form_submission_failed":
      return "text-red-400";
    case "campaign_completed":
      return "text-green-400";
    case "campaign_scheduled":
      return "text-blue-400";
    case "automation_run_failed":
      return "text-red-400";
    case "automation_run_completed":
      return "text-green-400";
    case "assessment_invitation_sent":
      return "text-blue-400";
    case "assessment_completed":
      return "text-green-400";
    case "candidate_stage_changed":
      return "text-purple-400";
    case "gtm_alert_triggered":
      return "text-amber-400";
    case "document_shared":
      return "text-blue-400";
    case "document_mentioned":
      return "text-cyan-400";
    case "document_commented":
      return "text-purple-400";
    case "leave_request_submitted":
      return "text-blue-400";
    case "leave_request_approved":
      return "text-green-400";
    case "leave_request_rejected":
      return "text-red-400";
    case "leave_request_cancelled":
      return "text-amber-400";
    case "reminder_due":
    case "reminder_assigned":
      return "text-blue-400";
    case "reminder_overdue":
    case "reminder_escalated":
      return "text-red-400";
    case "reminder_acknowledged":
    case "reminder_completed":
      return "text-green-400";
    case "usage_alert_80":
      return "text-amber-400";
    case "usage_alert_90":
      return "text-orange-400";
    case "usage_alert_100":
      return "text-red-500";
    case "insight_alert_warning":
      return "text-amber-400";
    case "insight_alert_critical":
      return "text-red-500";
    case "app_access_requested":
      return "text-blue-400";
    case "app_access_approved":
      return "text-green-400";
    case "app_access_rejected":
      return "text-red-400";
    default:
      return "text-muted-foreground";
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
