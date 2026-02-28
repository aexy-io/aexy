"use client";

import { useState } from "react";
import { useInbox } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { InboxTopic } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { Hash, Inbox, Bell, Activity } from "lucide-react";
import { WidgetNotificationsView } from "@/components/chat/WidgetNotificationsView";
import { WidgetActivityView } from "@/components/chat/WidgetActivityView";
import { cn } from "@/lib/utils";

type InboxTab = "threads" | "notifications" | "activity";

interface InboxViewProps {
  workspaceId: string;
  onSelectTopic: (topic: InboxTopic) => void;
}

export function InboxView({ workspaceId, onSelectTopic }: InboxViewProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>("threads");
  const { data: topics, isLoading } = useInbox(workspaceId);
  const { user } = useAuth();
  const { unreadCount: notifUnread } = useNotifications(user?.id);

  const inboxUnread = topics?.reduce((sum, t) => sum + (t.unread_count || 0), 0) || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Inbox</h2>
        </div>
        <div className="flex gap-1 px-3 pb-2">
          {([
            { key: "threads" as const, label: "Threads", icon: Hash, badge: inboxUnread },
            { key: "notifications" as const, label: "Notifications", icon: Bell, badge: notifUnread },
            { key: "activity" as const, label: "Activity", icon: Activity, badge: 0 },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors",
                activeTab === tab.key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
              {tab.badge > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[9px] font-bold rounded-full bg-primary text-primary-foreground">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "threads" && (
          <>
            {isLoading ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
            ) : topics && topics.length > 0 ? (
              topics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => onSelectTopic(topic)}
                  className="w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                    <Hash className="h-3 w-3" />
                    <span>{topic.channel_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{topic.name}</span>
                    <span className="ml-auto flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                      {topic.unread_count}
                    </span>
                  </div>
                  {topic.last_message_preview && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {topic.last_sender_name && <span className="font-medium">{topic.last_sender_name}: </span>}
                      {topic.last_message_preview}
                    </p>
                  )}
                  {topic.last_message_at && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {formatDistanceToNow(new Date(topic.last_message_at), { addSuffix: true })}
                    </p>
                  )}
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">All caught up!</p>
                <p className="text-xs mt-0.5">No unread messages</p>
              </div>
            )}
          </>
        )}
        {activeTab === "notifications" && <WidgetNotificationsView />}
        {activeTab === "activity" && <WidgetActivityView />}
      </div>
    </div>
  );
}
