"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCircle, X, Minus, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useInbox } from "@/hooks/useChat";
import { useChatWebSocketContext } from "@/contexts/ChatWebSocketContext";
import { WidgetChatView } from "./WidgetChatView";
import { WidgetNotificationsView } from "./WidgetNotificationsView";
import { WidgetActivityView } from "./WidgetActivityView";
import { cn } from "@/lib/utils";

type Tab = "threads" | "notifications" | "activity";

export function FloatingChatWidget() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { workspaceId } = useChatWebSocketContext();
  const { unreadCount: notifUnread } = useNotifications(user?.id);
  const { data: inboxTopics } = useInbox(workspaceId);

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("threads");

  // Don't show on chat pages
  const isChatPage = pathname?.startsWith("/chat");
  if (isChatPage) return null;

  // Count total inbox unread
  const inboxUnread = inboxTopics?.reduce((sum, t) => sum + (t.unread_count || 0), 0) || 0;
  const totalBadge = inboxUnread + notifUnread;

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center"
        title="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
        {totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
    );
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center"
        title="Expand chat"
      >
        <MessageCircle className="h-5 w-5" />
        {totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[520px] h-[600px] bg-background border border-border rounded-xl shadow-2xl shadow-black/20 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 pt-2">
          <div className="flex gap-1">
            {([
              { key: "threads", label: "Threads", badge: inboxUnread },
              { key: "notifications", label: "Notifications", badge: notifUnread },
              { key: "activity", label: "Activity", badge: 0 },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors relative",
                  activeTab === tab.key
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Link
              href="/chat"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              title="Open full view"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="h-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "threads" && <WidgetChatView />}
        {activeTab === "notifications" && <WidgetNotificationsView />}
        {activeTab === "activity" && <WidgetActivityView />}
      </div>
    </div>
  );
}
