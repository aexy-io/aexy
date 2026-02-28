"use client";

import { useAuth } from "@/hooks/useAuth";
import { useNotifications, formatNotificationTime, getNotificationColor } from "@/hooks/useNotifications";
import { Notification } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  Bell,
  UserPlus,
  MessageCircle,
  RefreshCw,
  CheckCircle,
  ThumbsUp,
  Clock,
  Link,
  AlertTriangle,
  Trophy,
  Mail,
  Users,
  Check,
  Loader2,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  peer_review_requested: UserPlus,
  peer_review_received: MessageCircle,
  review_cycle_phase_changed: RefreshCw,
  manager_review_completed: CheckCircle,
  review_acknowledged: ThumbsUp,
  deadline_reminder_1_day: Clock,
  deadline_reminder_day_of: Clock,
  goal_auto_linked: Link,
  goal_at_risk: AlertTriangle,
  goal_completed: Trophy,
  workspace_invite: Mail,
  team_added: Users,
};

export function WidgetNotificationsView() {
  const { user } = useAuth();
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
  } = useNotifications(user?.id);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.context?.action_url) router.push(n.context.action_url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition"
          >
            <Check className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <>
            {notifications.map((n) => {
              const Icon = iconMap[n.event_type] || Bell;
              const color = getNotificationColor(n.event_type);
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-border/50 transition-colors ${
                    n.is_read ? "hover:bg-muted/50" : "bg-primary/5 hover:bg-primary/10"
                  }`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-md bg-muted flex items-center justify-center ${color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {formatNotificationTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition flex items-center justify-center gap-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
