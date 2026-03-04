"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useMessages, useSendMessage, useUploadFile } from "@/hooks/useChat";
import { chatApi } from "@/lib/api";
import { MessageItem } from "./MessageItem";
import { MessageComposer } from "./MessageComposer";
import { MeetLinkButton } from "./MeetLinkButton";
import { TypingIndicator } from "./TypingIndicator";
import { Loader2 } from "lucide-react";

interface MessageThreadProps {
  workspaceId: string;
  topicId: string;
  channelId: string;
  topicName: string;
  isConnected?: boolean;
  onTyping?: () => void;
  onStopTyping?: () => void;
}

export function MessageThread({
  workspaceId,
  topicId,
  channelId,
  topicName,
  isConnected = true,
  onTyping,
  onStopTyping,
}: MessageThreadProps) {
  const { data: messages, isLoading } = useMessages(workspaceId, topicId);
  const sendMessage = useSendMessage(workspaceId, topicId);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const uploadFile = useUploadFile(workspaceId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const lastMarkReadRef = useRef("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Track scroll position to only auto-scroll when user is at bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  // Scroll to bottom on new messages (only if user was already at bottom)
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > prevMessageCountRef.current && isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = count;
  }, [messages]);

  // Mark topic as read when viewing (deduplicated by topic+message ID)
  useEffect(() => {
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const key = `${topicId}:${lastMsg.id}`;
      if (key !== lastMarkReadRef.current) {
        lastMarkReadRef.current = key;
        chatApi.markTopicRead(workspaceId, topicId, lastMsg.id).catch(() => {});
      }
    }
  }, [workspaceId, topicId, messages]);

  // Flush queued messages when connection restores
  useEffect(() => {
    if (isConnected && messageQueue.length > 0) {
      const queue = [...messageQueue];
      setMessageQueue([]);
      queue.forEach((content) => {
        sendMessageRef.current.mutate({ content }, {
          onError: () => {
            setSendError("Failed to send queued message. Please try again.");
          },
        });
      });
    }
  }, [isConnected, messageQueue]);

  const handleSend = useCallback(
    (content: string) => {
      setSendError(null);
      if (!isConnected) {
        // Queue the message for later
        setMessageQueue((prev) => [...prev, content]);
        return;
      }
      sendMessage.mutate(
        { content },
        {
          onError: () => {
            setSendError("Failed to send message. Please try again.");
          },
        }
      );
    },
    [sendMessage, isConnected]
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      const result = await uploadFile.mutateAsync(file);
      return result;
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
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <h3 className="font-semibold text-sm truncate">{topicName}</h3>
      </div>

      {/* Queued messages indicator */}
      {messageQueue.length > 0 && (
        <div className="px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
          {messageQueue.length} message{messageQueue.length > 1 ? "s" : ""} queued — will send when reconnected
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={containerRef} onScroll={handleScroll}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="py-2">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        )}
      </div>

      {/* Typing indicator */}
      <TypingIndicator topicId={topicId} />

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        onUploadFile={handleUploadFile}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        placeholder={`Message #${topicName}`}
        isConnected={isConnected}
        isSending={sendMessage.isPending}
        sendError={sendError}
        workspaceId={workspaceId}
        meetButton={
          <MeetLinkButton workspaceId={workspaceId} onMeetLink={handleMeetLink} />
        }
      />
    </div>
  );
}
