"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  Bell,
  MessageSquare,
  AtSign,
  Share2,
  Edit3,
  Check,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { useDocumentNotifications } from "@/hooks/useNotionDocs";
import { DocumentNotification } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface NotificationInboxProps {
  workspaceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const notificationIcons: Record<string, typeof MessageSquare> = {
  comment: MessageSquare,
  mention: AtSign,
  share: Share2,
  edit: Edit3,
};

export function NotificationInbox({
  workspaceId,
  isOpen,
  onClose,
}: NotificationInboxProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    isMarkingRead,
  } = useDocumentNotifications(workspaceId);

  if (!isOpen) return null;

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary-500/20 text-primary-400 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                disabled={isMarkingRead}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No notifications yet</p>
              <p className="text-muted-foreground text-xs mt-1">
                You'll see updates about your documents here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={() => markRead(notification.id)}
                  formatTime={formatTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface NotificationItemProps {
  notification: DocumentNotification;
  onMarkRead: () => void;
  formatTime: (date: string) => string;
}

function NotificationItem({
  notification,
  onMarkRead,
  formatTime,
}: NotificationItemProps) {
  const Icon = notificationIcons[notification.type] || Bell;

  return (
    <Link
      href={`/docs/${notification.document_id}`}
      onClick={() => {
        if (!notification.is_read) {
          onMarkRead();
        }
      }}
      className={`block px-4 py-3 hover:bg-muted/50 transition-colors ${
        !notification.is_read ? "bg-muted/30" : ""
      }`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            !notification.is_read
              ? "bg-primary-500/20 text-primary-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${
              !notification.is_read ? "text-foreground" : "text-foreground"
            }`}
          >
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {notification.document_icon && (
              <span className="text-xs">{notification.document_icon}</span>
            )}
            <span className="text-xs text-muted-foreground truncate">
              {notification.document_title || "Untitled"}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(notification.created_at)}
            </span>
          </div>
        </div>

        {/* Unread indicator */}
        {!notification.is_read && (
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-500 mt-2" />
        )}
      </div>
    </Link>
  );
}
