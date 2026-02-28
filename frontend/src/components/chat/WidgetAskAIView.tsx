"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Bot, User, Send, Loader2, Plus, History, Share2, Users, ArrowLeft, MessageCircle } from "lucide-react";
import { useChatWebSocketContext } from "@/contexts/ChatWebSocketContext";
import { useAskConversations, useCreateAskConversation, useAskConversation, useStreamMessage } from "@/hooks/useAsk";
import { useAuth } from "@/hooks/useAuth";
import { useAskStore } from "@/stores/askStore";
import { AskMessage, AskConversation } from "@/lib/api";
import { AskShareDialog } from "@/app/(app)/chat/components/AskShareDialog";
import { cn } from "@/lib/utils";

function WidgetToolCall({ name, status }: { name: string; status: string }) {
  const formatName = (n: string) =>
    n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/30 rounded text-[11px] my-1">
      <span className="text-purple-400 font-medium">{formatName(name)}</span>
      {status === "success" && <span className="text-green-400">done</span>}
      {status === "error" && <span className="text-red-400">failed</span>}
      {status === "pending" && <Loader2 className="h-2.5 w-2.5 text-purple-400 animate-spin" />}
    </div>
  );
}

function CompactMessage({ message }: { message: AskMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-1.5 mb-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-purple-500/10"
        )}
      >
        {isUser ? (
          <User className="h-3 w-3 text-primary" />
        ) : (
          <Bot className="h-3 w-3 text-purple-400" />
        )}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "text-right")}>
        {!isUser && message.tool_calls?.map((tc) => (
          <WidgetToolCall key={tc.id} name={tc.tool_name} status={tc.status} />
        ))}
        {message.content && (
          <div
            className={cn(
              "inline-block rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap max-w-[90%]",
              isUser ? "bg-purple-500 text-white" : "bg-accent text-foreground"
            )}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantAvatars({ participants }: { participants: Array<{ developer_name?: string | null; developer_avatar_url?: string | null }> }) {
  const maxShow = 3;
  const shown = participants.slice(0, maxShow);
  const overflow = participants.length - maxShow;

  return (
    <div className="flex -space-x-1.5">
      {shown.map((p, i) => (
        <div
          key={i}
          className="h-4.5 w-4.5 rounded-full bg-purple-500/20 border border-background flex items-center justify-center text-[8px] font-medium text-purple-400"
          title={p.developer_name || "Participant"}
        >
          {(p.developer_name || "?")[0].toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div className="h-4.5 w-4.5 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] font-medium text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function ConversationHistoryList({
  workspaceId,
  currentDeveloperId,
  activeConversationId,
  onSelect,
}: {
  workspaceId: string;
  currentDeveloperId?: string;
  activeConversationId: string | null;
  onSelect: (conv: AskConversation) => void;
}) {
  const { data: conversations, isLoading } = useAskConversations(workspaceId);

  const { ownConversations, sharedConversations } = useMemo(() => {
    const all = conversations || [];
    if (!currentDeveloperId) return { ownConversations: all, sharedConversations: [] };
    return {
      ownConversations: all.filter((c) => c.developer_id === currentDeveloperId),
      sharedConversations: all.filter((c) => c.developer_id !== currentDeveloperId),
    };
  }, [conversations, currentDeveloperId]);

  if (isLoading) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>;
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-3">
        <MessageCircle className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No conversations yet</p>
      </div>
    );
  }

  const renderItem = (conv: AskConversation) => (
    <button
      key={conv.id}
      onClick={() => onSelect(conv)}
      className={cn(
        "w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors flex items-center gap-2",
        activeConversationId === conv.id && "bg-accent"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-xs truncate flex-1">{conv.title || "Untitled"}</p>
          {conv.is_collaborative && <Users className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />}
        </div>
        <p className="text-[10px] text-muted-foreground">{conv.message_count} messages</p>
      </div>
    </button>
  );

  return (
    <div className="overflow-y-auto">
      {ownConversations.map(renderItem)}
      {sharedConversations.length > 0 && (
        <>
          <div className="px-3 py-1.5 mt-1 border-t border-border">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Users className="h-2.5 w-2.5" />
              Shared with me
            </div>
          </div>
          {sharedConversations.map(renderItem)}
        </>
      )}
    </div>
  );
}

export function WidgetAskAIView() {
  const { workspaceId } = useChatWebSocketContext();
  const { user } = useAuth();
  const currentDeveloperId = user?.id;
  const { data: conversations } = useAskConversations(workspaceId);
  const createConversation = useCreateAskConversation(workspaceId);
  const { activeConversationId, setActiveConversation } = useAskStore();

  const [showHistory, setShowHistory] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Auto-select or create conversation
  useEffect(() => {
    if (!activeConversationId && conversations && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, setActiveConversation]);

  const { data: conversation } = useAskConversation(workspaceId, activeConversationId);
  const { streamMessage, isStreaming } = useStreamMessage(workspaceId, activeConversationId);
  const { streamingText, streamingToolCalls } = useAskStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOwner = conversation && currentDeveloperId
    ? conversation.developer_id === currentDeveloperId
    : false;
  const isCollaborative = conversation?.is_collaborative || false;
  const participants = conversation?.participants || [];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingText, scrollToBottom]);

  const handleNewChat = async () => {
    const conv = await createConversation.mutateAsync(undefined);
    setActiveConversation(conv.id);
    setShowHistory(false);
  };

  const handleSelectConversation = (conv: AskConversation) => {
    setActiveConversation(conv.id);
    setShowHistory(false);
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    // Create conversation on first message if none exists
    if (!activeConversationId) {
      const conv = await createConversation.mutateAsync(undefined);
      setActiveConversation(conv.id);
      setInput("");
      // Pass the new conversation ID directly to avoid stale closure
      await streamMessage(content, conv.id);
      return;
    }

    setInput("");
    await streamMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = conversation?.messages || [];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center gap-1.5">
        {showHistory ? (
          <button
            onClick={() => setShowHistory(false)}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground"
            title="Back to chat"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Bot className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
        )}
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {showHistory ? "History" : conversation?.title || "AI Chat"}
        </span>

        {/* Participant avatars (in chat mode, when collaborative) */}
        {!showHistory && isCollaborative && participants.length > 1 && (
          <ParticipantAvatars participants={participants} />
        )}

        {/* Share button (in chat mode, for owners) */}
        {!showHistory && activeConversationId && isOwner && (
          <button
            onClick={() => setShowShareDialog(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="Share"
          >
            <Share2 className="h-3 w-3" />
          </button>
        )}

        {/* History button */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={cn(
            "p-1 rounded hover:bg-accent text-muted-foreground",
            showHistory && "bg-accent text-foreground"
          )}
          title="Conversation history"
        >
          <History className="h-3.5 w-3.5" />
        </button>

        {/* New chat button */}
        <button
          onClick={handleNewChat}
          disabled={createConversation.isPending}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* History list or Chat messages */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto">
          <ConversationHistoryList
            workspaceId={workspaceId!}
            currentDeveloperId={currentDeveloperId}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
          />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <Bot className="h-8 w-8 text-purple-400/30" />
                <p className="text-xs text-muted-foreground">
                  Ask me about your sprints, tasks, or tickets
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <CompactMessage key={msg.id} message={msg} />
            ))}

            {isStreaming && (
              <div className="flex gap-1.5 mb-2">
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-purple-500/10 flex items-center justify-center mt-0.5">
                  <Bot className="h-3 w-3 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  {streamingToolCalls.map((tc) => (
                    <WidgetToolCall key={tc.id} name={tc.name} status={tc.status} />
                  ))}
                  {streamingText ? (
                    <div className="inline-block rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap bg-accent text-foreground">
                      {streamingText}
                    </div>
                  ) : streamingToolCalls.length === 0 ? (
                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Thinking...
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 py-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                disabled={isStreaming}
                className="flex-1 text-xs rounded-md border border-border bg-background px-2.5 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                  input.trim() && !isStreaming
                    ? "bg-purple-500 text-white hover:bg-purple-600"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Share Dialog */}
      {activeConversationId && workspaceId && (
        <AskShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          workspaceId={workspaceId}
          conversationId={activeConversationId}
          conversationTitle={conversation?.title || null}
          isOwner={isOwner}
        />
      )}
    </div>
  );
}
