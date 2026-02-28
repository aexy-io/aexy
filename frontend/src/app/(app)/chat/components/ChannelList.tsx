"use client";

import { useState, useMemo } from "react";
import { useChannels, useJoinChannel, useInbox, useSetupChat } from "@/hooks/useChat";
import { useChatStore } from "@/stores/chatStore";
import { ChannelCreateDialog } from "./ChannelCreateDialog";
import { ChatChannel } from "@/lib/api";
import { Hash, Lock, Plus, Inbox, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelListProps {
  workspaceId: string;
  onSelectChannel: (channel: ChatChannel) => void;
  onSelectInbox: () => void;
  showInbox?: boolean;
}

export function ChannelList({ workspaceId, onSelectChannel, onSelectInbox, showInbox }: ChannelListProps) {
  const { data: channels, isLoading } = useChannels(workspaceId);
  const { data: inboxTopics } = useInbox(workspaceId);
  const [showCreate, setShowCreate] = useState(false);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const joinChannel = useJoinChannel(workspaceId);
  const setupChat = useSetupChat(workspaceId);

  // Compute per-channel unread counts from inbox data (server-side truth)
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (inboxTopics) {
      for (const topic of inboxTopics) {
        counts[topic.channel_id] = (counts[topic.channel_id] || 0) + topic.unread_count;
      }
    }
    return counts;
  }, [inboxTopics]);

  // Total unread across all channels for the inbox badge
  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);
  }, [unreadCounts]);

  const handleSelect = (channel: ChatChannel) => {
    if (!channel.is_member && channel.visibility === "public") {
      joinChannel.mutate(channel.id);
    }
    onSelectChannel(channel);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Channels</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="Create channel"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Inbox */}
      <button
        onClick={onSelectInbox}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors w-full text-left",
          showInbox && "bg-accent"
        )}
      >
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Inbox</span>
        {totalUnread > 0 && (
          <span className="ml-auto flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
            {totalUnread}
          </span>
        )}
      </button>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
        ) : channels && channels.length > 0 ? (
          channels.map((ch) => {
            const unread = unreadCounts[ch.id] || 0;
            return (
              <button
                key={ch.id}
                onClick={() => handleSelect(ch)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full text-left",
                  activeChannelId === ch.id && "bg-accent"
                )}
              >
                {ch.visibility === "private" ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className={cn("truncate", unread > 0 && "font-semibold")}>
                  {ch.name}
                </span>
                {unread > 0 && (
                  <span className="ml-auto flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                    {unread}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-8 flex flex-col items-center gap-3 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">Set up Team Chat</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a General channel to get started</p>
            </div>
            <button
              onClick={() => setupChat.mutate()}
              disabled={setupChat.isPending}
              className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setupChat.isPending ? "Setting up..." : "Get Started"}
            </button>
          </div>
        )}
      </div>

      <ChannelCreateDialog workspaceId={workspaceId} open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
