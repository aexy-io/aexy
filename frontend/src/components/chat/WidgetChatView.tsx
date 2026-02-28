"use client";

import { useState, useCallback } from "react";
import { useChannels, useTopics, useMessages, useSendMessage, useUploadFile, useInbox } from "@/hooks/useChat";
import { useChatWebSocketContext } from "@/contexts/ChatWebSocketContext";
import { useChatStore } from "@/stores/chatStore";
import { ChatChannel, ChatTopic, chatApi } from "@/lib/api";
import { MessageItem } from "@/app/(app)/chat/components/MessageItem";
import { MessageComposer } from "@/app/(app)/chat/components/MessageComposer";
import { MeetLinkButton } from "@/app/(app)/chat/components/MeetLinkButton";
import { TypingIndicator } from "@/app/(app)/chat/components/TypingIndicator";
import { Hash, Lock, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useMemo } from "react";

export function WidgetChatView() {
  const { workspaceId, isConnected, sendTyping, sendStopTyping } = useChatWebSocketContext();
  const { activeChannelId, activeTopicId, lastTopicName } = useChatStore();
  const { data: channels } = useChannels(workspaceId);
  const { data: inboxTopics } = useInbox(workspaceId);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(activeChannelId);
  const [selectedTopic, setSelectedTopic] = useState<{ id: string; name: string; channelId: string } | null>(
    activeTopicId && activeChannelId ? { id: activeTopicId, name: lastTopicName || "", channelId: activeChannelId } : null
  );

  // Per-channel unread counts
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (inboxTopics) {
      for (const t of inboxTopics) {
        counts[t.channel_id] = (counts[t.channel_id] || 0) + t.unread_count;
      }
    }
    return counts;
  }, [inboxTopics]);

  const handleSelectTopic = useCallback((topic: ChatTopic) => {
    setSelectedTopic({ id: topic.id, name: topic.name, channelId: topic.channel_id });
    useChatStore.getState().setActiveTopic(topic.id, topic.name);
  }, []);

  const handleToggleChannel = useCallback((channelId: string) => {
    setExpandedChannel((prev) => {
      const next = prev === channelId ? null : channelId;
      if (next) {
        const ch = channels?.find((c) => c.id === next);
        useChatStore.getState().setActiveChannel(next, ch?.slug);
      }
      return next;
    });
  }, [channels]);

  if (!workspaceId) return null;

  return (
    <div className="flex h-full">
      {/* Left sidebar — channels & topics */}
      <div className="w-[140px] flex-shrink-0 border-r border-border overflow-y-auto">
        {channels?.map((ch) => (
          <ChannelAccordion
            key={ch.id}
            channel={ch}
            workspaceId={workspaceId}
            expanded={expandedChannel === ch.id}
            unreadCount={unreadCounts[ch.id] || 0}
            onToggle={() => handleToggleChannel(ch.id)}
            onSelectTopic={handleSelectTopic}
            selectedTopicId={selectedTopic?.id}
          />
        ))}
      </div>

      {/* Right — message thread */}
      <div className="flex-1 min-w-0">
        {selectedTopic ? (
          <CompactMessageThread
            workspaceId={workspaceId}
            topicId={selectedTopic.id}
            channelId={selectedTopic.channelId}
            topicName={selectedTopic.name}
            isConnected={isConnected}
            onTyping={() => sendTyping(selectedTopic.id, selectedTopic.channelId)}
            onStopTyping={() => sendStopTyping(selectedTopic.id, selectedTopic.channelId)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
            Select a channel and topic to start chatting
          </div>
        )}
      </div>
    </div>
  );
}

// ── Channel accordion ──

function ChannelAccordion({
  channel,
  workspaceId,
  expanded,
  unreadCount,
  onToggle,
  onSelectTopic,
  selectedTopicId,
}: {
  channel: ChatChannel;
  workspaceId: string;
  expanded: boolean;
  unreadCount: number;
  onToggle: () => void;
  onSelectTopic: (t: ChatTopic) => void;
  selectedTopicId?: string;
}) {
  const { data: topics, isLoading } = useTopics(workspaceId, expanded ? channel.id : undefined);

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        {channel.visibility === "private" ? (
          <Lock className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Hash className="h-3 w-3 text-muted-foreground" />
        )}
        <span className={cn("truncate", unreadCount > 0 && "font-semibold")}>{channel.name}</span>
        {unreadCount > 0 && (
          <span className="ml-auto bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
            {unreadCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="pl-4">
          {isLoading ? (
            <div className="py-2 px-2 text-[10px] text-muted-foreground">Loading...</div>
          ) : topics && topics.length > 0 ? (
            topics.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTopic(t)}
                className={cn(
                  "w-full text-left px-2 py-1 text-[11px] truncate hover:bg-accent/50 rounded transition-colors",
                  selectedTopicId === t.id && "bg-accent font-medium"
                )}
              >
                {t.name}
              </button>
            ))
          ) : (
            <div className="py-2 px-2 text-[10px] text-muted-foreground">No topics</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compact message thread ──

function CompactMessageThread({
  workspaceId,
  topicId,
  channelId,
  topicName,
  isConnected,
  onTyping,
  onStopTyping,
}: {
  workspaceId: string;
  topicId: string;
  channelId: string;
  topicName: string;
  isConnected: boolean;
  onTyping: () => void;
  onStopTyping: () => void;
}) {
  const { data: messages, isLoading } = useMessages(workspaceId, topicId);
  const sendMessage = useSendMessage(workspaceId, topicId);
  const uploadFile = useUploadFile(workspaceId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      const last = messages[messages.length - 1];
      chatApi.markTopicRead(workspaceId, topicId, last.id).catch(() => {});
    }
  }, [workspaceId, topicId, messages]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage.mutate({ content });
    },
    [sendMessage]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      return await uploadFile.mutateAsync(file);
    },
    [uploadFile]
  );

  const handleMeetLink = useCallback(
    (link: string) => {
      handleSend(`Join Google Meet: ${link}`);
    },
    [handleSend]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-border px-3 py-2">
        <h4 className="font-medium text-xs truncate">{topicName}</h4>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="py-1">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} compact />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            No messages yet
          </div>
        )}
      </div>
      <TypingIndicator topicId={topicId} />
      <MessageComposer
        onSend={handleSend}
        onUploadFile={handleUpload}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        placeholder={`Message #${topicName}`}
        isConnected={isConnected}
        isSending={sendMessage.isPending}
        compact
        meetButton={
          <MeetLinkButton workspaceId={workspaceId} onMeetLink={handleMeetLink} />
        }
      />
    </div>
  );
}
