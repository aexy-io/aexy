"use client";

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
  X,
} from "lucide-react";
import { Notification } from "@/lib/api";
import { formatNotificationTime, getNotificationColor } from "@/hooks/useNotifications";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

const iconMap: Record<string, React.ElementType> = {
  "peer_review_requested": UserPlus,
  "peer_review_received": MessageCircle,
  "review_cycle_phase_changed": RefreshCw,
  "manager_review_completed": CheckCircle,
  "review_acknowledged": ThumbsUp,
  "deadline_reminder_1_day": Clock,
  "deadline_reminder_day_of": Clock,
  "goal_auto_linked": Link,
  "goal_at_risk": AlertTriangle,
  "goal_completed": Trophy,
  "workspace_invite": Mail,
  "team_added": Users,
};

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClose,
}: NotificationItemProps) {
  const router = useRouter();
  const Icon = iconMap[notification.event_type] || Bell;
  const colorClass = getNotificationColor(notification.event_type);

  const handleClick = () => {
    // Mark as read
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }

    // Navigate if action_url is present
    if (notification.context.action_url) {
      router.push(notification.context.action_url);
      onClose?.();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex items-start gap-3 p-3 cursor-pointer transition-colors ${
        notification.is_read
          ? "bg-transparent hover:bg-slate-800/50"
          : "bg-primary-500/5 hover:bg-primary-500/10"
      }`}
    >
      {/* Unread indicator */}
      {!notification.is_read && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary-500 rounded-full" />
      )}

      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${notification.is_read ? "text-slate-300" : "text-white"}`}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-slate-500 mt-1">
          {formatNotificationTime(notification.created_at)}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 transition-all"
        title="Delete notification"
      >
        <X className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300" />
      </button>
    </div>
  );
}
