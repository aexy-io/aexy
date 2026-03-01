"use client";

import { useState, useMemo } from "react";
import { Plus, Bot, Trash2, MessageCircle, Search, Users } from "lucide-react";
import { useAskConversations, useDeleteAskConversation } from "@/hooks/useAsk";
import { AskConversation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AskAIViewProps {
  workspaceId: string;
  activeConversationId: string | null;
  onSelectConversation: (conv: AskConversation) => void;
  onNewConversation: () => void;
  currentDeveloperId?: string;
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
  currentDeveloperId,
}: AskAIViewProps) {
  const [search, setSearch] = useState("");
  const { data: conversations, isLoading } = useAskConversations(workspaceId, search || undefined);
  const deleteConversation = useDeleteAskConversation(workspaceId);

  // Split into own and shared conversations
  const { ownConversations, sharedConversations } = useMemo(() => {
    const all = conversations || [];
    if (!currentDeveloperId) return { ownConversations: all, sharedConversations: [] };
    return {
      ownConversations: all.filter((c) => c.developer_id === currentDeveloperId),
      sharedConversations: all.filter((c) => c.developer_id !== currentDeveloperId),
    };
  }, [conversations, currentDeveloperId]);

  const grouped = useMemo(() => groupByDate(ownConversations), [ownConversations]);
  const sharedGrouped = useMemo(() => groupByDate(sharedConversations), [sharedConversations]);

  const handleDelete = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    deleteConversation.mutate(convId);
  };

  const renderConversation = (conv: AskConversation, showDelete: boolean) => (
    <div
      key={conv.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelectConversation(conv)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectConversation(conv); }}
      className={cn(
        "w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors group flex items-center gap-2 cursor-pointer",
        activeConversationId === conv.id && "bg-accent"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm truncate flex-1">
            {conv.title || "Untitled"}
          </p>
          {conv.is_collaborative && (
            <Users className="h-3 w-3 text-purple-400 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{conv.message_count} messages</span>
          {conv.participant_count > 1 && (
            <span className="px-1 py-0 rounded bg-purple-500/10 text-purple-500 font-medium">
              {conv.participant_count}
            </span>
          )}
        </div>
      </div>
      {showDelete && (
        <button
          onClick={(e) => handleDelete(e, conv.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  const renderGroup = (label: string, convs: AskConversation[], showDelete: boolean) => (
    <div key={label}>
      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      {convs.map((conv) => renderConversation(conv, showDelete))}
    </div>
  );

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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
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
          <>
            {/* Own conversations */}
            {Object.entries(grouped).map(([label, convs]) =>
              renderGroup(label, convs, true)
            )}

            {/* Shared with me section */}
            {sharedConversations.length > 0 && (
              <>
                <div className="px-3 py-2 mt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <Users className="h-3 w-3" />
                    Shared with me
                  </div>
                </div>
                {Object.entries(sharedGrouped).map(([label, convs]) =>
                  renderGroup(label, convs, false)
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
