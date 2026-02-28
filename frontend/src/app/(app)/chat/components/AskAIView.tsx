"use client";

import { useMemo } from "react";
import { Plus, Bot, Trash2, MessageCircle } from "lucide-react";
import { useAskConversations, useCreateAskConversation, useDeleteAskConversation } from "@/hooks/useAsk";
import { AskConversation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AskAIViewProps {
  workspaceId: string;
  activeConversationId: string | null;
  onSelectConversation: (conv: AskConversation) => void;
  onNewConversation: () => void;
}

function groupByDate(conversations: AskConversation[]): Record<string, AskConversation[]> {
  const groups: Record<string, AskConversation[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const conv of conversations) {
    const date = new Date(conv.created_at);
    let label: string;

    if (date >= today) label = "Today";
    else if (date >= yesterday) label = "Yesterday";
    else if (date >= weekAgo) label = "This Week";
    else label = "Older";

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }
  return groups;
}

export function AskAIView({
  workspaceId,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: AskAIViewProps) {
  const { data: conversations, isLoading } = useAskConversations(workspaceId);
  const deleteConversation = useDeleteAskConversation(workspaceId);

  const grouped = useMemo(
    () => groupByDate(conversations || []),
    [conversations]
  );

  const handleDelete = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    deleteConversation.mutate(convId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold">AI Conversations</h3>
          </div>
          <button
            onClick={onNewConversation}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Start chatting with AI
              </p>
            </div>
            <button
              onClick={onNewConversation}
              className="px-3 py-1.5 text-xs rounded bg-purple-500 text-white hover:bg-purple-600"
            >
              New Chat
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([label, convs]) => (
            <div key={label}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
              </div>
              {convs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors group flex items-center gap-2",
                    activeConversationId === conv.id && "bg-accent"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {conv.title || "Untitled"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {conv.message_count} messages
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
